import { describe, expect, it, vi } from 'vitest';
import {
  getBalance,
  createCheckout,
  getOrderHistory,
  isConnected,
  setSpendCap,
  WalletNotConnectedError,
  getWalletBaseUrl,
} from './index.js';

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

describe('wallet facade', () => {
  it('isConnected false when no jwt', () => {
    expect(isConnected({ readJwt: () => undefined })).toBe(false);
  });

  it('isConnected true when jwt present', () => {
    expect(isConnected({ readJwt: () => 'tok' })).toBe(true);
  });

  it('getBalance throws WalletNotConnectedError when jwt missing', async () => {
    await expect(getBalance({ readJwt: () => undefined })).rejects.toBeInstanceOf(
      WalletNotConnectedError,
    );
  });

  it('createCheckout throws when jwt missing', async () => {
    await expect(
      createCheckout(
        { pack_id: 'pack_5', payment_method: 'card' },
        { readJwt: () => undefined },
      ),
    ).rejects.toBeInstanceOf(WalletNotConnectedError);
  });

  it('getBalance returns body when jwt present', async () => {
    const body = {
      wallet_id: 'w',
      balance: 1,
      monthly_cap_usd: null,
      spend_this_period_usd: 0,
      plan: 'free',
      plan_status: 'active',
    };
    const out = await getBalance({
      readJwt: () => 'tok',
      readBaseUrl: () => 'https://w',
      fetch: fakeFetch(body),
    });
    expect(out).toEqual(body);
  });

  it('createCheckout returns checkout url', async () => {
    const out = await createCheckout(
      { pack_id: 'pack_25', payment_method: 'alipay' },
      {
        readJwt: () => 'tok',
        readBaseUrl: () => 'https://w',
        fetch: fakeFetch({
          url: 'https://checkout.example/x',
          provider: 'stripe',
          session_id: 'cs_x',
        }),
      },
    );
    expect(out.url).toBe('https://checkout.example/x');
  });

  it('getOrderHistory returns orders array', async () => {
    const out = await getOrderHistory(20, {
      readJwt: () => 'tok',
      readBaseUrl: () => 'https://w',
      fetch: fakeFetch({ orders: [] }),
    });
    expect(out.orders).toEqual([]);
  });

  it('setSpendCap returns ok', async () => {
    const out = await setSpendCap(100, {
      readJwt: () => 'tok',
      readBaseUrl: () => 'https://w',
      fetch: fakeFetch({ ok: true }),
    });
    expect(out.ok).toBe(true);
  });

  it('getWalletBaseUrl prefers override > env > default', () => {
    const original = process.env.WALLET_API_URL;
    delete process.env.WALLET_API_URL;
    try {
      expect(
        getWalletBaseUrl({ readBaseUrl: () => 'https://override' }),
      ).toBe('https://override');

      process.env.WALLET_API_URL = 'https://env-url';
      expect(getWalletBaseUrl({})).toBe('https://env-url');
      // override still wins
      expect(
        getWalletBaseUrl({ readBaseUrl: () => 'https://override' }),
      ).toBe('https://override');
    } finally {
      if (original === undefined) delete process.env.WALLET_API_URL;
      else process.env.WALLET_API_URL = original;
    }
  });
});
