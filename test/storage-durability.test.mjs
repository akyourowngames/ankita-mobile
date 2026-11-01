import test from 'node:test';
import assert from 'node:assert/strict';
import { createTabKeyStore } from '../src/storage/tabKeys.ts';
import { assetDigest, collectAssetRefs, createAssetCodec } from '../src/storage/assets.ts';
import { initialState, restoreState } from '../src/core/state.ts';
import { emptyAssistantState, saveLibraryItem, restoreAssistantState } from '../src/assistant/records.ts';
import { importDocument, validateAsset } from '../src/assistant/files.ts';
import { restoreIncomingInbox } from '../src/sharing/inbox.ts';

const encoder = new TextEncoder(), clock = { id: () => 'doc-1', now: () => 1 };
const PDF_TEXT = '%PDF-1.7\nfixture bytes', PDF_BASE64 = Buffer.from(PDF_TEXT).toString('base64'), PDF_BYTES = Buffer.byteLength(PDF_TEXT);
function memoryPort() {
  const files = new Map();
  return { files, read: async ref => files.get(ref) ?? null, write: async (ref, data) => { files.set(ref, data); }, remove: async refs => { refs.forEach(ref => files.delete(ref)); }, list: async () => [...files.keys()] };
}
function stateWithPdf() {
  const pdf = importDocument({ name: 'paper.pdf', mimeType: 'application/pdf', bytes: encoder.encode(PDF_TEXT) });
  return saveLibraryItem(emptyAssistantState(), pdf, clock).state;
}
const pdfAsset = ref => ({ name: 'p.pdf', mimeType: 'application/pdf', data: '', bytes: PDF_BYTES, ref });
const mapStorage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });

test('browser credentials migrate from session storage into durable storage', () => {
  const durable = new Map(), legacy = new Map();
  legacy.set('chief.tab-secret.provider', 'fixture-secret');
  const store = createTabKeyStore(() => mapStorage(durable), () => mapStorage(legacy));
  assert.equal(store.get('provider'), 'fixture-secret', 'legacy session value is migrated');
  assert.equal(legacy.has('chief.tab-secret.provider'), false, 'legacy copy is removed after migration');
  assert.equal(createTabKeyStore(() => mapStorage(durable)).get('provider'), 'fixture-secret', 'a fresh runtime sees the key after a restart');
});
test('blocked browser storage keeps a memory fallback and never writes the legacy tier', () => {
  const legacy = new Map();
  const store = createTabKeyStore(() => { throw new Error('Blocked'); }, () => mapStorage(legacy));
  store.put('provider', 'fixture-secret');
  assert.equal(store.get('provider'), 'fixture-secret');
  assert.equal(legacy.size, 0);
});
test('document bytes are externalized out of the metadata JSON and hydrate after reload', async () => {
  const port = memoryPort(), codec = createAssetCodec(port);
  const stored = await codec.externalizeState({ ...initialState(), assistant: stateWithPdf() });
  const asset = stored.assistant.library[0].asset;
  assert.equal(asset.data, '', 'base64 bytes are removed from saved metadata');
  assert.match(asset.ref, /^a[0-9a-z]+-[0-9a-z]+-[0-9a-z]+$/);
  assert.ok(port.files.has(asset.ref), 'bytes are written to the asset store');
  const saved = JSON.stringify(stored);
  assert.equal(saved.includes(PDF_BASE64), false, 'the document never appears in the saved JSON');
  assert.equal(restoreState(saved).assistant.library[0].asset.data, '');
  const hydrated = await codec.hydrateState({ ...stored, assistant: restoreAssistantState(stored.assistant) });
  const restored = hydrated.assistant.library[0].asset;
  assert.equal(restored.data, PDF_BASE64, 'hydrated bytes are the real document');
  validateAsset(restored);
});
test('a missing asset store entry drops the inaccessible asset instead of inventing bytes', async () => {
  const port = memoryPort(), codec = createAssetCodec(port);
  const stored = await codec.externalizeState({ ...initialState(), assistant: stateWithPdf() });
  port.files.clear();
  const hydrated = await codec.hydrateState(stored);
  assert.equal(hydrated.assistant.library.length, 1, 'the record survives so the user still sees the document');
  assert.equal(hydrated.assistant.library[0].asset, undefined, 'no fabricated bytes');
});
test('assets referenced by work messages and the share inbox are protected from pruning', async () => {
  const port = memoryPort(), codec = createAssetCodec(port), ref = assetDigest(PDF_BASE64);
  const stored = await codec.externalizeState({ ...initialState(), assistant: stateWithPdf() });
  assert.deepEqual(collectAssetRefs(stored), [ref]);
  const inbox = { version: 1, seen: [], entries: [{ id: 'share-1-2', payload: { value: 'x', shareType: 'text' }, receivedAt: 1, input: { title: 't', content: 'c', kind: 'file', asset: pdfAsset(ref) } }] };
  assert.ok(collectAssetRefs(null, inbox).includes(ref));
  port.files.set(ref, PDF_BASE64); port.files.set('a1-1-1', 'orphan');
  await codec.prune(collectAssetRefs(stored, inbox));
  assert.ok(port.files.has(ref)); assert.equal(port.files.has('a1-1-1'), false);
});
test('the share inbox round-trips with externalized bytes', async () => {
  const ref = assetDigest(PDF_BASE64);
  const inbox = { version: 1, seen: [], entries: [{ id: 'share-1-2', payload: { value: 'x', shareType: 'text' }, receivedAt: 1, input: { title: 't', content: 'c', kind: 'file', asset: { ...pdfAsset(ref), data: PDF_BASE64 } } }] };
  const port = memoryPort(), codec = createAssetCodec(port);
  const stored = await codec.externalizeInbox(inbox);
  assert.equal(stored.entries[0].input.asset.data, '');
  assert.equal(stored.entries[0].input.asset.ref, ref);
  assert.equal(restoreIncomingInbox(JSON.stringify(stored)).entries[0].input.asset.data, '');
  const hydrated = await codec.hydrateInbox(stored);
  assert.equal(hydrated.entries[0].input.asset.data, PDF_BASE64);
});
