import fs from 'node:fs/promises';
import { readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
/** Refuse concurrent writers; never guess that another process is dead. */
export async function acquireWorkLease(root) {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const file = path.join(root, 'work.lock'), owner = `${process.pid}:${randomBytes(12).toString('hex')}`;
  let handle;
  try { handle = await fs.open(file, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Worker data is already in use. Stop its existing worker. After an unclean stop, verify no worker uses this directory before removing work.lock.'); throw error; }
  try { await handle.writeFile(owner); await handle.sync(); } finally { await handle.close(); }
  let released = false;
  return () => { if (released) return; try { if (readFileSync(file, 'utf8') === owner) unlinkSync(file); released = true; } catch (error) { if (error.code === 'ENOENT') released = true; } };
}
