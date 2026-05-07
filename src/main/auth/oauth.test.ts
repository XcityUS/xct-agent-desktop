import { describe, expect, it } from 'vitest';
import {
  buildAuthorizeUrl,
  buildXcityAuthorizeUrl,
  CALLBACK_URL,
  CUSTOM_PROTOCOL,
  deriveCodeChallenge,
  generateCodeVerifier,
  generateState,
  parseCallbackUrl,
  parseXcityCallback,
  PendingOAuthStore,
} from './oauth.js';
import { createHash } from 'crypto';

describe('oauth helpers', () => {
  it('generateCodeVerifier returns base64url string ~64 chars', () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });

  it('generateState returns short base64url string', () => {
    const s = generateState();
    expect(s).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(s.length).toBeGreaterThanOrEqual(20);
  });

  it('two consecutive verifiers are different (entropy check)', () => {
    expect(generateCodeVerifier()).not.toEqual(generateCodeVerifier());
  });

  it('deriveCodeChallenge = base64url(sha256(verifier))', () => {
    const v = 'fixed-verifier-aaaa-bbbb-cccc';
    const expected = createHash('sha256')
      .update(v)
      .digest('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(deriveCodeChallenge(v)).toBe(expected);
  });

  it('buildAuthorizeUrl sets all required params + uses default callback', () => {
    const url = buildAuthorizeUrl({
      authApiUrl: 'https://auth.xcity.one',
      provider: 'google',
      state: 's_abc',
      code_challenge: 'cc_xyz',
    });
    const u = new URL(url);
    expect(u.origin).toBe('https://auth.xcity.one');
    expect(u.pathname).toBe('/authorize');
    expect(u.searchParams.get('provider')).toBe('google');
    expect(u.searchParams.get('state')).toBe('s_abc');
    expect(u.searchParams.get('code_challenge')).toBe('cc_xyz');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('redirect_to')).toBe(CALLBACK_URL);
  });

  it('CUSTOM_PROTOCOL + CALLBACK_URL are stable', () => {
    expect(CUSTOM_PROTOCOL).toBe('xct-agent');
    expect(CALLBACK_URL).toBe('xct-agent://auth/callback');
  });

  it('parseCallbackUrl extracts tokens from fragment', () => {
    const url =
      'xct-agent://auth/callback#access_token=acc&refresh_token=ref&state=s1&expires_in=3600';
    const p = parseCallbackUrl(url);
    expect(p.access_token).toBe('acc');
    expect(p.refresh_token).toBe('ref');
    expect(p.state).toBe('s1');
    expect(p.expires_in).toBe(3600);
    expect(p.error).toBeNull();
  });

  it('parseCallbackUrl extracts error from query', () => {
    const url = 'xct-agent://auth/callback?error=access_denied&error_description=User+cancelled';
    const p = parseCallbackUrl(url);
    expect(p.error).toBe('access_denied');
    expect(p.error_description).toBe('User cancelled');
    expect(p.access_token).toBeNull();
  });

  it('parseCallbackUrl prefers fragment over query for same key', () => {
    const url = 'xct-agent://auth/callback?state=from_query#state=from_fragment';
    expect(parseCallbackUrl(url).state).toBe('from_fragment');
  });

  it('buildXcityAuthorizeUrl targets /oauth/authorize with OIDC params', () => {
    const url = buildXcityAuthorizeUrl({
      authApiUrl: 'https://auth.xcity.one/',
      clientId: 'client-uuid',
      state: 's_abc',
      code_challenge: 'cc_xyz',
    });
    const u = new URL(url);
    expect(u.origin).toBe('https://auth.xcity.one');
    expect(u.pathname).toBe('/oauth/authorize');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toBe('client-uuid');
    expect(u.searchParams.get('redirect_uri')).toBe(CALLBACK_URL);
    expect(u.searchParams.get('scope')).toBe('openid profile email');
    expect(u.searchParams.get('state')).toBe('s_abc');
    expect(u.searchParams.get('code_challenge')).toBe('cc_xyz');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('buildXcityAuthorizeUrl honors scope + redirect_uri overrides', () => {
    const url = buildXcityAuthorizeUrl({
      authApiUrl: 'https://auth.xcity.one',
      clientId: 'cli',
      state: 's',
      code_challenge: 'c',
      scope: 'openid email',
      redirect_uri: 'xct-agent://other/cb',
    });
    const u = new URL(url);
    expect(u.searchParams.get('scope')).toBe('openid email');
    expect(u.searchParams.get('redirect_uri')).toBe('xct-agent://other/cb');
  });

  it('parseXcityCallback extracts code + state from query', () => {
    const url = 'xct-agent://auth/callback?code=auth_code_123&state=s1';
    const p = parseXcityCallback(url);
    expect(p.code).toBe('auth_code_123');
    expect(p.state).toBe('s1');
    expect(p.error).toBeNull();
  });

  it('parseXcityCallback extracts error from query', () => {
    const url =
      'xct-agent://auth/callback?error=access_denied&error_description=User+cancelled&state=s1';
    const p = parseXcityCallback(url);
    expect(p.error).toBe('access_denied');
    expect(p.error_description).toBe('User cancelled');
    expect(p.code).toBeNull();
  });

  it('parseXcityCallback ignores fragment (OIDC code-flow uses query only)', () => {
    const url = 'xct-agent://auth/callback?code=qcode#code=fragment_code';
    expect(parseXcityCallback(url).code).toBe('qcode');
  });

  it('PendingOAuthStore tracks the OAuthFlow per entry', () => {
    const store = new PendingOAuthStore();
    const xcity = store.start('xcity');
    const google = store.start('google');
    expect(store.take(xcity.state)?.flow).toBe('xcity');
    expect(store.take(google.state)?.flow).toBe('google');
  });

  it('PendingOAuthStore.start + take is one-shot (returns then deletes)', () => {
    const store = new PendingOAuthStore();
    const entry = store.start('google');
    expect(entry.state).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(entry.code_verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(store.take(entry.state)).toEqual(entry);
    // Second take returns null — entry consumed.
    expect(store.take(entry.state)).toBeNull();
  });

  it('PendingOAuthStore.take returns null for unknown state', () => {
    const store = new PendingOAuthStore();
    store.start('google');
    expect(store.take('not-a-real-state')).toBeNull();
  });

  it('PendingOAuthStore expires entries past TTL', () => {
    let now = 1_000_000;
    const store = new PendingOAuthStore({ now: () => now });
    const entry = store.start('google');
    now += 5 * 60 * 1000 + 1; // past TTL
    expect(store.take(entry.state)).toBeNull();
  });

  it('PendingOAuthStore.size respects pruning', () => {
    let now = 1_000_000;
    const store = new PendingOAuthStore({ now: () => now });
    store.start('google');
    store.start('google');
    expect(store.size()).toBe(2);
    now += 5 * 60 * 1000 + 1;
    expect(store.size()).toBe(0);
  });

  it('PendingOAuthStore evicts oldest when over maxSize', () => {
    const store = new PendingOAuthStore({ maxSize: 2 });
    const first = store.start('google');
    store.start('google');
    store.start('google'); // should evict `first`
    expect(store.take(first.state)).toBeNull();
  });
});
