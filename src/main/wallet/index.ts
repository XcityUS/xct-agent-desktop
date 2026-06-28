/**
 * Main-process wallet facade.
 *
 * Wraps WalletClient with config plumbing so IPC handlers can call simple
 * functions instead of constructing clients. Reads:
 *   - WALLET_API_URL  (env var, highest priority)
 *   - walletApiUrl    (per-env yaml in config/env.<env>.yaml)
 *   - hard default `https://wallet.xcity.one` ONLY when env=production
 *     (any other env throws WalletConfigError so dev/staging never
 *     silently route to live wallet — Codex P1 fix)
 *   - walletJwt       (from secrets json; user-provided)
 *
 * setWalletJwt / clearWalletJwt persist to the secrets file so the
 * Settings UI can drive connect / disconnect without manual file edits
 * (Codex P1 fix).
 */

import { getSecrets, getConfig, getCurrentEnv, patchSecrets } from '../config-manager.js';
import * as authApi from '../auth/index.js';
import { WalletClient } from './client.js';
import type {
  AgentUsageReport,
  CheckoutSession,
  PaymentMethod,
  RechargePackId,
  WalletBalance,
  WalletOrder,
} from './types.js';

const DEFAULT_WALLET_BASE = 'https://wallet.xcity.one';

export class WalletNotConnectedError extends Error {
  constructor() {
    super('Wallet not connected — paste your Xcity access token in Settings');
    this.name = 'WalletNotConnectedError';
  }
}

export class WalletConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletConfigError';
  }
}

export interface WalletDeps {
  /** Override config readers. Used by tests. */
  readJwt?: () => string | undefined;
  readBaseUrl?: () => string | undefined;
  readEnv?: () => 'development' | 'staging' | 'production';
  /** Override fetch. Used by tests. */
  fetch?: typeof fetch;
  /** Override secret writes. Used by tests. */
  writeJwt?: (jwt: string | undefined) => void;
}

/**
 * Resolve the wallet API base URL. Priority:
 *   1. deps.readBaseUrl()    — for tests
 *   2. WALLET_API_URL env    — per-deployment override
 *   3. config/env.<env>.yaml `walletApiUrl`
 *   4. `https://wallet.xcity.one` BUT ONLY when env=production
 *
 * In dev/staging, missing config = hard error. This prevents fresh installs
 * with stale yaml configs from accidentally hitting production.
 */
export function getWalletBaseUrl(deps: WalletDeps = {}): string {
  const fromOverride = deps.readBaseUrl?.();
  if (fromOverride) return fromOverride;

  const fromEnv = process.env.WALLET_API_URL;
  if (fromEnv) return fromEnv;

  let envName: 'development' | 'staging' | 'production' = 'development';
  try {
    const cfg = getConfig();
    const cfgRecord = cfg as Record<string, unknown>;
    if (typeof cfgRecord.walletApiUrl === 'string' && cfgRecord.walletApiUrl) {
      return cfgRecord.walletApiUrl;
    }
    envName = (deps.readEnv?.() ?? getCurrentEnv()) as typeof envName;
  } catch {
    envName = deps.readEnv?.() ?? envName;
  }

  if (envName === 'production') return DEFAULT_WALLET_BASE;

  throw new WalletConfigError(
    `walletApiUrl not configured for env=${envName}. ` +
      `Set WALLET_API_URL env var, or add walletApiUrl to config/env.${envName}.yaml. ` +
      `Refusing to silently route ${envName} traffic to ${DEFAULT_WALLET_BASE}.`,
  );
}

export function readWalletJwt(deps: WalletDeps = {}): string | undefined {
  const v = deps.readJwt?.();
  if (v) return v;
  // Phase 6: prefer the auth session's access token. Only fall back to the
  // legacy paste-token (`walletJwt`) when no auth session is present, so
  // existing pre-Phase-6 installs don't break before they sign in.
  try {
    const authSession = authApi.getSession();
    if (authSession?.access_token) return authSession.access_token;
  } catch {
    /* auth not initialised — fall through */
  }
  try {
    const secrets = getSecrets() as Record<string, unknown>;
    const jwt = secrets.walletJwt;
    return typeof jwt === 'string' && jwt.length > 0 ? jwt : undefined;
  } catch {
    return undefined;
  }
}

/** Persist a wallet access token from the UI. Throws on obviously-bad input. */
export function setWalletJwt(jwt: string, deps: WalletDeps = {}): void {
  if (typeof jwt !== 'string') {
    throw new WalletConfigError('walletJwt must be a string');
  }
  const trimmed = jwt.trim();
  if (trimmed.length < 20) {
    throw new WalletConfigError('walletJwt looks too short to be a valid token');
  }
  if (deps.writeJwt) {
    deps.writeJwt(trimmed);
    return;
  }
  patchSecrets({ walletJwt: trimmed });
}

/** Disconnect the wallet (delete the persisted JWT). */
export function clearWalletJwt(deps: WalletDeps = {}): void {
  if (deps.writeJwt) {
    deps.writeJwt(undefined);
    return;
  }
  patchSecrets({ walletJwt: undefined });
}

async function getClient(deps: WalletDeps = {}): Promise<WalletClient> {
  // Phase 6: refresh the auth session in-place if it's near expiry. Best-
  // effort — if refresh fails for transient reasons, fall through to the
  // existing token (the wallet call may still succeed if expiry hasn't hit).
  try {
    await authApi.refreshIfNeeded();
  } catch {
    /* swallow — readWalletJwt below uses whatever's currently stored */
  }
  const jwt = readWalletJwt(deps);
  if (!jwt) throw new WalletNotConnectedError();
  return new WalletClient({
    baseUrl: getWalletBaseUrl(deps),
    jwt,
    fetch: deps.fetch,
  });
}

export async function getBalance(deps?: WalletDeps): Promise<WalletBalance> {
  return (await getClient(deps)).getBalance();
}

export async function createCheckout(
  params: {
    pack_id: RechargePackId;
    payment_method: PaymentMethod;
    success_url?: string;
    cancel_url?: string;
  },
  deps?: WalletDeps,
): Promise<CheckoutSession> {
  return (await getClient(deps)).createCheckout(params);
}

export async function getOrderHistory(
  limit?: number,
  deps?: WalletDeps,
): Promise<{ orders: WalletOrder[] }> {
  return (await getClient(deps)).getOrderHistory(limit);
}

export async function setSpendCap(
  monthly_cap_usd: number | null,
  deps?: WalletDeps,
): Promise<{ ok: true }> {
  return (await getClient(deps)).setSpendCap(monthly_cap_usd);
}

export async function reportAgentUsage(
  report: AgentUsageReport,
  deps?: WalletDeps,
): Promise<{ ok: true }> {
  return (await getClient(deps)).reportAgentUsage(report);
}

/**
 * Whether a wallet JWT is configured. UI uses this to gate the recharge /
 * orders pages behind a "connect your wallet" CTA.
 */
export function isConnected(deps?: WalletDeps): boolean {
  return Boolean(readWalletJwt(deps));
}

export { WalletApiError } from './client.js';
export type {
  AgentUsageReport,
  WalletBalance,
  WalletOrder,
  CheckoutSession,
  PaymentMethod,
  RechargePackId,
} from './types.js';
