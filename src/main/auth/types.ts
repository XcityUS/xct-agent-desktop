/**
 * Shared types for the GoTrue auth integration.
 *
 * Mirrors the slice of GoTrue's response we actually consume — no Supabase
 * SDK dependency. The shape is stable across GoTrue v2.x.
 */

export interface AuthUser {
  id: string;
  email: string | null;
  email_confirmed_at?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

export interface AuthSession {
  /** GoTrue access token (HS256 JWT). */
  access_token: string;
  /** GoTrue refresh token (long-lived; rotates on each refresh). */
  refresh_token: string;
  /** Unix seconds when the access token expires. */
  expires_at: number;
  /** Seconds-from-issue (informational; we use `expires_at` for refresh checks). */
  expires_in: number;
  /** Echoes "bearer". */
  token_type: "bearer";
  user: AuthUser;
}

/**
 * Result of a sign-up call. When GoTrue is configured with autoconfirm,
 * the response includes a session. Otherwise the user must verify their
 * email first and only `user` is populated.
 */
export type SignUpResult =
  | { kind: "session"; session: AuthSession }
  | { kind: "requires_verification"; user: AuthUser };

/**
 * Typed error from the auth layer. The `code` is stable across UI / IPC,
 * so the renderer can show localized strings without parsing messages.
 */
export type AuthErrorCode =
  /** Bad credentials (HTTP 400 invalid_grant from GoTrue). */
  | "invalid_credentials"
  /** Email already registered (HTTP 422). */
  | "email_already_registered"
  /** Password too weak per GoTrue config. */
  | "weak_password"
  /** Captcha / WAF blocked the request. */
  | "captcha_required"
  /** GoTrue rate limit. */
  | "rate_limited"
  /** OAuth state mismatch / CSRF. */
  | "oauth_state_mismatch"
  /** OAuth state expired (>5 min). */
  | "oauth_state_expired"
  /** OAuth redirect did not include tokens (provider denied). */
  | "oauth_no_tokens"
  /** Network failure / GoTrue unreachable. */
  | "network_error"
  /** GoTrue 5xx. */
  | "server_error"
  /** Refresh token revoked / expired. */
  | "refresh_failed"
  /** Validation issue (empty fields, malformed email). */
  | "invalid_input"
  /** Anything else. */
  | "unknown";

export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
