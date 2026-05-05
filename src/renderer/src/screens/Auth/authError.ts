/**
 * Maps a typed AuthError code coming from main process IPC into an
 * i18n key the UI can resolve. The renderer never displays raw GoTrue
 * messages — we always translate via this map.
 */

const CODE_TO_KEY: Record<string, string> = {
  invalid_credentials: "auth.errorInvalidCredentials",
  email_already_registered: "auth.errorEmailAlreadyRegistered",
  weak_password: "auth.errorWeakPassword",
  rate_limited: "auth.errorRateLimited",
  network_error: "auth.errorNetwork",
  server_error: "auth.errorServer",
  captcha_required: "auth.errorCaptcha",
  refresh_failed: "auth.errorRefreshFailed",
  oauth_state_mismatch: "auth.errorOauthStateExpired",
  oauth_state_expired: "auth.errorOauthStateExpired",
  oauth_no_tokens: "auth.errorOauthCancelled",
  invalid_input: "auth.errorUnknown",
};

export function authErrorKey(
  code: string | undefined | null,
  fallback = "auth.errorUnknown",
): string {
  if (!code) return fallback;
  return CODE_TO_KEY[code] ?? fallback;
}
