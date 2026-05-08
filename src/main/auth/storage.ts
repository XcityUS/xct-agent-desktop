/**
 * Persists the auth session into config/secrets.<env>.json via the
 * existing patchSecrets() helper. No new file IO — same pattern as
 * the Phase 5 walletJwt.
 *
 * v1 caveat: tokens land in plain JSON. The refresh token is long-lived
 * (~30 days), so disk compromise = account takeover. A follow-up PR
 * migrates to electron.safeStorage (Keychain / DPAPI / libsecret).
 *
 * The injectable `writer` dep makes this unit-testable without touching
 * the real config-manager singletons.
 */

import { getSecrets, patchSecrets } from "../config-manager.js";
import type { AuthSession } from "./types.js";

export interface PersistedSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  email: string | null;
  user_id: string;
}

export interface StorageDeps {
  /** Override patchSecrets for tests. Receives the same shape patchSecrets uses. */
  writer?: (patch: Record<string, string | undefined>) => void;
  /** Override getSecrets for tests. */
  reader?: () => Record<string, unknown>;
}

const KEY_ACCESS = "userAccessToken";
const KEY_REFRESH = "userRefreshToken";
const KEY_EXPIRES = "tokenExpiresAt";
const KEY_EMAIL = "userEmail";
const KEY_USER_ID = "userId";

export function loadSession(deps: StorageDeps = {}): PersistedSession | null {
  const secrets = deps.reader?.() ?? (getSecrets() as Record<string, unknown>);
  const access = secrets[KEY_ACCESS];
  const refresh = secrets[KEY_REFRESH];
  const expires = secrets[KEY_EXPIRES];
  const userId = secrets[KEY_USER_ID];
  if (
    typeof access !== "string" ||
    typeof refresh !== "string" ||
    typeof userId !== "string" ||
    !access ||
    !refresh ||
    !userId
  ) {
    return null;
  }
  const expiresAt =
    typeof expires === "string" ? Number(expires) : Number(expires ?? 0);
  return {
    access_token: access,
    refresh_token: refresh,
    expires_at: Number.isFinite(expiresAt) ? expiresAt : 0,
    email:
      typeof secrets[KEY_EMAIL] === "string"
        ? (secrets[KEY_EMAIL] as string)
        : null,
    user_id: userId,
  };
}

export function saveSession(
  session: AuthSession,
  deps: StorageDeps = {},
): void {
  const patch = {
    [KEY_ACCESS]: session.access_token,
    [KEY_REFRESH]: session.refresh_token,
    [KEY_EXPIRES]: String(session.expires_at),
    [KEY_EMAIL]: session.user.email ?? "",
    [KEY_USER_ID]: session.user.id,
  };
  if (deps.writer) {
    deps.writer(patch);
    return;
  }
  patchSecrets(patch);
}

export function clearSession(deps: StorageDeps = {}): void {
  const patch: Record<string, undefined> = {
    [KEY_ACCESS]: undefined,
    [KEY_REFRESH]: undefined,
    [KEY_EXPIRES]: undefined,
    [KEY_EMAIL]: undefined,
    [KEY_USER_ID]: undefined,
  };
  if (deps.writer) {
    deps.writer(patch);
    return;
  }
  patchSecrets(patch);
}

/**
 * Whether the persisted access token expires within the given leeway (in
 * seconds). Used by the facade to decide whether to call /token?refresh.
 */
export function isExpiringSoon(
  session: PersistedSession,
  leewaySeconds = 60,
  now: () => number = () => Math.floor(Date.now() / 1000),
): boolean {
  if (!session.expires_at) return true;
  return session.expires_at - leewaySeconds <= now();
}
