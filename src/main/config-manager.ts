/**
 * Config Manager — Multi-Environment Configuration System
 * Sprint 4: S4-BE-02
 *
 * Supports: development | staging | production
 * - env.yaml per environment
 * - Zod schema validation
 * - Keychain storage for secrets
 * - Runtime environment switching
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const EnvironmentSchema = z.object({
  env: z.enum(["development", "staging", "production"]),
  name: z.string(),
  apiBaseUrl: z.string().url(),
  cloudApiBaseUrl: z.string().url(),
  walletApiUrl: z.string().url().optional(),
  authApiUrl: z.string().url().optional(),
  authGoogleEnabled: z.boolean().optional(),
});

export type EnvConfig = z.infer<typeof EnvironmentSchema>;

const SecretsSchema = z.object({
  cloudApiKey: z.string().optional(),
  jwtSecret: z.string().optional(),
  /** @deprecated since Phase 6 — replaced by userAccessToken. Tolerated for migration. */
  walletJwt: z.string().optional(),
  /** Phase 6: GoTrue access token (HS256 JWT, short-lived ~5 min). */
  userAccessToken: z.string().optional(),
  /** Phase 6: GoTrue refresh token (long-lived, rotates each refresh). */
  userRefreshToken: z.string().optional(),
  /** Phase 6: Unix-seconds when userAccessToken expires. Stored as string for json safety. */
  tokenExpiresAt: z.string().optional(),
  /** Phase 6: cached email for the signed-in user (UI hint; truth is in JWT). */
  userEmail: z.string().optional(),
  /** Phase 6: GoTrue user id (uuid). */
  userId: z.string().optional(),
});

export type SecretsConfig = z.infer<typeof SecretsSchema>;

// ── Environment Config Loader ────────────────────────────────────────────────

let _currentEnv: "development" | "staging" | "production" = "development";
let _envConfig: EnvConfig | null = null;
let _secretsConfig: SecretsConfig | null = null;

function getEnvConfigPath(env: string): string {
  // Config dir: projectRoot/config/
  const projectRoot = dirname(dirname(__dirname)); // src/main → project root
  return join(projectRoot, "config", `env.${env}.yaml`);
}

function getSecretsPath(env: string): string {
  const projectRoot = dirname(dirname(__dirname));
  return join(projectRoot, "config", `secrets.${env}.json`);
}

function parseYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.includes(":")) continue;
    const eqIndex = trimmed.indexOf(":");
    const key = trimmed.substring(0, eqIndex).trim();
    let value: string | boolean | number = trimmed.substring(eqIndex + 1).trim();

    // Parse typed values
    if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (!isNaN(Number(value)) && value !== "") value = Number(value);
    else if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }
  return result;
}

export function loadEnvConfig(
  env: "development" | "staging" | "production" = _currentEnv,
): EnvConfig {
  const configPath = getEnvConfigPath(env);
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }
  const raw = parseYaml(readFileSync(configPath, "utf-8"));
  const parsed = EnvironmentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Config validation failed: ${parsed.error.message}\n` +
        `File: ${configPath}\n` +
        `Errors: ${JSON.stringify(parsed.error.format())}`,
    );
  }
  return parsed.data;
}

export function loadSecretsConfig(
  env: "development" | "staging" | "production" = _currentEnv,
): SecretsConfig {
  const secretsPath = getSecretsPath(env);
  if (!existsSync(secretsPath)) {
    return {};
  }
  try {
    const raw = JSON.parse(readFileSync(secretsPath, "utf-8"));
    const parsed = SecretsSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(
        `[ConfigManager] Secrets validation failed: ${parsed.error.message}`,
      );
      return {};
    }
    return parsed.data;
  } catch {
    return {};
  }
}

export function initConfig(
  env: "development" | "staging" | "production" = "development",
): void {
  _currentEnv = env;
  _envConfig = loadEnvConfig(env);
  _secretsConfig = loadSecretsConfig(env);
  console.log(`[ConfigManager] Initialized in ${env} mode`);
}

export function getConfig(): EnvConfig {
  if (!_envConfig) {
    initConfig();
  }
  return _envConfig!;
}

export function getSecrets(): SecretsConfig {
  if (!_secretsConfig) {
    _secretsConfig = loadSecretsConfig();
  }
  return _secretsConfig ?? {};
}

/**
 * Merge the given keys into the secrets file on disk and refresh the
 * in-memory cache. Pass `undefined` to delete a key. Used by the wallet
 * connect/disconnect flow so the JWT can be persisted from the UI.
 */
export function patchSecrets(patch: Partial<SecretsConfig>): SecretsConfig {
  const path = getSecretsPath(_currentEnv);
  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      existing = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      existing = {};
    }
  } else {
    mkdirSync(dirname(path), { recursive: true });
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) {
      delete existing[k];
    } else {
      existing[k] = v;
    }
  }
  writeFileSync(path, JSON.stringify(existing, null, 2), "utf-8");
  _secretsConfig = loadSecretsConfig(_currentEnv);
  return _secretsConfig;
}

export function getCurrentEnv(): "development" | "staging" | "production" {
  return _currentEnv;
}

export function switchEnv(
  env: "development" | "staging" | "production",
): void {
  if (_currentEnv === env) return;
  initConfig(env);
  console.log(`[ConfigManager] Switched to ${env}`);
}

// ── Environment File Templates ──────────────────────────────────────────────

export const DEFAULT_ENV_TEMPLATE: Record<string, string> = {
  development: `\
# Hermes Desktop — Development Environment Config
# Path: config/env.development.yaml

env: development
name: Hermes Dev
apiBaseUrl: http://localhost:3000
cloudApiBaseUrl: https://dev-api.hermes-desktop.ai
walletApiUrl: http://localhost:3010
authApiUrl: https://auth.xcity.one
authGoogleEnabled: false
`,

  staging: `\
# Hermes Desktop — Staging Environment Config
# Path: config/env.staging.yaml

env: staging
name: Hermes Staging
apiBaseUrl: https://staging-api.hermes-desktop.ai
cloudApiBaseUrl: https://staging-cloud.hermes-desktop.ai
walletApiUrl: https://staging-wallet.xcity.one
authApiUrl: https://auth.xcity.one
authGoogleEnabled: true
`,

  production: `\
# Hermes Desktop — Production Environment Config
# Path: config/env.production.yaml

env: production
name: Hermes Production
apiBaseUrl: https://api.hermes-desktop.ai
cloudApiBaseUrl: https://cloud.hermes-desktop.ai
walletApiUrl: https://wallet.xcity.one
authApiUrl: https://auth.xcity.one
authGoogleEnabled: true
`,
};

export const SECRETS_TEMPLATE: Record<string, string> = {
  development: `\
{
  "cloudApiKey": "",
  "jwtSecret": "dev-jwt-secret-change-in-prod",
  "walletJwt": ""
}
`,
  staging: `\
{
  "cloudApiKey": "",
  "jwtSecret": "",
  "walletJwt": ""
}
`,
  production: `\
{
  "cloudApiKey": "",
  "jwtSecret": "",
  "walletJwt": ""
}
`,
};
