// @lat: [[hermes-account-login#Account store]]
import { safeStorage } from "electron";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { profileHome, safeWriteFile } from "./utils";

// Persists the Hermes account session obtained via device login (see
// hermes-account.ts). The bearer access token is encrypted at rest with the OS
// keychain via Electron safeStorage — same approach as wallet-store.ts — and
// never leaves the main process. The renderer only ever sees the public profile.

const ACCOUNT_FILE = "account.json";

export interface AccountUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

interface StoredAccount {
  version: 1;
  apiUrl: string;
  encryptedAccessToken: string;
  user: AccountUser;
}

/** Public view the renderer receives — no token. */
export interface PublicAccount {
  apiUrl: string;
  user: AccountUser;
}

// profileHome() already normalizes the name (invalid/empty → default profile),
// so the store doesn't re-validate here.
function accountPath(profile?: string): string {
  return join(profileHome(profile), ACCOUNT_FILE);
}

function readAccountFile(profile?: string): StoredAccount | null {
  const file = accountPath(profile);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as Partial<StoredAccount>;
    if (
      parsed &&
      parsed.version === 1 &&
      typeof parsed.apiUrl === "string" &&
      typeof parsed.encryptedAccessToken === "string" &&
      parsed.user &&
      typeof parsed.user.id === "string"
    ) {
      return parsed as StoredAccount;
    }
  } catch {
    // Corrupt file: treat as signed out.
  }
  return null;
}

/** The signed-in account for a profile (without the token), or null. */
export function getAccount(profile?: string): PublicAccount | null {
  const stored = readAccountFile(profile);
  if (!stored) return null;
  return { apiUrl: stored.apiUrl, user: stored.user };
}

/** Decrypt and return the bearer token for authenticated backend calls, or null. */
export function getAccessToken(profile?: string): string | null {
  const stored = readAccountFile(profile);
  if (!stored) return null;
  try {
    return safeStorage.decryptString(
      Buffer.from(stored.encryptedAccessToken, "base64"),
    );
  } catch {
    return null;
  }
}

export function saveAccount(
  profile: string | undefined,
  data: { apiUrl: string; accessToken: string; user: AccountUser },
): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure storage is not available on this device.");
  }
  const stored: StoredAccount = {
    version: 1,
    apiUrl: data.apiUrl,
    encryptedAccessToken: safeStorage
      .encryptString(data.accessToken)
      .toString("base64"),
    user: data.user,
  };
  safeWriteFile(accountPath(profile), JSON.stringify(stored, null, 2));
}

/** Sign out: remove the stored account for a profile. */
export function clearAccount(profile?: string): void {
  const file = accountPath(profile);
  if (!existsSync(file)) return;
  try {
    unlinkSync(file);
  } catch {
    // Best-effort — the token is encrypted at rest regardless.
  }
}
