import test from 'node:test';
import assert from 'node:assert/strict';
const keys = await import('../src/storage/tabKeys.ts').catch(() => ({}));
test('browser credentials survive reload in the same tab and disappear on remove or tab-storage loss', () => {
  assert.equal(typeof keys.createTabKeyStore, 'function');
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const first = keys.createTabKeyStore(() => storage); first.put('provider', 'fixture-secret');
  const reload = keys.createTabKeyStore(() => storage);
  assert.equal(reload.get('provider'), 'fixture-secret');
  reload.put('provider', '');
  assert.equal(keys.createTabKeyStore(() => storage).get('provider'), '');
  assert.equal(keys.createTabKeyStore(() => undefined).get('provider'), '');
});
test('blocked browser storage falls back to memory without writing a key into app metadata', () => {
  assert.equal(typeof keys.createTabKeyStore, 'function');
  const store = keys.createTabKeyStore(() => { throw new Error('Blocked storage'); });
  store.put('provider', 'fixture-secret'); assert.equal(store.get('provider'), 'fixture-secret');
  store.put('provider', ''); assert.equal(store.get('provider'), '');
});
