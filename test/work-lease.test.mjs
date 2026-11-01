import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireWorkLease } from '../server/work-lease.mjs';
test('one CLI worker owns a data directory until its lease is released', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'work-lease-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const release = await acquireWorkLease(root); t.after(release);
  await assert.rejects(acquireWorkLease(root), /already in use/);
  release(); release(); const next = await acquireWorkLease(root); next();
});
