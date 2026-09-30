import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('unified account protocol and revocation against an isolated database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kanban-sso-'));
  try {
    const output = execFileSync(process.execPath, [fileURLToPath(new URL('./fixtures/sso-scenario.ts', import.meta.url))], { env: { ...process.env, DATABASE_URL: '', NODE_ENV: 'test', KANBAN_DATA_DIR: join(directory, 'postgres') }, encoding: 'utf8', timeout: 90000 });
    assert.match(output, /PASS SSO/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
