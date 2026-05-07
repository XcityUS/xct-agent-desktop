import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  getLiteLlmBearer,
  getSession,
  getSessionView,
  handleOAuthCallback,
  handleXcityCallback,
  isConfigured,
  on,
  recoverPassword,
  refreshIfNeeded,
  signIn,
  signOut,
  signUp,
  startOAuth,
  startXcityOAuth,
} from './index.js';
import { AuthError } from './types.js';
import { PendingOAuthStore } from './oauth.js';
import type { AuthSession, SignUpResult } from './types.js';

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    access_token: 'access_xyz',
    refresh_token: 'refresh_xyz',
    expires_at: 1_700_000_000,
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'user_1', email: 'e@x.com' },
    ...overrides,
  };
}

class FakeClient {
  signInImpl = vi.fn(async (_e: string, _p: string): Promise<AuthSession> => makeSession());
  signUpImpl = vi.fn(async (_e: string, _p: string): Promise<SignUpResult> => ({
    kind: 'session',
    session: makeSession(),
  }));
  refreshImpl = vi.fn(async (_r: string): Promise<AuthSession> =>
    makeSession({ access_token: 'fresh', refresh_token: 'fresh_ref' }),
  );
  exchangeOidcCodeImpl = vi.fn(
    async (_p: {
      code: string;
      code_verifier: string;
      client_id: string;
      redirect_uri: string;
    }): Promise<{
      access_token: string;
      refresh_token: string;
      expires_at?: number;
      expires_in: number;
      token_type: 'bearer';
    }> => ({
      access_token: 'oidc_acc',
      refresh_token: 'oidc_ref',
      expires_at: 1_700_000_000,
      expires_in: 3600,
      token_type: 'bearer',
    }),
  );
  exchangeOidcCode(p: {
    code: string;
    code_verifier: string;
    client_id: string;
    redirect_uri: string;
  }): Promise<{
    access_token: string;
    refresh_token: string;
    expires_at?: number;
    expires_in: number;
    token_type: 'bearer';
  }> {
    return this.exchangeOidcCodeImpl(p);
  }
  signOutImpl = vi.fn(async (_t: string): Promise<void> => undefined);
  recoverImpl = vi.fn(async (_e: string): Promise<void> => undefined);
  getUserImpl = vi.fn(async (_t: string) => ({ id: 'user_1', email: 'e@x.com' }));

  signIn(email: string, password: string): Promise<AuthSession> { return this.signInImpl(email, password); }
  signUp(email: string, password: string): Promise<SignUpResult> { return this.signUpImpl(email, password); }
  refresh(refresh: string): Promise<AuthSession> { return this.refreshImpl(refresh); }
  signOut(token: string): Promise<void> { return this.signOutImpl(token); }
  recoverPassword(email: string): Promise<void> { return this.recoverImpl(email); }
  getUser(token: string): Promise<{ id: string; email: string }> { return this.getUserImpl(token); }
}

function makeStorageDeps(): {
  store: Record<string, string>;
  reader: () => Record<string, unknown>;
  writer: (patch: Record<string, string | undefined>) => void;
} {
  const store: Record<string, string> = {};
  return {
    store,
    reader: () => store,
    writer: (patch) => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete store[k];
        else store[k] = v;
      }
    },
  };
}

beforeEach(() => {
  // No-op — every test passes its own deps.
});

describe('auth facade', () => {
  it('isConfigured true when AUTH_API_URL env set', () => {
    expect(isConfigured({ readBaseUrl: () => 'https://auth.x' })).toBe(true);
  });

  it('getSession null when nothing stored', () => {
    const { reader } = makeStorageDeps();
    expect(getSession({ reader })).toBeNull();
  });

  it('getSessionView signed_in=false when no session', () => {
    const { reader } = makeStorageDeps();
    const v = getSessionView({ reader });
    expect(v.signed_in).toBe(false);
    expect(v.email).toBeNull();
  });

  it('signIn persists session, emits, returns view', async () => {
    const { reader, writer, store } = makeStorageDeps();
    const client = new FakeClient() as unknown as import('./client.js').AuthClient;
    const emitter = new EventEmitter();
    const events: unknown[] = [];
    emitter.on('session-changed', (v) => events.push(v));
    const view = await signIn('e@x.com', 'pw', { client, reader, writer, emitter });
    expect(view.signed_in).toBe(true);
    expect(view.email).toBe('e@x.com');
    expect(store.userAccessToken).toBe('access_xyz');
    expect(events).toHaveLength(1);
  });

  it('signIn rejects empty email/password (invalid_input)', async () => {
    await expect(signIn('', 'pw', { writer: () => {} })).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(signIn('e@x', '', { writer: () => {} })).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });

  it('signIn surfaces AuthError from client', async () => {
    const { reader, writer } = makeStorageDeps();
    const fake = new FakeClient();
    fake.signInImpl.mockRejectedValueOnce(new AuthError('invalid_credentials', 400, 'bad'));
    await expect(
      signIn('e@x.com', 'pw', { client: fake as unknown as import('./client.js').AuthClient, reader, writer }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('signUp returns session result and persists when autoconfirm', async () => {
    const { reader, writer, store } = makeStorageDeps();
    const fake = new FakeClient();
    const r = await signUp('e@x.com', 'pw12345678', {
      client: fake as unknown as import('./client.js').AuthClient,
      reader,
      writer,
    });
    expect(r.kind).toBe('session');
    expect(store.userAccessToken).toBe('access_xyz');
  });

  it('signUp returns requires_verification without persisting', async () => {
    const { reader, writer, store } = makeStorageDeps();
    const fake = new FakeClient();
    fake.signUpImpl.mockResolvedValueOnce({
      kind: 'requires_verification',
      user: { id: 'u', email: 'e@x.com' },
    });
    const r = await signUp('e@x.com', 'pw', {
      client: fake as unknown as import('./client.js').AuthClient,
      reader,
      writer,
    });
    expect(r.kind).toBe('requires_verification');
    expect(store.userAccessToken).toBeUndefined();
  });

  it('signOut clears storage, emits, and best-effort calls /logout', async () => {
    const { reader, writer, store } = makeStorageDeps();
    Object.assign(store, {
      userAccessToken: 'access_xyz',
      userRefreshToken: 'refresh_xyz',
      tokenExpiresAt: '1700000000',
      userEmail: 'e@x.com',
      userId: 'user_1',
    });
    const fake = new FakeClient();
    const emitter = new EventEmitter();
    const events: unknown[] = [];
    emitter.on('session-changed', (v) => events.push(v));
    await signOut({
      client: fake as unknown as import('./client.js').AuthClient,
      reader,
      writer,
      emitter,
    });
    expect(store.userAccessToken).toBeUndefined();
    expect(events).toHaveLength(1);
    expect(fake.signOutImpl).toHaveBeenCalledWith('access_xyz');
  });

  it('signOut still clears storage if /logout fails', async () => {
    const { reader, writer, store } = makeStorageDeps();
    Object.assign(store, {
      userAccessToken: 'access_xyz',
      userRefreshToken: 'refresh_xyz',
      tokenExpiresAt: '1700000000',
      userEmail: 'e@x.com',
      userId: 'user_1',
    });
    const fake = new FakeClient();
    fake.signOutImpl.mockRejectedValueOnce(new AuthError('network_error', 0, 'down'));
    await signOut({
      client: fake as unknown as import('./client.js').AuthClient,
      reader,
      writer,
    });
    expect(store.userAccessToken).toBeUndefined();
  });

  it('refreshIfNeeded returns existing token when not near expiry', async () => {
    const { reader, writer, store } = makeStorageDeps();
    Object.assign(store, {
      userAccessToken: 'access_xyz',
      userRefreshToken: 'refresh_xyz',
      tokenExpiresAt: '2000',
      userEmail: 'e@x.com',
      userId: 'user_1',
    });
    const fake = new FakeClient();
    const tok = await refreshIfNeeded({
      client: fake as unknown as import('./client.js').AuthClient,
      reader,
      writer,
      now: () => 1500, // 500s away — far from 60s leeway
    });
    expect(tok).toBe('access_xyz');
    expect(fake.refreshImpl).not.toHaveBeenCalled();
  });

  it('refreshIfNeeded refreshes when within 60s leeway', async () => {
    const { reader, writer, store } = makeStorageDeps();
    Object.assign(store, {
      userAccessToken: 'old',
      userRefreshToken: 'old_ref',
      tokenExpiresAt: '2000',
      userEmail: 'e@x.com',
      userId: 'user_1',
    });
    const fake = new FakeClient();
    const tok = await refreshIfNeeded({
      client: fake as unknown as import('./client.js').AuthClient,
      reader,
      writer,
      now: () => 1950, // 50s before expiry
    });
    expect(tok).toBe('fresh');
    expect(fake.refreshImpl).toHaveBeenCalledWith('old_ref');
    expect(store.userAccessToken).toBe('fresh');
    expect(store.userRefreshToken).toBe('fresh_ref');
  });

  it('refreshIfNeeded clears session + emits when refresh_failed', async () => {
    const { reader, writer, store } = makeStorageDeps();
    Object.assign(store, {
      userAccessToken: 'old',
      userRefreshToken: 'old_ref',
      tokenExpiresAt: '2000',
      userEmail: 'e@x.com',
      userId: 'user_1',
    });
    const fake = new FakeClient();
    fake.refreshImpl.mockRejectedValueOnce(
      new AuthError('refresh_failed', 400, 'token revoked'),
    );
    const emitter = new EventEmitter();
    const events: unknown[] = [];
    emitter.on('session-changed', (v) => events.push(v));
    await expect(
      refreshIfNeeded({
        client: fake as unknown as import('./client.js').AuthClient,
        reader,
        writer,
        emitter,
        now: () => 1950,
      }),
    ).rejects.toMatchObject({ code: 'refresh_failed' });
    expect(store.userAccessToken).toBeUndefined();
    expect(events).toHaveLength(1);
  });

  it('refreshIfNeeded preserves session when error is not refresh_failed', async () => {
    const { reader, writer, store } = makeStorageDeps();
    Object.assign(store, {
      userAccessToken: 'old',
      userRefreshToken: 'old_ref',
      tokenExpiresAt: '2000',
      userEmail: 'e@x.com',
      userId: 'user_1',
    });
    const fake = new FakeClient();
    fake.refreshImpl.mockRejectedValueOnce(
      new AuthError('network_error', 0, 'down'),
    );
    await expect(
      refreshIfNeeded({
        client: fake as unknown as import('./client.js').AuthClient,
        reader,
        writer,
        now: () => 1950,
      }),
    ).rejects.toMatchObject({ code: 'network_error' });
    // Session is still there — user can retry.
    expect(store.userAccessToken).toBe('old');
  });

  it('refreshIfNeeded null when not signed in', async () => {
    const { reader, writer } = makeStorageDeps();
    expect(await refreshIfNeeded({ reader, writer })).toBeNull();
  });

  it('recoverPassword passes through to client', async () => {
    const fake = new FakeClient();
    await recoverPassword('e@x.com', {
      client: fake as unknown as import('./client.js').AuthClient,
    });
    expect(fake.recoverImpl).toHaveBeenCalledWith('e@x.com');
  });

  it('recoverPassword rejects empty email', async () => {
    await expect(recoverPassword('')).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('startOAuth produces a /authorize URL with state', () => {
    const pending = new PendingOAuthStore();
    const { url } = startOAuth('google', {
      readBaseUrl: () => 'https://auth.x',
      pending,
    });
    const u = new URL(url);
    expect(u.pathname).toBe('/authorize');
    expect(u.searchParams.get('provider')).toBe('google');
    expect(u.searchParams.get('state')).toBeTruthy();
    expect(pending.size()).toBe(1);
  });

  it('handleOAuthCallback rejects unknown state (CSRF)', async () => {
    const { reader, writer } = makeStorageDeps();
    const pending = new PendingOAuthStore();
    pending.start('google'); // a state exists, but not the one in URL
    const fake = new FakeClient();
    await expect(
      handleOAuthCallback(
        'xct-agent://auth/callback#access_token=a&refresh_token=r&state=NOT_REGISTERED',
        {
          client: fake as unknown as import('./client.js').AuthClient,
          reader,
          writer,
          pending,
        },
      ),
    ).rejects.toMatchObject({ code: 'oauth_state_expired' });
  });

  it('handleOAuthCallback rejects when error param present', async () => {
    const { reader, writer } = makeStorageDeps();
    const fake = new FakeClient();
    await expect(
      handleOAuthCallback(
        'xct-agent://auth/callback?error=access_denied&error_description=cancelled',
        {
          client: fake as unknown as import('./client.js').AuthClient,
          reader,
          writer,
        },
      ),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('handleOAuthCallback persists tokens + fetches user on happy path', async () => {
    const { reader, writer, store } = makeStorageDeps();
    const pending = new PendingOAuthStore();
    const entry = pending.start('google');
    const fake = new FakeClient();
    const view = await handleOAuthCallback(
      `xct-agent://auth/callback#access_token=acc&refresh_token=ref&expires_in=3600&state=${entry.state}`,
      {
        client: fake as unknown as import('./client.js').AuthClient,
        reader,
        writer,
        pending,
      },
    );
    expect(view.signed_in).toBe(true);
    expect(store.userAccessToken).toBe('acc');
    expect(store.userRefreshToken).toBe('ref');
    expect(fake.getUserImpl).toHaveBeenCalledWith('acc');
  });

  it('on() subscribes and returns an off() function', () => {
    const emitter = new EventEmitter();
    const events: unknown[] = [];
    const off = on('session-changed', (v) => events.push(v), { emitter });
    emitter.emit('session-changed', null);
    emitter.emit('session-changed', { x: 1 });
    expect(events).toHaveLength(2);
    off();
    emitter.emit('session-changed', null);
    expect(events).toHaveLength(2);
  });

  it('getLiteLlmBearer returns access_token+expires_at when fresh', async () => {
    const { reader, writer, store } = makeStorageDeps();
    Object.assign(store, {
      userAccessToken: 'access_xyz',
      userRefreshToken: 'refresh_xyz',
      tokenExpiresAt: '2000',
      userEmail: 'e@x.com',
      userId: 'user_1',
    });
    const fake = new FakeClient();
    const result = await getLiteLlmBearer({
      client: fake as unknown as import('./client.js').AuthClient,
      reader,
      writer,
      now: () => 1500, // far from expiry
    });
    expect(result).toEqual({ access_token: 'access_xyz', expires_at: 2000 });
    expect(fake.refreshImpl).not.toHaveBeenCalled();
  });

  it('getLiteLlmBearer returns not-signed-in when no session', async () => {
    const { reader, writer } = makeStorageDeps();
    const result = await getLiteLlmBearer({ reader, writer });
    expect(result).toEqual({ error: 'not-signed-in' });
  });

  it('getLiteLlmBearer triggers refresh + returns fresh token when expiring', async () => {
    const { reader, writer, store } = makeStorageDeps();
    Object.assign(store, {
      userAccessToken: 'old',
      userRefreshToken: 'old_ref',
      tokenExpiresAt: '2000',
      userEmail: 'e@x.com',
      userId: 'user_1',
    });
    const fake = new FakeClient();
    // FakeClient.refreshImpl returns access_token: 'fresh', expires_at: 1_700_000_000
    const result = await getLiteLlmBearer({
      client: fake as unknown as import('./client.js').AuthClient,
      reader,
      writer,
      now: () => 1950, // within 60s leeway → triggers refresh
    });
    expect(fake.refreshImpl).toHaveBeenCalledWith('old_ref');
    expect(result).toMatchObject({ access_token: 'fresh' });
    expect(store.userAccessToken).toBe('fresh');
  });

  it('startXcityOAuth builds /oauth/authorize URL + records pending state', () => {
    const pending = new PendingOAuthStore();
    const { url } = startXcityOAuth({
      readBaseUrl: () => 'https://auth.xcity.one',
      pending,
    });
    const u = new URL(url);
    expect(u.pathname).toBe('/oauth/authorize');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toMatch(/.+/);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    const state = u.searchParams.get('state')!;
    expect(pending.take(state)?.flow).toBe('xcity');
  });

  it('handleXcityCallback exchanges code + persists session + emits', async () => {
    const { reader, writer, store } = makeStorageDeps();
    const fake = new FakeClient();
    const pending = new PendingOAuthStore();
    const entry = pending.start('xcity');
    const url = `xct-agent://auth/callback?code=auth_code_xyz&state=${entry.state}`;
    const emitter = new EventEmitter();
    const events: unknown[] = [];
    emitter.on('session-changed', (v) => events.push(v));
    const view = await handleXcityCallback(url, {
      client: fake as unknown as import('./client.js').AuthClient,
      reader,
      writer,
      pending,
      emitter,
    });
    expect(view.signed_in).toBe(true);
    expect(fake.exchangeOidcCodeImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'auth_code_xyz',
        code_verifier: entry.code_verifier,
      }),
    );
    expect(store.userAccessToken).toBe('oidc_acc');
    expect(store.userRefreshToken).toBe('oidc_ref');
    expect(events).toHaveLength(1);
  });

  it('handleXcityCallback rejects state belonging to a non-xcity flow', async () => {
    const { reader, writer } = makeStorageDeps();
    const fake = new FakeClient();
    const pending = new PendingOAuthStore();
    // Caller registered a Google flow but the deep-link arrived as ?code= …
    const entry = pending.start('google');
    const url = `xct-agent://auth/callback?code=stolen_code&state=${entry.state}`;
    await expect(
      handleXcityCallback(url, {
        client: fake as unknown as import('./client.js').AuthClient,
        reader,
        writer,
        pending,
      }),
    ).rejects.toMatchObject({ code: 'oauth_state_mismatch' });
    expect(fake.exchangeOidcCodeImpl).not.toHaveBeenCalled();
  });

  it('handleXcityCallback surfaces upstream error param', async () => {
    const { reader, writer } = makeStorageDeps();
    const fake = new FakeClient();
    const url =
      'xct-agent://auth/callback?error=access_denied&error_description=User+cancelled';
    await expect(
      handleXcityCallback(url, {
        client: fake as unknown as import('./client.js').AuthClient,
        reader,
        writer,
      }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('getLiteLlmBearer returns refresh-failed when refresh throws', async () => {
    const { reader, writer, store } = makeStorageDeps();
    Object.assign(store, {
      userAccessToken: 'old',
      userRefreshToken: 'old_ref',
      tokenExpiresAt: '2000',
      userEmail: 'e@x.com',
      userId: 'user_1',
    });
    const fake = new FakeClient();
    fake.refreshImpl.mockRejectedValueOnce(
      new AuthError('refresh_failed', 400, 'token revoked'),
    );
    const result = await getLiteLlmBearer({
      client: fake as unknown as import('./client.js').AuthClient,
      reader,
      writer,
      now: () => 1950,
    });
    expect(result).toEqual({ error: 'refresh-failed' });
  });
});
