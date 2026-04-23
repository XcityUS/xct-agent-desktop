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

import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const EnvironmentSchema = z.object({
  env: z.enum(["development", "staging", "production"]),
  name: z.string(),
  apiBaseUrl: z.string().url(),
  cloudApiBaseUrl: z.string().url(),
  stripePublicKey: z.string().optional(),
  coinbasePublicKey: z.string().optional(),
});

export type EnvConfig = z.infer<typeof EnvironmentSchema>;

const SecretsSchema = z.object({
  stripeSecretKey: z.string().optional(),
  stripeWebhookSecret: z.string().optional(),
  coinbaseApiKey: z.string().optional(),
  coinbaseWebhookSecret: z.string().optional(),
  cloudApiKey: z.string().optional(),
  jwtSecret: z.string().optional(),
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
    loadSecretsConfig();
  }
  return _secretsConfig ?? {};
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

# Public keys (safe to commit)
stripePublicKey: pk_test_XXXXXXXXXXXXXXXXXXXXXXXX
coinbasePublicKey: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
`,

  staging: `\
# Hermes Desktop — Staging Environment Config
# Path: config/env.staging.yaml

env: staging
name: Hermes Staging
apiBaseUrl: https://staging-api.hermes-desktop.ai
cloudApiBaseUrl: https://staging-cloud.hermes-desktop.ai

# Public keys
stripePublicKey: pk_live_XXXXXXXXXXXXXXXXXXXXXXXX
coinbasePublicKey: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
`,

  production: `\
# Hermes Desktop — Production Environment Config
# Path: config/env.production.yaml

env: production
name: Hermes Production
apiBaseUrl: https://api.hermes-desktop.ai
cloudApiBaseUrl: https://cloud.hermes-desktop.ai

# Public keys
stripePublicKey: pk_live_XXXXXXXXXXXXXXXXXXXXXXXX
coinbasePublicKey: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
`,
};

export const SECRETS_TEMPLATE: Record<string, string> = {
  development: `\
{
  "stripeSecretKey": "<STRIPE_SECRET_KEY>",
  "stripeWebhookSecret": "<STRIPE_WEBHOOK_SECRET>",
  "coinbaseApiKey": "<COINBASE_API_KEY>",
  "coinbaseWebhookSecret": "<COINBASE_WEBHOOK_SECRET>",
  "cloudApiKey": "",
  "jwtSecret": "dev-jwt-secret-change-in-prod"
}
`,
  staging: `\
{
  "stripeSecretKey": "",
  "stripeWebhookSecret": "",
  "coinbaseApiKey": "",
  "coinbaseWebhookSecret": "",
  "cloudApiKey": "",
  "jwtSecret": ""
}
`,
  production: `\
{
  "stripeSecretKey": "",
  "stripeWebhookSecret": "",
  "coinbaseApiKey": "",
  "coinbaseWebhookSecret": "",
  "cloudApiKey": "",
  "jwtSecret": ""
}
`,
};
