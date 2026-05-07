/**
 * Main-process auth facade.
 *
 * Combines AuthClient (HTTP) + storage (persistence) + PendingOAuthStore
 * (OAuth state) into one surface that IPC handlers and the wallet
 * facade can consume.
 *
 * Emits 'session-changed' on every transition (sign-in / sign-out /
 * refresh / OAuth callback). Subscribers (the renderer via webContents,
 * the wallet client) can react.
 */

import { EventEmitter } from 'events';
import { getConfig } from '../config-manager.js';
import { AuthClient } from './client.js';
import {
  buildAuthorizeUrl,
  CALLBACK_URL,
  CUSTOM_PROTOCOL,
  deriveCodeChallenge,
  parseCallbackUrl,
  PendingOAuthStore,
} from './oauth.js';
import {
  clearSession as clearStored,
  isExpiringSoon,
  loadSession,
  saveSession,
  type PersistedSession,
  type StorageDeps,
} from './storage.js';
import { AuthError } from './types.js';
import type { AuthSession, AuthUser, SignUpResult } from './types.js';

const DEFAULT_AUTH_BASE = 'https://auth.xcity.one';

export class AuthNotConfiguredError extends Error {
  constructor() {
    super('Auth API URL not configured. Set authApiUrl in config/env.<env>.yaml.');
    this.name = 'AuthNotConfiguredError';
  }
}

export interface AuthDeps extends StorageDeps {
  /** Inject a pre-built client (tests). */
  client?: AuthClient;
  /** Override the resolved base URL (tests). */
  readBaseUrl?: () => string | undefined;
  /** Override `Date.now()/1000` (tests). */
  now?: () => number;
  /** Override the pending-OAuth store (tests). */
  pending?: PendingOAuthStore;
  /** Inject an event emitter (tests). */
  emitter?: EventEmitter;
}

let _client: AuthClient | null = null;
let _pending: PendingOAuthStore | null = null;
const _emitter = new EventEmitter();
_emitter.setMaxListeners(20);

function resolveBaseUrl(deps: AuthDeps = {}): string {
  const fromOverride = deps.readBaseUrl?.();
  if (fromOverride) return fromOverride;
  const fromEnv = process.env.AUTH_API_URL;
  if (fromEnv) return fromEnv;
  try {
    const cfg = getConfig() as Record<string, unknown>;
    if (typeof cfg.authApiUrl === 'string' && cfg.authApiUrl) {
      return cfg.authApiUrl;
    }
  } catch {
    /* config not yet initialized */
  }
  return DEFAULT_AUTH_BASE;
}

function getClient(deps: AuthDeps = {}): AuthClient {
  if (deps.client) return deps.client;
  if (!_client) {
    _client = new AuthClient({ baseUrl: resolveBaseUrl(deps) });
  }
  return _client;
}

function getPending(deps: AuthDeps = {}): PendingOAuthStore {
  if (deps.pending) return deps.pending;
  if (!_pending) _pending = new PendingOAuthStore();
  return _pending;
}

function getEmitter(deps: AuthDeps = {}): EventEmitter {
  return deps.emitter ?? _emitter;
}

function emitSessionChanged(deps: AuthDeps = {}): void {
  getEmitter(deps).emit('session-changed', getSession(deps));
}

// ─── Public surface ───────────────────────────────────────────────────────────

export function isConfigured(deps: AuthDeps = {}): boolean {
  return Boolean(resolveBaseUrl(deps));
}

export function getSession(deps: AuthDeps = {}): PersistedSession | null {
  return loadSession(deps);
}

export interface SessionView {
  signed_in: boolean;
  email: string | null;
  user_id: string | null;
  expires_at: number | null;
}

export function getSessionView(deps: AuthDeps = {}): SessionView {
  const s = getSession(deps);
  if (!s) {
    return { signed_in: false, email: null, user_id: null, expires_at: null };
  }
  return {
    signed_in: true,
    email: s.email,
    user_id: s.user_id,
    expires_at: s.expires_at,
  };
}

/**
 * Resolve the user's LiteLLM bearer for `tokenhub.xcity.one` calls.
 *
 * The wallet hook (`/v1/auth/hook/access-token`) injects `plan`,
 * `entitlements`, `wallet_id`, and `rate_limits` into every issued access
 * token, so the same token returned here is what tokenhub validates +
 * gates with. No separate xcity-home BFF round-trip is needed on desktop.
 *
 * Returns `{ access_token, expires_at }` (refreshed if expiring within 60s)
 * or `{ error }` for the renderer to handle. Never throws.
 */
export type LiteLlmBearerResult =
  | { access_token: string; expires_at: number }
  | { error: 'not-signed-in' | 'refresh-failed' };

export async function getLiteLlmBearer(
  deps: AuthDeps = {},
): Promise<LiteLlmBearerResult> {
  if (!getSession(deps)) {
    return { error: 'not-signed-in' };
  }
  try {
    const token = await refreshIfNeeded(deps);
    if (!token) return { error: 'not-signed-in' };
  } catch {
    return { error: 'refresh-failed' };
  }
  // refreshIfNeeded persists the new session on a successful refresh, so
  // re-read to pick up the matching expires_at.
  const fresh = getSession(deps);
  if (!fresh) return { error: 'not-signed-in' };
  return { access_token: fresh.access_token, expires_at: fresh.expires_at };
}

export async function signIn(
  email: string,
  password: string,
  deps: AuthDeps = {},
): Promise<SessionView> {
  if (!email || !password) {
    throw new AuthError('invalid_input', 0, 'email and password required');
  }
  const session = await getClient(deps).signIn(email.trim(), password);
  saveSession(session, deps);
  emitSessionChanged(deps);
  return projectView(session);
}

export async function signUp(
  email: string,
  password: string,
  deps: AuthDeps = {},
): Promise<SignUpResult> {
  if (!email || !password) {
    throw new AuthError('invalid_input', 0, 'email and password required');
  }
  const result = await getClient(deps).signUp(email.trim(), password);
  if (result.kind === 'session') {
    saveSession(result.session, deps);
    emitSessionChanged(deps);
  }
  return result;
}

export async function signOut(deps: AuthDeps = {}): Promise<void> {
  const stored = getSession(deps);
  clearStored(deps);
  emitSessionChanged(deps);
  if (stored?.access_token) {
    // Best-effort. Don't fail sign-out if server is down.
    try {
      await getClient(deps).signOut(stored.access_token);
    } catch {
      /* swallow */
    }
  }
}

export async function recoverPassword(
  email: string,
  deps: AuthDeps = {},
): Promise<void> {
  if (!email) throw new AuthError('invalid_input', 0, 'email required');
  await getClient(deps).recoverPassword(email.trim());
}

/**
 * Refresh the access token if it's within the leeway of expiry. Returns the
 * current valid access token (post-refresh if needed), or null if no session.
 *
 * Called by the wallet facade before every request.
 */
export async function refreshIfNeeded(
  deps: AuthDeps = {},
): Promise<string | null> {
  const stored = getSession(deps);
  if (!stored) return null;
  if (!isExpiringSoon(stored, 60, deps.now)) {
    return stored.access_token;
  }
  try {
    const fresh = await getClient(deps).refresh(stored.refresh_token);
    saveSession(fresh, deps);
    emitSessionChanged(deps);
    return fresh.access_token;
  } catch (e) {
    // Refresh token expired / revoked → drop the session, force re-login.
    if (e instanceof AuthError && e.code === 'refresh_failed') {
      clearStored(deps);
      emitSessionChanged(deps);
    }
    throw e;
  }
}

/**
 * Build the authorize URL for `provider` and remember pending state.
 * Caller (the IPC handler) is responsible for `shell.openExternal()`.
 */
export function startOAuth(
  provider: 'google',
  deps: AuthDeps = {},
): { url: string } {
  const baseUrl = resolveBaseUrl(deps);
  const entry = getPending(deps).start(provider);
  const url = buildAuthorizeUrl({
    authApiUrl: baseUrl,
    provider,
    state: entry.state,
    code_challenge: deriveCodeChallenge(entry.code_verifier),
    redirect_to: CALLBACK_URL,
  });
  return { url };
}

/**
 * Handle the deep-link callback URL. Verifies state, parses tokens,
 * persists, and emits session-changed.
 */
export async function handleOAuthCallback(
  rawUrl: string,
  deps: AuthDeps = {},
): Promise<SessionView> {
  const parsed = parseCallbackUrl(rawUrl);
  if (parsed.error) {
    throw new AuthError(
      parsed.error === 'access_denied' ? 'invalid_credentials' : 'unknown',
      0,
      parsed.error_description || parsed.error,
    );
  }
  if (!parsed.state) {
    throw new AuthError('oauth_state_mismatch', 0, 'callback missing state');
  }
  const entry = getPending(deps).take(parsed.state);
  if (!entry) {
    throw new AuthError(
      'oauth_state_expired',
      0,
      'OAuth state expired or unknown — start over',
    );
  }
  if (!parsed.access_token || !parsed.refresh_token) {
    throw new AuthError('oauth_no_tokens', 0, 'callback missing tokens');
  }
  // We don't have the user object from the callback fragment alone; fetch it.
  const user = await getClient(deps).getUser(parsed.access_token);
  const expiresAt =
    parsed.expires_at ??
    Math.floor(Date.now() / 1000) + (parsed.expires_in ?? 3600);
  const session: AuthSession = {
    access_token: parsed.access_token,
    refresh_token: parsed.refresh_token,
    expires_at: expiresAt,
    expires_in: parsed.expires_in ?? 3600,
    token_type: 'bearer',
    user,
  };
  saveSession(session, deps);
  emitSessionChanged(deps);
  return projectView(session);
}

export function on(
  event: 'session-changed',
  listener: (view: PersistedSession | null) => void,
  deps: AuthDeps = {},
): () => void {
  const e = getEmitter(deps);
  e.on(event, listener);
  return () => e.off(event, listener);
}

// ─── helpers ───────────────────────────────────────────────────────────────

function projectView(session: AuthSession): SessionView {
  return {
    signed_in: true,
    email: session.user.email,
    user_id: session.user.id,
    expires_at: session.expires_at,
  };
}

// Re-exports for IPC-layer convenience.
export { CUSTOM_PROTOCOL, CALLBACK_URL };
export { AuthError } from './types.js';
export type { AuthUser, AuthSession, SignUpResult, PersistedSession };
