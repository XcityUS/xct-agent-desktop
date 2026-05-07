/**
 * Google (and any future) OAuth helpers for the deep-link flow.
 *
 * Flow: renderer → main.startGoogleOAuth() → shell.openExternal()
 *   → user auths in browser → GoTrue redirects to xct-agent://auth/callback#...
 *   → OS routes URL to Electron → main.handleOAuthCallback(url)
 *
 * This module is pure (no IPC, no fs, no shell). It generates PKCE
 * verifiers + state, builds the authorize URL, parses the callback URL,
 * and tracks pending state via a tiny in-memory map.
 */

import { createHash, randomBytes } from 'crypto';

/** Custom URL scheme registered via app.setAsDefaultProtocolClient(). */
export const CUSTOM_PROTOCOL = 'xct-agent';
export const CALLBACK_URL = `${CUSTOM_PROTOCOL}://auth/callback`;

/**
 * Public OAuth client_id registered on auth.xcity.one for this app. Public
 * clients embed their client_id; PKCE provides the security guarantee. Set
 * `XCITY_OAUTH_CLIENT_ID` env to override (e.g. for a separate staging
 * GoTrue with its own client registration).
 */
export const XCITY_OAUTH_CLIENT_ID =
  process.env.XCITY_OAUTH_CLIENT_ID ??
  '72026ea8-7da1-4868-82ed-a6ab3cd354c8';

const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type OAuthFlow = 'google' | 'xcity';

export interface PendingOAuth {
  state: string;
  code_verifier: string;
  expires_at: number; // ms
  /**
   * Which return shape to expect on the callback:
   *  - 'google' → GoTrue's social-login flow puts tokens in the URL
   *    fragment (`#access_token=...&refresh_token=...`).
   *  - 'xcity'  → OIDC server flow puts a code in the query
   *    (`?code=...&state=...`); main exchanges it at `/oauth/token`.
   */
  flow: OAuthFlow;
}

export function generateCodeVerifier(): string {
  // base64url 64 chars (48 bytes raw → 64 chars after base64url-encode)
  return base64url(randomBytes(48));
}

export function generateState(): string {
  return base64url(randomBytes(24));
}

/**
 * S256 PKCE: code_challenge = base64url(sha256(verifier)).
 */
export function deriveCodeChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest());
}

export function buildAuthorizeUrl(params: {
  authApiUrl: string;
  provider: 'google';
  state: string;
  code_challenge: string;
  redirect_to?: string;
}): string {
  const u = new URL('/authorize', params.authApiUrl.replace(/\/+$/, ''));
  u.searchParams.set('provider', params.provider);
  u.searchParams.set('state', params.state);
  u.searchParams.set('code_challenge', params.code_challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('redirect_to', params.redirect_to ?? CALLBACK_URL);
  return u.toString();
}

/**
 * Build the OIDC-server authorize URL on auth.xcity.one. Distinct from
 * `buildAuthorizeUrl` (which targets GoTrue's social-login `/authorize`):
 * this hits `/oauth/authorize` and returns a `?code=` to the redirect_uri
 * after the user logs in / consents on the auth.xcity.one page.
 */
export function buildXcityAuthorizeUrl(params: {
  authApiUrl: string;
  clientId: string;
  state: string;
  code_challenge: string;
  redirect_uri?: string;
  scope?: string;
}): string {
  const u = new URL('/oauth/authorize', params.authApiUrl.replace(/\/+$/, ''));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', params.clientId);
  u.searchParams.set('redirect_uri', params.redirect_uri ?? CALLBACK_URL);
  u.searchParams.set('scope', params.scope ?? 'openid profile email');
  u.searchParams.set('state', params.state);
  u.searchParams.set('code_challenge', params.code_challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

export interface ParsedCallback {
  state: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  expires_in: number | null;
  error: string | null;
  error_description: string | null;
}

export interface ParsedXcityCallback {
  state: string | null;
  /** OIDC authorization code returned by /oauth/authorize. */
  code: string | null;
  error: string | null;
  error_description: string | null;
}

/**
 * Parse a deep-link callback URL. GoTrue puts tokens in the *fragment*
 * (`#access_token=...`), but errors in the *query* (`?error=...`).
 *
 * The Electron protocol handler receives the full URL including fragment;
 * URL.searchParams only sees the query. We parse both manually.
 */
export function parseCallbackUrl(rawUrl: string): ParsedCallback {
  const url = new URL(rawUrl);
  const query = url.searchParams;
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));

  const pickStr = (key: string): string | null => {
    const fromFrag = fragment.get(key);
    if (fromFrag) return fromFrag;
    const fromQuery = query.get(key);
    return fromQuery || null;
  };

  const expiresAtRaw = pickStr('expires_at');
  const expiresInRaw = pickStr('expires_in');

  return {
    state: pickStr('state'),
    access_token: pickStr('access_token'),
    refresh_token: pickStr('refresh_token'),
    expires_at: expiresAtRaw ? Number(expiresAtRaw) : null,
    expires_in: expiresInRaw ? Number(expiresInRaw) : null,
    error: pickStr('error'),
    error_description: pickStr('error_description'),
  };
}

/**
 * Parse an OIDC-server callback (xcity flow). Code + state are in the
 * query; error is also in the query (oauth2 spec).
 */
export function parseXcityCallback(rawUrl: string): ParsedXcityCallback {
  const url = new URL(rawUrl);
  const q = url.searchParams;
  return {
    state: q.get('state'),
    code: q.get('code'),
    error: q.get('error'),
    error_description: q.get('error_description'),
  };
}

/**
 * In-memory pending-OAuth map. Self-pruning on read; capped at 5 entries.
 * Single-process Electron — no need for shared storage.
 */
export class PendingOAuthStore {
  private readonly entries = new Map<string, PendingOAuth>();
  private readonly nowFn: () => number;
  private readonly maxSize: number;

  constructor(opts: { now?: () => number; maxSize?: number } = {}) {
    this.nowFn = opts.now ?? (() => Date.now());
    this.maxSize = opts.maxSize ?? 5;
  }

  start(flow: OAuthFlow): PendingOAuth {
    const code_verifier = generateCodeVerifier();
    const state = generateState();
    const entry: PendingOAuth = {
      state,
      code_verifier,
      expires_at: this.nowFn() + STATE_TTL_MS,
      flow,
    };
    this.prune();
    if (this.entries.size >= this.maxSize) {
      // Oldest first (Map preserves insertion order)
      const [oldest] = this.entries.keys();
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(state, entry);
    return entry;
  }

  /** Looks up + consumes (delete-on-take) the pending entry for this state. */
  take(state: string): PendingOAuth | null {
    this.prune();
    const entry = this.entries.get(state);
    if (!entry) return null;
    this.entries.delete(state);
    return entry;
  }

  size(): number {
    this.prune();
    return this.entries.size;
  }

  /** Tests-only; clear all pending entries. */
  clear(): void {
    this.entries.clear();
  }

  private prune(): void {
    const now = this.nowFn();
    for (const [k, v] of this.entries) {
      if (v.expires_at <= now) this.entries.delete(k);
    }
  }
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
