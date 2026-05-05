import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * patchSecrets writes/merges into config/secrets.<env>.json.
 *
 * The path is derived from `dirname(dirname(__dirname))`/config — i.e. the
 * project root inferred from the source file location. To test in isolation
 * we point process.cwd at a tmp dir AND symlink config/, but config-manager
 * uses __dirname so cwd doesn't matter.
 *
 * Instead we reuse the real config/ directory and:
 *   1. snapshot whatever is currently in secrets.development.json
 *   2. let patchSecrets mutate it
 *   3. assert the result, then restore the snapshot
 */

const PROJECT_ROOT = join(__dirname, '..', '..');
const SECRETS_DIR = join(PROJECT_ROOT, 'config');
const DEV_SECRETS_PATH = join(SECRETS_DIR, 'secrets.development.json');

let snapshot: string | null = null;

beforeEach(() => {
  if (existsSync(DEV_SECRETS_PATH)) {
    snapshot = readFileSync(DEV_SECRETS_PATH, 'utf-8');
  } else {
    snapshot = null;
  }
});

afterEach(() => {
  if (snapshot !== null) {
    writeFileSync(DEV_SECRETS_PATH, snapshot, 'utf-8');
  } else if (existsSync(DEV_SECRETS_PATH)) {
    rmSync(DEV_SECRETS_PATH);
  }
});

describe('config-manager.patchSecrets', () => {
  it('creates secrets file when missing and writes the patch', async () => {
    if (existsSync(DEV_SECRETS_PATH)) rmSync(DEV_SECRETS_PATH);
    if (!existsSync(SECRETS_DIR)) mkdirSync(SECRETS_DIR, { recursive: true });

    const { patchSecrets } = await import('./config-manager.js');
    patchSecrets({ walletJwt: 'test-token-aaaaaaaaaaaaaaaaaaaaaa' });

    expect(existsSync(DEV_SECRETS_PATH)).toBe(true);
    const written = JSON.parse(readFileSync(DEV_SECRETS_PATH, 'utf-8'));
    expect(written.walletJwt).toBe('test-token-aaaaaaaaaaaaaaaaaaaaaa');
  });

  it('merges patch into existing file without dropping unrelated keys', async () => {
    if (!existsSync(SECRETS_DIR)) mkdirSync(SECRETS_DIR, { recursive: true });
    writeFileSync(
      DEV_SECRETS_PATH,
      JSON.stringify({ cloudApiKey: 'pre-existing', jwtSecret: 'orig-secret' }),
      'utf-8',
    );

    const { patchSecrets } = await import('./config-manager.js');
    patchSecrets({ walletJwt: 'new-tok-aaaaaaaaaaaaaaaaaaaaaa' });

    const written = JSON.parse(readFileSync(DEV_SECRETS_PATH, 'utf-8'));
    expect(written.cloudApiKey).toBe('pre-existing');
    expect(written.jwtSecret).toBe('orig-secret');
    expect(written.walletJwt).toBe('new-tok-aaaaaaaaaaaaaaaaaaaaaa');
  });

  it('deletes a key when patched with undefined', async () => {
    if (!existsSync(SECRETS_DIR)) mkdirSync(SECRETS_DIR, { recursive: true });
    writeFileSync(
      DEV_SECRETS_PATH,
      JSON.stringify({ walletJwt: 'will-be-deleted', cloudApiKey: 'keep-me' }),
      'utf-8',
    );

    const { patchSecrets } = await import('./config-manager.js');
    patchSecrets({ walletJwt: undefined });

    const written = JSON.parse(readFileSync(DEV_SECRETS_PATH, 'utf-8'));
    expect(written.walletJwt).toBeUndefined();
    expect(written.cloudApiKey).toBe('keep-me');
  });

  it('refreshes the in-memory cache after patching', async () => {
    if (!existsSync(SECRETS_DIR)) mkdirSync(SECRETS_DIR, { recursive: true });
    writeFileSync(DEV_SECRETS_PATH, JSON.stringify({}), 'utf-8');

    const { patchSecrets, getSecrets } = await import('./config-manager.js');
    patchSecrets({ walletJwt: 'fresh-tok-aaaaaaaaaaaaaaaaaaaaaa' });

    const cached = getSecrets() as Record<string, unknown>;
    expect(cached.walletJwt).toBe('fresh-tok-aaaaaaaaaaaaaaaaaaaaaa');
  });

  it('survives a corrupt secrets file by overwriting', async () => {
    if (!existsSync(SECRETS_DIR)) mkdirSync(SECRETS_DIR, { recursive: true });
    writeFileSync(DEV_SECRETS_PATH, '{ this is not json', 'utf-8');

    const { patchSecrets } = await import('./config-manager.js');
    patchSecrets({ walletJwt: 'replacement-aaaaaaaaaaaaaaaa' });

    const written = JSON.parse(readFileSync(DEV_SECRETS_PATH, 'utf-8'));
    expect(written.walletJwt).toBe('replacement-aaaaaaaaaaaaaaaa');
  });
});
