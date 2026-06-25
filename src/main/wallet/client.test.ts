import { describe, expect, it, vi } from "vitest";
import { WalletApiError, WalletClient } from "./client.js";

function fakeFetch(
  responses: Array<{ status?: number; body?: unknown; text?: string }>,
): { fetch: typeof fetch; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const resp = responses.shift() ?? { status: 200, body: {} };
    const status = resp.status ?? 200;
    return new Response(
      resp.text !== undefined ? resp.text : JSON.stringify(resp.body ?? {}),
      {
        status,
        headers: { "content-type": "application/json" },
      },
    );
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

describe("WalletClient", () => {
  it("rejects empty baseUrl", () => {
    expect(() => new WalletClient({ baseUrl: "", jwt: "x" })).toThrow(
      /baseUrl required/,
    );
  });

  it("rejects empty jwt", () => {
    expect(() => new WalletClient({ baseUrl: "https://x", jwt: "" })).toThrow(
      /jwt required/,
    );
  });

  it("strips trailing slashes from baseUrl", async () => {
    const { fetch, calls } = fakeFetch([{ body: { wallet_id: "w" } }]);
    const c = new WalletClient({
      baseUrl: "https://wallet.xcity.one///",
      jwt: "tok",
      fetch,
    });
    await c.getBalance();
    expect(calls[0].url).toBe("https://wallet.xcity.one/v1/wallet/balance");
  });

  it("sends Bearer token on every request", async () => {
    const { fetch, calls } = fakeFetch([{ body: {} }]);
    const c = new WalletClient({
      baseUrl: "https://w",
      jwt: "mytoken",
      fetch,
    });
    await c.getBalance();
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer mytoken");
  });

  it("getBalance returns parsed body", async () => {
    const body = {
      wallet_id: "wallet_abc",
      balance: 1234,
      monthly_cap_usd: 200,
      spend_this_period_usd: 12.34,
      plan: "pro_monthly",
      plan_status: "active",
    };
    const { fetch } = fakeFetch([{ body }]);
    const c = new WalletClient({ baseUrl: "https://w", jwt: "t", fetch });
    const out = await c.getBalance();
    expect(out).toEqual(body);
  });

  it("createCheckout posts pack_id + payment_method as JSON", async () => {
    const { fetch, calls } = fakeFetch([
      {
        body: { url: "https://checkout", provider: "stripe", session_id: "s" },
      },
    ]);
    const c = new WalletClient({ baseUrl: "https://w", jwt: "t", fetch });
    const out = await c.createCheckout({
      pack_id: "pack_25",
      payment_method: "alipay",
    });
    expect(out.url).toBe("https://checkout");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      pack_id: "pack_25",
      payment_method: "alipay",
    });
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("getOrderHistory passes limit query", async () => {
    const { fetch, calls } = fakeFetch([{ body: { orders: [] } }]);
    const c = new WalletClient({ baseUrl: "https://w", jwt: "t", fetch });
    await c.getOrderHistory(10);
    expect(calls[0].url).toBe("https://w/v1/billing/orders?limit=10");
    expect(calls[0].init?.method).toBe("GET");
  });

  it("setSpendCap sends PUT", async () => {
    const { fetch, calls } = fakeFetch([{ body: { ok: true } }]);
    const c = new WalletClient({ baseUrl: "https://w", jwt: "t", fetch });
    await c.setSpendCap(150);
    expect(calls[0].init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      monthly_cap_usd: 150,
    });
  });

  it("throws WalletApiError with status + body on 4xx", async () => {
    const { fetch } = fakeFetch([
      { status: 402, body: { error: "insufficient_credits", balance: 0 } },
    ]);
    const c = new WalletClient({ baseUrl: "https://w", jwt: "t", fetch });
    await expect(c.getBalance()).rejects.toMatchObject({
      name: "WalletApiError",
      status: 402,
      message: "insufficient_credits",
    });
  });

  it("throws WalletApiError with generic message when body has no error field", async () => {
    const { fetch } = fakeFetch([
      { status: 500, text: "Internal Server Error" },
    ]);
    const c = new WalletClient({ baseUrl: "https://w", jwt: "t", fetch });
    const err = await c.getBalance().catch((e) => e);
    expect(err).toBeInstanceOf(WalletApiError);
    expect(err.status).toBe(500);
    expect(err.message).toMatch(/GET \/v1\/wallet\/balance failed: 500/);
  });

  it("does not send Content-Type on GET (no body)", async () => {
    const { fetch, calls } = fakeFetch([{ body: {} }]);
    const c = new WalletClient({ baseUrl: "https://w", jwt: "t", fetch });
    await c.getBalance();
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });
});
