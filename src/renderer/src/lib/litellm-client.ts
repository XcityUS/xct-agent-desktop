// Renderer-side client for tokenhub.xcity.one calls.
//
// Bearer comes from main via `window.hermesAPI.litellmGetBearer()` (IPC).
// The token is the user's xcity-auth access token, which the wallet hook
// has decorated with `plan`, `entitlements`, `wallet_id`, `rate_limits`
// claims — tokenhub validates + gates against those automatically.
//
// We cache the token in a module-level variable. The renderer is a single
// Chromium process for the desktop app, so the variable is naturally
// scoped to the app's lifetime; we deliberately do NOT use sessionStorage
// here (a) it adds nothing in single-window Electron, (b) it's an extra
// failure mode if the token ever survives across a renderer reload that
// shouldn't have surfaced. On a 401 we drop the cache and pull a fresh
// bearer from main, which handles refresh-token rotation transparently.

const TOKENHUB_BASE = "https://tokenhub.xcity.one";

/** Renderer cache of the active bearer. Cleared on 401 from tokenhub. */
interface CachedKey {
  token: string;
  /** Unix seconds; matches GoTrue's `expires_at` claim. */
  expires_at: number;
}

let cached: CachedKey | null = null;

/**
 * Resolve the user's tokenhub bearer. Hits IPC if no live cache, or if the
 * cached token is within 60s of expiry (we want a comfortable window so a
 * mid-flight request never expires server-side).
 *
 * Throws on `not-signed-in` / `refresh-failed`. Callers should catch and
 * route to the sign-in screen.
 */
export async function getLiteLlmKey(): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cached && nowSec < cached.expires_at - 60) {
    return cached.token;
  }
  const resp = await window.hermesAPI.litellmGetBearer();
  if ("error" in resp) {
    cached = null;
    throw new Error(`xcity auth: ${resp.error}`);
  }
  cached = { token: resp.access_token, expires_at: resp.expires_at };
  return resp.access_token;
}

export function clearLiteLlmKey(): void {
  cached = null;
}

/**
 * `GET /v1/models` filtered by the bearer's plan whitelist. Free user sees
 * a small set; pro/team users see more. Single retry on 401 — that almost
 * always means the user's plan rotated (Stripe webhook → new token).
 */
export async function listAllowedModels(): Promise<string[]> {
  const key = await getLiteLlmKey();
  const r = await fetch(`${TOKENHUB_BASE}/v1/models`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (r.status === 401) {
    clearLiteLlmKey();
    const fresh = await getLiteLlmKey();
    const r2 = await fetch(`${TOKENHUB_BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${fresh}` },
    });
    if (!r2.ok) throw new Error(`models list failed: ${r2.status}`);
    const body2 = (await r2.json()) as { data: Array<{ id: string }> };
    return body2.data.map((m) => m.id);
  }
  if (!r.ok) throw new Error(`models list failed: ${r.status}`);
  const body = (await r.json()) as { data: Array<{ id: string }> };
  return body.data.map((m) => m.id);
}

/**
 * `POST /v1/chat/completions` with the active bearer. Mirrors the OpenAI
 * request/response shape. Single retry on 401 (plan rotation handling).
 */
export async function callChatCompletion(
  payload: Record<string, unknown>,
): Promise<unknown> {
  const key = await getLiteLlmKey();
  const r = await fetch(`${TOKENHUB_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (r.status === 401) {
    clearLiteLlmKey();
    const fresh = await getLiteLlmKey();
    const r2 = await fetch(`${TOKENHUB_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fresh}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return r2.json();
  }
  return r.json();
}
