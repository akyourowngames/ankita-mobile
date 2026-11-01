import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import config from '../src/constants/work.json' with { type: 'json' };

// Encrypted snapshots are replaced atomically. The per-install key is a separate
// private file; neither key nor pairing credentials are printed or exported.
export async function openWorkStore(root) {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const keyPath = path.join(root, 'vault.key'), file = path.join(root, 'state.enc');
  let key;
  try { key = await fs.readFile(keyPath); }
  catch (error) { if (error.code !== 'ENOENT') throw error; key = randomBytes(32); try { await fs.writeFile(keyPath, key, { flag: 'wx', mode: 0o600 }); } catch (failure) { if (failure.code !== 'EEXIST') throw failure; key = await fs.readFile(keyPath); } }
  if (key.length !== 32) throw new Error('The work encryption key could not be read. Keep the existing files and restore the original key.');
  let state = { version: config.version, jobs: {}, devices: {}, outbox: {} };
  try {
    const encrypted = await fs.readFile(file, 'utf8');
    if (Buffer.byteLength(encrypted) > config.maxStateBytes * 2) throw new Error();
    const envelope = JSON.parse(encrypted), decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    state = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'));
    if (state.version !== config.version || !state.jobs || !state.devices || !state.outbox) throw new Error();
  } catch (error) { if (error.code !== 'ENOENT') throw new Error('Saved work could not be read. It has not been overwritten. Restore the worker data and key together.'); }
  let tail = Promise.resolve();
  return {
    read: () => structuredClone(state),
    change(update) {
      const pending = tail.catch(() => {}).then(async () => {
        const next = structuredClone(state); update(next);
        const json = Buffer.from(JSON.stringify(next));
        if (json.length > config.maxStateBytes) throw new Error('Work storage is full. Remove old work before submitting more.');
        const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
        const data = Buffer.concat([cipher.update(json), cipher.final()]);
        const envelope = JSON.stringify({ version: config.version, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
        const temp = path.join(root, `${randomBytes(12).toString('hex')}.tmp`);
        try {
          const handle = await fs.open(temp, 'wx', 0o600);
          try { await handle.writeFile(envelope); await handle.sync(); } finally { await handle.close(); }
          await fs.rename(temp, file); state = next;
        } finally { await fs.rm(temp, { force: true }); }
      });
      tail = pending; return pending;
    },
    flush: () => tail.catch(() => {}),
  };
}
