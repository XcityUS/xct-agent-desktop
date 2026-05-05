import { describe, expect, it, vi } from 'vitest';
import { AuthClient } from './client.js';
import { AuthError } from './types.js';

interface FakeResponseSpec {
  status?: number;
  body?: unknown;
  text?: string;
  network_error?: boolean;
}

function fakeFetch(responses: FakeResponseSpec[]): {
  fetch: typeof fetch;
  calls: Array<{ url: string; init?: RequestInit }>;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses.shift();
    if (!r) throw new Error('fakeFetch: ran out of responses');
    if (r.network_error) {
      throw new TypeError('network down');
    }
    const status = r.status ?? 200;
    const body =
      r.text !== undefined
        ? r.text
        : r.body === undefined
          ? ''
          : JSON.stringify(r.body);
    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

describe('AuthClient', () => {
  it('rejects empty baseUrl in constructor', () => {
    expect(() => new AuthClient({ baseUrl: '' })).toThrow(/baseUrl required/);
  });

  it('strips trailing slashes from baseUrl', async () => {
    const { fetch, calls } = fakeFetch([
      {
        body: {
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'u', email: 'e@x' },
        },
      },
    ]);
    const c = new AuthClient({ baseUrl: 'https://auth.xcity.one///', fetch });
    await c.signIn('e@x', 'pw');
    expect(calls[0].url).toBe('https://auth.xcity.one/token?grant_type=password');
  });

  it('signIn sends email+password as JSON body', async () => {
    const { fetch, calls } = fakeFetch([
      {
        body: {
          access_token: 'tok',
          refresh_token: 'ref',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'u', email: 'e@x' },
        },
      },
    ]);
    const c = new AuthClient({ baseUrl: 'https://a', fetch });
    await c.signIn('e@x', 'secret-pw');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      email: 'e@x',
      password: 'secret-pw',
    });
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBeUndefined();
  });

  it('signIn returns a parsed AuthSession with computed expires_at', async () => {
    const before = Math.floor(Date.now() / 1000);
    const { fetch } = fakeFetch([
      {
        body: {
          access_token: 'tok',
          refresh_token: 'ref',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'u', email: 'e@x' },
        },
      },
    ]);
    const c = new AuthClient({ baseUrl: 'https://a', fetch });
    const s = await c.signIn('e@x', 'pw');
    expect(s.access_token).toBe('tok');
    expect(s.refresh_token).toBe('ref');
    expect(s.expires_in).toBe(3600);
    expect(s.expires_at).toBeGreaterThanOrEqual(before + 3590);
  });

  it('signIn throws AuthError invalid_credentials on 400 invalid_grant', async () => {
    const { fetch } = fakeFetch([
      {
        status: 400,
        body: { error: 'invalid_grant', error_description: 'invalid login' },
      },
    ]);
    const c = new AuthClient({ baseUrl: 'https://a', fetch });
    await expect(c.signIn('e@x', 'wrong')).rejects.toMatchObject({
      name: 'AuthError',
      code: 'invalid_credentials',
      status: 400,
    });
  });

  it('signIn maps 429 to rate_limited', async () => {
    const { fetch } = fakeFetch([{ status: 429, body: { error: 'too many' } }]);
    const c = new AuthClient({ baseUrl: 'https://a', fetch });
    await expect(c.signIn('e@x', 'pw')).rejects.toMatchObject({
      code: 'rate_limited',
      status: 429,
    });
  });

  it('signIn maps 5xx to server_error', async () => {
    const { fetch } = fakeFetch([{ status: 503, text: 'down' }]);
    const c = new AuthClient({ baseUrl: 'https://a', fetch });
    await expect(c.signIn('e@x', 'pw')).rejects.toMatchObject({
      code: 'server_error',
    });
  });

  it('signIn wraps network errors as AuthError(network_error, 0)', async () => {
    const { fetch } = fakeFetch([{ network_error: true }]);
    const c = new AuthClient({ baseUrl: 'https://a', fetch });
    const err = await c.signIn('e@x', 'pw').catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe('network_error');
    expect(err.status).toBe(0);
  });

  it('refresh sends refresh_token to /token?grant_type=refresh_token', async () => {
    const { fetch, calls } = fakeFetch([
      {
        body: {
          access_token: 'tok2',
          refresh_token: 'ref2',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'u', email: 'e@x' },
        },
      },
    ]);
    const c = new AuthClient({ baseUrl: 'https://a', fetch });
    const s = await c.refresh('old_ref');
    expect(calls[0].url).toBe('https://a/token?grant_type=refresh_token');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      refresh_token: 'old_ref',
    });
    expect(s.access_token).toBe('tok2');
    expect(s.refresh_token).toBe('ref2');
  });

  it('refresh maps refresh-token-not-found to refresh_failed', async () => {
    const { fetch } = fakeFetch([
      { status: 400, body: { error: 'refresh token not found' } },
    ]);
    const c = new AuthClient({ baseUrl: 'https://a', fetch });
    await expect(c.refresh('bad')).rejects.toMatchObject({
      code: 'refresh_failed',
    });
  });

  it('signUp returns kind=session when GoTrue autoconfirms', async () => {
    const { fetch } = fakeFetch([
      {
        body: {
          access_token: 'tok',
          refresh_token: 'ref',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'u', email: 'new@x' },
        },
      },
    ]);
    const c = new AuthClient({ baseUrl: 'https://a', fetch });
    const r = await c.signUp('new@x', 'pw12345678');
    expect(r.kind).toBe('session');
  });

  it('signUp returns kind=requires_verification when no autoconfirm', async () => {
    const { fetch } = fakeFetch([
      { body: { id: 'u', email: 'new@x', email_confirmed_at: null } },
    ]);
    const c = new AuthClient({ baseUrl: 'https://a', fetch });
    const r = await c.signUp('new@x', 'pw12345678');
    expect(r.kind).toBe('requires_verification');
  });

  it('signUp 422 already registered → email_already_registered', async () => {
    const { fetch } = fakeFetch([
      { status: 422, body: { msg: 'User already registered' } },
    ]);
    const c = new AuthClient({ baseUrl: 'https://a', fetch });
    await expect(c.signUp('exists@x', 'pw12345678')).rejects.toMatchObject({
      code: 'email_already_registered',
      status: 422,
    });
  });

  it('signUp weak_password mapping', async () => {
    const { fetch } = fakeFetch([
      { status: 422, body: { msg: 'Password should be at least 8 characters' } },
    ]);
    const c = new AuthClient({ baseUrl: 'https://a', fetch });
    await expect(c.signUp('new@x', 'abc')).rejects.toMatchObject({
      code: 'weak_password',
    });
  });

  it('recoverPassword sends email; tolerates empty 200 body', async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, text: '' }]);
    const c = new AuthClient({ baseUrl: 'https://a', fetch });
    await expect(c.recoverPassword('e@x')).resolves.toBeUndefined();
    expect(calls[0].url).toBe('https://a/recover');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ email: 'e@x' });
  });

  it('signOut sends Bearer token', async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, text: '' }]);
    const c = new AuthClient({ baseUrl: 'https://a', fetch });
    await c.signOut('access_xyz');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer access_xyz');
  });

  it('getUser sends Bearer + parses response', async () => {
    const { fetch, calls } = fakeFetch([
      { body: { id: 'u', email: 'e@x', app_metadata: { plan: 'pro' } } },
    ]);
    const c = new AuthClient({ baseUrl: 'https://a', fetch });
    const u = await c.getUser('access_xyz');
    expect(u.id).toBe('u');
    expect(u.app_metadata).toEqual({ plan: 'pro' });
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer access_xyz',
    );
  });
});
