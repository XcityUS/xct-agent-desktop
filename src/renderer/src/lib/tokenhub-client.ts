// Renderer-side client for the Tokenhub Agent Marketplace + Skills Registry.
//
// Reuses the LiteLLM bearer-key flow in `litellm-client.ts` — the same
// `https://www.xcity.one/api/me/litellm-key` issues the bearer that tokenhub
// accepts on `Authorization: Bearer …`. We do NOT proxy through main; the
// renderer's Chromium can fetch tokenhub directly (CORS-allowed origin).
//
// On 401 we drop the cached key (Stripe webhook may have rotated it) and
// retry exactly once — same pattern as `callChatCompletion` in litellm-client.

import { getLiteLlmKey, clearLiteLlmKey } from "./litellm-client";

const TOKENHUB_BASE = "https://tokenhub.xcity.one";

export interface TokenhubAgent {
  id: string;
  name: string;
  description: string;
  category: string;
  author?: string;
  version?: string;
  /** Recommended default model when installed. */
  default_model?: string;
  /** Identifier used by `hermes profiles install <id>`, if available. */
  install_id?: string;
  installed?: boolean;
}

export interface TokenhubSkill {
  /** Tokenhub identifier — typically `<scope>/<name>` or `<name>`. */
  id: string;
  name: string;
  description: string;
  category: string;
  author?: string;
  version?: string;
  /** Identifier accepted by `hermes skills install`. Falls back to `id`. */
  install_id?: string;
}

interface ListResponse<T> {
  data: T[];
  total?: number;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = await getLiteLlmKey();
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${key}`);
  const url = path.startsWith("http") ? path : `${TOKENHUB_BASE}${path}`;
  const res = await fetch(url, { ...init, headers });
  if (res.status !== 401) return res;

  // Key may have been rotated by xcity-home. Clear cache and retry once.
  clearLiteLlmKey();
  const retryKey = await getLiteLlmKey();
  headers.set("Authorization", `Bearer ${retryKey}`);
  return fetch(url, { ...init, headers });
}

/**
 * List agents in the Tokenhub Agent Marketplace.
 *
 * `query` and `category` map to server-side filters. Both are optional;
 * client-side filtering is still applied so we can keep behaviour stable
 * when the backend ignores the params.
 */
export async function listTokenhubAgents(opts: {
  query?: string;
  category?: string;
  limit?: number;
} = {}): Promise<TokenhubAgent[]> {
  const params = new URLSearchParams();
  if (opts.query) params.set("q", opts.query);
  if (opts.category) params.set("category", opts.category);
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const res = await authedFetch(`/v1/agents${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    throw new Error(`tokenhub agents list failed: ${res.status}`);
  }
  const body = (await res.json()) as ListResponse<TokenhubAgent> | TokenhubAgent[];
  return Array.isArray(body) ? body : body.data ?? [];
}

/**
 * List skills in the Tokenhub Skills Registry. Used as a third-party source
 * alongside bundled + installed skills in the Skills screen.
 */
export async function listTokenhubSkills(opts: {
  query?: string;
  category?: string;
} = {}): Promise<TokenhubSkill[]> {
  const params = new URLSearchParams();
  if (opts.query) params.set("q", opts.query);
  if (opts.category) params.set("category", opts.category);
  const qs = params.toString();
  const res = await authedFetch(`/v1/skills${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    throw new Error(`tokenhub skills list failed: ${res.status}`);
  }
  const body = (await res.json()) as ListResponse<TokenhubSkill> | TokenhubSkill[];
  return Array.isArray(body) ? body : body.data ?? [];
}
