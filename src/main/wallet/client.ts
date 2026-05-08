/**
 * HTTP client for xct-wallet (https://wallet.xcity.one).
 *
 * All payment + balance state lives server-side; this module is the desktop
 * app's only wire to it. Stripe/Coinbase secrets never enter the desktop
 * binary anymore — the wallet service handles checkout and webhook fan-out.
 *
 * Auth: every call sends `Authorization: Bearer <user_jwt>`. JWT is issued
 * by xcity.one (GoTrue) and pasted by the user into the desktop app's
 * settings, or — in a later phase — fetched via PKCE OAuth device flow.
 */

import type {
  CheckoutSession,
  PaymentMethod,
  RechargePackId,
  WalletBalance,
  WalletOrder,
} from "./types.js";

export class WalletApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "WalletApiError";
  }
}

export interface WalletClientConfig {
  /** Base URL of the wallet service (no trailing slash). */
  baseUrl: string;
  /** User JWT issued by xcity.one (GoTrue). */
  jwt: string;
  /** Override for tests. */
  fetch?: typeof fetch;
}

export class WalletClient {
  private readonly baseUrl: string;
  private readonly jwt: string;
  private readonly _fetch: typeof fetch;

  constructor(config: WalletClientConfig) {
    if (!config.baseUrl) throw new Error("WalletClient: baseUrl required");
    if (!config.jwt) throw new Error("WalletClient: jwt required");
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.jwt = config.jwt;
    this._fetch = config.fetch ?? fetch;
  }

  async getBalance(): Promise<WalletBalance> {
    return this.request<WalletBalance>("GET", "/v1/wallet/balance");
  }

  async createCheckout(params: {
    pack_id: RechargePackId;
    payment_method: PaymentMethod;
    success_url?: string;
    cancel_url?: string;
  }): Promise<CheckoutSession> {
    return this.request<CheckoutSession>(
      "POST",
      "/v1/billing/checkout",
      params,
    );
  }

  async getOrderHistory(limit = 50): Promise<{ orders: WalletOrder[] }> {
    const qs = new URLSearchParams({ limit: String(limit) });
    return this.request<{ orders: WalletOrder[] }>(
      "GET",
      `/v1/billing/orders?${qs.toString()}`,
    );
  }

  async setSpendCap(monthly_cap_usd: number | null): Promise<{ ok: true }> {
    return this.request<{ ok: true }>("PUT", "/v1/billing/spend-cap", {
      monthly_cap_usd,
    });
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this._fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.jwt}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let errBody: unknown = undefined;
      try {
        errBody = await res.json();
      } catch {
        try {
          errBody = await res.text();
        } catch {
          /* empty */
        }
      }
      const msg =
        (errBody && typeof errBody === "object" && "error" in errBody
          ? String((errBody as { error: unknown }).error)
          : null) ?? `${method} ${path} failed: ${res.status}`;
      throw new WalletApiError(res.status, msg, errBody);
    }

    return (await res.json()) as T;
  }
}
