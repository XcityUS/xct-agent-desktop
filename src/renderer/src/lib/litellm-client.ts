// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  DO NOT WIRE THIS INTO THE RENDERER YET — DESKTOP USES A DIFFERENT FLOW
// ─────────────────────────────────────────────────────────────────────────────
//
// This module was authored for the browser sub-products on `*.xcity.one`
// (xct-chat, xct-flow, etc.) and reused here as a starting template. It
// CANNOT WORK in this Electron renderer as-is, because:
//
//   1. Electron renderer's origin is typically `file://...` (or a custom
//      app:// scheme). It is NOT a `*.xcity.one` origin, so the xcity-home
//      session cookie (`xct_session`, host-only on www.xcity.one) is never
//      attached on `fetch(..., { credentials: "include" })`.
//   2. Even if we hacked the origin (webSecurity: false / proxy through a
//      localhost dev server), the model leaks the user's bearer to renderer
//      memory with no consent moment, no per-app revoke, and no audit log.
//
// The planned, secure desktop-side approach is OAuth 2.0 Authorization Code
// with PKCE:
//
//   1. Renderer calls into main via IPC: "I need a bearer."
//   2. Main calls `shell.openExternal("https://www.xcity.one/oauth/authorize
//      ?client_id=xct-agent-desktop&redirect_uri=xct-agent-desktop://auth/callback
//      &code_challenge=<S256(verifier)>&state=<random>")`
//      → user's system browser shows the *real* xcity.one login + consent UI.
//   3. xcity.one redirects to `xct-agent-desktop://auth/callback?code=...`.
//      Main process receives it via the `app.setAsDefaultProtocolClient` hook,
//      exchanges code+verifier at `POST /api/oauth/token`, gets back a
//      LiteLLM bearer + refresh token.
//   4. Main encrypts the tokens with `safeStorage.encryptString()` (OS
//      keychain) and serves them to the renderer via IPC on demand.
//   5. xcity.one exposes a settings page where the user can revoke the
//      `xct-agent-desktop` grant — that flow is what this module loses.
//
// Until that flow lands, this file is a documentation stub. Do not import
// `getLiteLlmKey()` / `listAllowedModels()` / `callChatCompletion()` from
// any renderer component — the calls will throw or silently fail.
//
// Tracked separately under Xcity OAuth-flow task (TBD).
// ─────────────────────────────────────────────────────────────────────────────

const LITELLM_BASE = "https://tokenhub.xcity.one";
const KEY_ENDPOINT = "https://www.xcity.one/api/me/litellm-key";
const STORAGE_KEY = "litellm_key_v1";
const CACHE_TTL_MS = 30 * 60 * 1000;

interface CachedKey {
  key: string;
  expires: number;
}

interface ModelsResponse {
  data: Array<{ id: string }>;
}

let cached: CachedKey | null = null;

function readFromSessionStorage(): CachedKey | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  const stored = window.sessionStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as CachedKey;
    if (typeof parsed.key !== "string" || typeof parsed.expires !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeToSessionStorage(value: CachedKey): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function removeFromSessionStorage(): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * Resolve the current user's LiteLLM bearer.
 *
 * @deprecated Does not work in Electron renderer (file:// origin cannot
 * carry the xcity-home session cookie). Will be replaced by an IPC call
 * to main process that exposes a token obtained via OAuth 2.0 + PKCE.
 * See the file-level comment block above.
 */
export async function getLiteLlmKey(): Promise<string> {
  if (cached && Date.now() < cached.expires) return cached.key;

  const stored = readFromSessionStorage();
  if (stored && Date.now() < stored.expires) {
    cached = stored;
    return stored.key;
  }

  const response = await fetch(KEY_ENDPOINT, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`xcity auth failed: ${response.status}`);
  }
  const payload = (await response.json()) as { key: string };
  if (!payload.key) {
    throw new Error("xcity auth response missing `key`");
  }

  const next: CachedKey = {
    key: payload.key,
    expires: Date.now() + CACHE_TTL_MS,
  };
  cached = next;
  writeToSessionStorage(next);
  return next.key;
}

/**
 * Drop both the in-memory and `sessionStorage` cached LiteLLM key.
 *
 * Used after a 401 from tokenhub (the user's key was rotated by the
 * xcity-home Stripe webhook) so the next call re-fetches a fresh key.
 */
export function clearLiteLlmKey(): void {
  cached = null;
  removeFromSessionStorage();
}

/**
 * List the model IDs the current user is allowed to invoke through tokenhub.
 *
 * @deprecated See `getLiteLlmKey` — depends on a flow that does not work
 * in Electron renderer.
 */
export async function listAllowedModels(): Promise<string[]> {
  const key = await getLiteLlmKey();
  const response = await fetch(`${LITELLM_BASE}/v1/models`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    throw new Error(`models list failed: ${response.status}`);
  }
  const body = (await response.json()) as ModelsResponse;
  return body.data.map((m) => m.id);
}

/**
 * Forward a chat-completion payload to tokenhub.
 *
 * @deprecated See `getLiteLlmKey` — depends on a flow that does not work
 * in Electron renderer.
 */
export async function callChatCompletion(
  payload: Record<string, unknown>,
): Promise<unknown> {
  const key = await getLiteLlmKey();
  const response = await fetch(`${LITELLM_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (response.status === 401) {
    clearLiteLlmKey();
    const retryKey = await getLiteLlmKey();
    const retry = await fetch(`${LITELLM_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${retryKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return retry.json();
  }
  return response.json();
}
