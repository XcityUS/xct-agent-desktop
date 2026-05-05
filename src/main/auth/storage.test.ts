import { describe, expect, it } from 'vitest';
import { clearSession, isExpiringSoon, loadSession, saveSession } from './storage.js';
import type { AuthSession } from './types.js';

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    access_token: 'access_xyz',
    refresh_token: 'refresh_xyz',
    expires_at: 1_700_000_000,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'user_uuid_1',
      email: 'a@b.com',
    },
    ...overrides,
  };
}

describe('auth storage', () => {
  it('saveSession writes all five secret fields via writer', () => {
    const writes: Record<string, string | undefined>[] = [];
    saveSession(makeSession(), { writer: (p) => writes.push(p) });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({
      userAccessToken: 'access_xyz',
      userRefreshToken: 'refresh_xyz',
      tokenExpiresAt: '1700000000',
      userEmail: 'a@b.com',
      userId: 'user_uuid_1',
    });
  });

  it('saveSession serialises null email as empty string', () => {
    const writes: Record<string, string | undefined>[] = [];
    saveSession(makeSession({ user: { id: 'u', email: null } }), {
      writer: (p) => writes.push(p),
    });
    expect(writes[0].userEmail).toBe('');
  });

  it('loadSession returns null when no token persisted', () => {
    expect(loadSession({ reader: () => ({}) })).toBeNull();
  });

  it('loadSession returns null when only some fields present (refresh missing)', () => {
    expect(
      loadSession({
        reader: () => ({
          userAccessToken: 'a',
          userId: 'u',
        }),
      }),
    ).toBeNull();
  });

  it('loadSession returns null when access_token is empty string', () => {
    expect(
      loadSession({
        reader: () => ({
          userAccessToken: '',
          userRefreshToken: 'r',
          userId: 'u',
        }),
      }),
    ).toBeNull();
  });

  it('loadSession round-trips a saved session', () => {
    const stored: Record<string, string> = {};
    saveSession(makeSession(), {
      writer: (p) =>
        Object.entries(p).forEach(([k, v]) => {
          if (v === undefined) delete stored[k];
          else stored[k] = v;
        }),
    });
    const loaded = loadSession({ reader: () => stored });
    expect(loaded).toEqual({
      access_token: 'access_xyz',
      refresh_token: 'refresh_xyz',
      expires_at: 1_700_000_000,
      email: 'a@b.com',
      user_id: 'user_uuid_1',
    });
  });

  it('clearSession patches every key with undefined', () => {
    const writes: Record<string, string | undefined>[] = [];
    clearSession({ writer: (p) => writes.push(p) });
    expect(writes[0]).toEqual({
      userAccessToken: undefined,
      userRefreshToken: undefined,
      tokenExpiresAt: undefined,
      userEmail: undefined,
      userId: undefined,
    });
  });

  it('isExpiringSoon true when within leeway', () => {
    const s = {
      access_token: 'a',
      refresh_token: 'r',
      expires_at: 1000,
      email: null,
      user_id: 'u',
    };
    expect(isExpiringSoon(s, 60, () => 950)).toBe(true);
    expect(isExpiringSoon(s, 60, () => 940)).toBe(true);
  });

  it('isExpiringSoon false when more than leeway away', () => {
    const s = {
      access_token: 'a',
      refresh_token: 'r',
      expires_at: 1000,
      email: null,
      user_id: 'u',
    };
    expect(isExpiringSoon(s, 60, () => 800)).toBe(false);
    expect(isExpiringSoon(s, 60, () => 939)).toBe(false);
  });

  it('isExpiringSoon true when expires_at is 0 (no expiry recorded)', () => {
    const s = {
      access_token: 'a',
      refresh_token: 'r',
      expires_at: 0,
      email: null,
      user_id: 'u',
    };
    expect(isExpiringSoon(s)).toBe(true);
  });
});
