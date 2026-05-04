/**
 * Main-process wallet facade.
 *
 * Wraps WalletClient with config plumbing so IPC handlers can call simple
 * functions instead of constructing clients. Reads:
 *   - WALLET_API_URL  (env, fallback to env-config apiBaseUrl, fallback to https://wallet.xcity.one)
 *   - walletJwt       (from secrets store; user-provided)
 *
 * Throws if no JWT is configured — surfacing a "connect your wallet"
 * prompt in the UI.
 */

import { getSecrets, getConfig } from '../config-manager.js';
import { WalletClient } from './client.js';
import type {
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

export interface WalletDeps {
  /** Override config readers. Used by tests. */
  readJwt?: () => string | undefined;
  readBaseUrl?: () => string | undefined;
  /** Override fetch. Used by tests. */
  fetch?: typeof fetch;
}

export function getWalletBaseUrl(deps: WalletDeps = {}): string {
  const fromOverride = deps.readBaseUrl?.();
  if (fromOverride) return fromOverride;
  const fromEnv = process.env.WALLET_API_URL;
  if (fromEnv) return fromEnv;
  try {
    const cfg = getConfig();
    if ('walletApiUrl' in cfg && typeof (cfg as Record<string, unknown>).walletApiUrl === 'string') {
      return (cfg as Record<string, unknown>).walletApiUrl as string;
    }
  } catch {
    /* config not yet initialized */
  }
  return DEFAULT_WALLET_BASE;
}

export function readWalletJwt(deps: WalletDeps = {}): string | undefined {
  const v = deps.readJwt?.();
  if (v) return v;
  try {
    const secrets = getSecrets() as Record<string, unknown>;
    const jwt = secrets.walletJwt;
    return typeof jwt === 'string' && jwt.length > 0 ? jwt : undefined;
  } catch {
    return undefined;
  }
}

function getClient(deps: WalletDeps = {}): WalletClient {
  const jwt = readWalletJwt(deps);
  if (!jwt) throw new WalletNotConnectedError();
  return new WalletClient({
    baseUrl: getWalletBaseUrl(deps),
    jwt,
    fetch: deps.fetch,
  });
}

export async function getBalance(deps?: WalletDeps): Promise<WalletBalance> {
  return getClient(deps).getBalance();
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
  return getClient(deps).createCheckout(params);
}

export async function getOrderHistory(
  limit?: number,
  deps?: WalletDeps,
): Promise<{ orders: WalletOrder[] }> {
  return getClient(deps).getOrderHistory(limit);
}

export async function setSpendCap(
  monthly_cap_usd: number | null,
  deps?: WalletDeps,
): Promise<{ ok: true }> {
  return getClient(deps).setSpendCap(monthly_cap_usd);
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
  WalletBalance,
  WalletOrder,
  CheckoutSession,
  PaymentMethod,
  RechargePackId,
} from './types.js';
