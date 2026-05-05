/**
 * Thin HTTP wrapper around the GoTrue v2 endpoints we actually use.
 *
 * Mirrors the request/error pattern in src/main/wallet/client.ts so a
 * future `electron.safeStorage` migration can swap storage transparently
 * — the auth client itself stays storage-agnostic.
 *
 * Endpoints used (GoTrue defaults; all under the `authApiUrl` base):
 *   POST /token?grant_type=password         — sign in with email+password
 *   POST /token?grant_type=refresh_token    — refresh access token
 *   POST /signup                            — create account
 *   POST /recover                           — send recover-password email
 *   POST /logout                            — revoke refresh token
 *   GET  /user                              — fetch profile (Bearer auth)
 *
 * GoTrue's error shape is `{ error: string, error_description?: string,
 * msg?: string, error_code?: string }` and varies slightly by endpoint.
 * We map to a stable `AuthErrorCode` so the renderer doesn't have to
 * parse human strings.
 */

import { AuthError } from './types.js';
import type {
  AuthErrorCode,
  AuthSession,
  AuthUser,
  SignUpResult,
} from './types.js';

export interface AuthClientConfig {
  /** GoTrue base URL (e.g. https://auth.xcity.one). */
  baseUrl: string;
  /** Override for tests. */
  fetch?: typeof fetch;
}

export class AuthClient {
  private readonly baseUrl: string;
  private readonly _fetch: typeof fetch;

  constructor(config: AuthClientConfig) {
    if (!config.baseUrl) throw new Error('AuthClient: baseUrl required');
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this._fetch = config.fetch ?? fetch;
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const body = await this.request<RawTokenResponse>(
      'POST',
      '/token?grant_type=password',
      { email, password },
      undefined,
    );
    return parseSession(body);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const body = await this.request<RawTokenResponse>(
      'POST',
      '/token?grant_type=refresh_token',
      { refresh_token: refreshToken },
      undefined,
    );
    return parseSession(body);
  }

  async signUp(
    email: string,
    password: string,
    redirectTo?: string,
  ): Promise<SignUpResult> {
    const body = await this.request<RawSignUpResponse>(
      'POST',
      '/signup',
      {
        email,
        password,
        ...(redirectTo ? { data: { redirect_to: redirectTo } } : {}),
      },
      undefined,
    );
    // GoTrue returns either a full session (autoconfirm on) or just a user
    // (autoconfirm off → check email).
    if (body && typeof (body as RawTokenResponse).access_token === 'string') {
      return { kind: 'session', session: parseSession(body as RawTokenResponse) };
    }
    if (body && typeof (body as { id?: string }).id === 'string') {
      return {
        kind: 'requires_verification',
        user: body as AuthUser,
      };
    }
    throw new AuthError('unknown', 200, 'signUp: unexpected response shape', body);
  }

  async recoverPassword(email: string, redirectTo?: string): Promise<void> {
    await this.request<void>(
      'POST',
      '/recover',
      { email, ...(redirectTo ? { redirect_to: redirectTo } : {}) },
      undefined,
    );
  }

  async signOut(accessToken: string): Promise<void> {
    // GoTrue /logout is best-effort; we don't await its result strictly.
    await this.request<void>('POST', '/logout', undefined, accessToken);
  }

  async getUser(accessToken: string): Promise<AuthUser> {
    return this.request<AuthUser>('GET', '/user', undefined, accessToken);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    accessToken: string | undefined,
  ): Promise<T> {
    let res: Response;
    try {
      res = await this._fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new AuthError(
        'network_error',
        0,
        `${method} ${path}: network error`,
        e instanceof Error ? e.message : String(e),
      );
    }

    if (res.ok) {
      // /logout and /recover return 200 with no body; tolerate.
      const text = await res.text();
      if (!text) return undefined as unknown as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return undefined as unknown as T;
      }
    }

    let errBody: Record<string, unknown> = {};
    try {
      errBody = (await res.json()) as Record<string, unknown>;
    } catch {
      /* leave empty */
    }
    const code = mapErrorCode(res.status, errBody);
    const message =
      typeof errBody.msg === 'string'
        ? (errBody.msg as string)
        : typeof errBody.error_description === 'string'
          ? (errBody.error_description as string)
          : typeof errBody.error === 'string'
            ? (errBody.error as string)
            : `${method} ${path} failed: ${res.status}`;
    throw new AuthError(code, res.status, message, errBody);
  }
}

interface RawTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in: number;
  token_type: 'bearer';
  user: AuthUser;
}

interface RawSignUpResponse extends Partial<RawTokenResponse> {
  id?: string;
}

function parseSession(body: RawTokenResponse): AuthSession {
  const expiresAt =
    typeof body.expires_at === 'number'
      ? body.expires_at
      : Math.floor(Date.now() / 1000) + (body.expires_in || 3600);
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: expiresAt,
    expires_in: body.expires_in || 3600,
    token_type: 'bearer',
    user: body.user,
  };
}

function mapErrorCode(
  status: number,
  body: Record<string, unknown>,
): AuthErrorCode {
  const errCode = typeof body.error_code === 'string' ? body.error_code : '';
  const errMsg = typeof body.error === 'string' ? body.error.toLowerCase() : '';
  const errDesc =
    typeof body.error_description === 'string'
      ? body.error_description.toLowerCase()
      : '';
  const errHuman = typeof body.msg === 'string' ? body.msg.toLowerCase() : '';
  const haystack = `${errCode} ${errMsg} ${errDesc} ${errHuman}`;

  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  if (haystack.includes('captcha')) return 'captcha_required';
  if (haystack.includes('refresh') && haystack.includes('not found')) return 'refresh_failed';
  if (status === 400 && (haystack.includes('invalid_grant') || errCode === 'invalid_credentials')) {
    return 'invalid_credentials';
  }
  // weak_password wins over email_already_registered when the message
  // explicitly mentions password constraints — both can come back as 422.
  if ((haystack.includes('weak') || haystack.includes('password')) && (status === 422 || status === 400)) {
    return 'weak_password';
  }
  if (status === 422 || haystack.includes('already registered') || haystack.includes('already_registered')) {
    return 'email_already_registered';
  }
  if (status === 401) return 'invalid_credentials';
  return 'unknown';
}
