import test from 'node:test';
import assert from 'node:assert/strict';
import { createIncomingInbox, restoreIncomingInbox, sharedTextInput, webSharePayloads, mergeDraftAttachment, receiveNativeShares, readBoundedShareBytes, saveIncomingEntry, INBOX_LIMITS } from '../src/sharing/inbox.ts';
import { emptyAssistantState } from '../src/assistant/records.ts';

function fixture(options = {}) {
  let saved = null, fail = false, reads = 0;
  const storage = { get: async () => saved, set: async value => { if (fail) throw new Error('disk full'); saved = value; } };
  const inbox = createIncomingInbox({ storage, readFile: async payload => { reads++; return { name: 'brief.pdf', mimeType: payload.mimeType, bytes: new TextEncoder().encode('%PDF-1.7\nactual bytes') }; }, now: () => 100, ...options });
  return { inbox, storage, saved: () => saved, fail: value => { fail = value; }, reads: () => reads };
}
const text = { value: 'Keep this source', shareType: 'text', mimeType: 'text/plain' };
const pdf = { value: 'content://selected/document/9', shareType: 'file', mimeType: 'application/pdf' };

test('cold and warm shares survive reload and deduplicate mixed payloads with persisted actual bytes', async () => {
  const f = fixture();
  assert.equal(await f.inbox.capture([text, pdf, text]), true);
  assert.equal(f.inbox.snapshot().entries.length, 2);
  assert.match(f.inbox.snapshot().entries[1].input.asset.data, /^JVBER/);
  const reloaded = createIncomingInbox({ storage: f.storage, readFile: async () => { throw new Error('must not reread persisted file'); } });
  await reloaded.load();
  assert.equal(await reloaded.capture([pdf, text]), true);
  assert.equal(reloaded.snapshot().entries.length, 2);
});

test('native acknowledgement follows durable persistence and storage failure preserves recoverability', async () => {
  const f = fixture(); f.fail(true);
  await assert.rejects(f.inbox.capture([text]), /disk full/);
  assert.equal(f.inbox.snapshot().entries.length, 0);
  f.fail(false); assert.equal(await f.inbox.capture([text]), true);
  assert.equal(restoreIncomingInbox(f.saved()).entries.length, 1);
});

test('failed imports stay in inbox and withhold native acknowledgement until retry or explicit dismissal', async () => {
  let available = false;
  const f = fixture({ readFile: async () => { if (!available) throw new Error('permission lost'); return { name: 'photo.png', mimeType: 'image/png', bytes: Uint8Array.from([137,80,78,71,13,10,26,10]) }; } });
  assert.equal(await f.inbox.capture([pdf]), false);
  assert.match(f.inbox.snapshot().entries[0].error, /share.*again|Retry/i);
  available = true;
  await f.inbox.retry(f.inbox.snapshot().entries[0].id);
  assert.equal(await f.inbox.capture([pdf]), true);
  await f.inbox.dismiss(f.inbox.snapshot().entries[0].id);
  assert.equal(await f.inbox.capture([pdf]), true);
  assert.equal(f.inbox.snapshot().entries.length, 0);
});

test('text and URL shares are bounded data; invalid URLs never become links or fetches', () => {
  assert.equal(sharedTextInput(text).content, text.value);
  assert.equal(sharedTextInput({ shareType: 'url', value: 'https://example.test/read?a=1' }).sourceUrl, 'https://example.test/read?a=1');
  assert.throws(() => sharedTextInput({ shareType: 'url', value: 'javascript:alert(1)' }), /HTTP/);
  assert.throws(() => sharedTextInput({ shareType: 'text', value: 'a'.repeat(40_001) }), /limit/);
});

test('full inbox rejects a new batch without truncating or dropping queued entries', async () => {
  const f = fixture();
  const payloads = Array.from({ length: INBOX_LIMITS.entries }, (_, i) => ({ ...text, value: `item ${i}` }));
  await f.inbox.capture(payloads);
  await assert.rejects(f.inbox.capture([{ ...text, value: 'overflow' }]), /full/);
  assert.equal(f.inbox.snapshot().entries.length, INBOX_LIMITS.entries);
});

test('concurrent captures serialize persistence and completion tombstones prevent crash replay', async () => {
  const f = fixture();
  await Promise.all([f.inbox.capture([text]), f.inbox.capture([pdf])]);
  assert.equal(f.inbox.snapshot().entries.length, 2);
  const id = f.inbox.snapshot().entries[0].id;
  await f.inbox.dismiss(id);
  const restored = createIncomingInbox({ storage: f.storage, readFile: async () => { throw new Error('unused'); } });
  await restored.capture([text]);
  assert.equal(restored.snapshot().entries.length, 1);
});

test('browser GET share target consumes only explicit share parameters and retains URL as text', () => {
  assert.deepEqual(webSharePayloads('https://app.test/?text=ordinary&url=https://other.test'), []);
  const items = webSharePayloads('https://app.test/?share_text=hello&share_url=https%3A%2F%2Fexample.test&share_title=Read');
  assert.equal(items.length, 2);
  assert.equal(items[0].value, 'Read\n\nhello');
  assert.equal(items[1].shareType, 'url');
});

test('attachment merge preserves current selections, deduplicates, and refuses overflow instead of truncating', () => {
  assert.deepEqual(mergeDraftAttachment(['a', 'b'], 'b'), ['a', 'b']);
  assert.deepEqual(mergeDraftAttachment(['a', 'b'], 'c'), ['a', 'b', 'c']);
  assert.throws(() => mergeDraftAttachment(['a', 'b', 'c'], 'd'), /Remove/);
});

test('corrupt inbox never silently overwrites retained shared content', () => {
  assert.throws(() => restoreIncomingInbox('{bad'), /could not be read/);
  assert.throws(() => restoreIncomingInbox(JSON.stringify({ version: 1, entries: [{ id: 'bad' }], seen: [] })), /could not be read/);
});

test('a new native intent arriving during persistence cannot be accidentally cleared', async () => {
  const f = fixture(); let reads = 0, cleared = 0;
  const result = await receiveNativeShares({ get: () => ++reads === 1 ? [text] : [pdf], clear: () => { cleared++; } }, f.inbox);
  assert.equal(result, false); assert.equal(cleared, 0);
  assert.equal(f.inbox.snapshot().entries.length, 1);
  assert.equal(await receiveNativeShares({ get: () => [pdf], clear: () => { cleared++; } }, f.inbox), true);
  assert.equal(cleared, 1);
});

test('Android raw text MIME content URIs import actual file bytes, while ordinary URL-looking text remains text', async () => {
  const f = fixture({ readFile: async () => ({ name: 'brief.md', mimeType: 'text/markdown', bytes: new TextEncoder().encode('# Actual brief') }) });
  await f.inbox.capture([{ shareType: 'text', mimeType: 'text/markdown', value: 'content://selected/brief.md' }, { ...text, value: 'https://example.test/plain' }]);
  assert.equal(f.inbox.snapshot().entries[0].input.content, '# Actual brief');
  assert.equal(f.inbox.snapshot().entries[0].input.kind, 'file');
  assert.equal(f.inbox.snapshot().entries[1].input.kind, 'note');
});

test('bounded native reader closes handles and rejects a provider that understates file size', () => {
  let closed = false, cursor = 0;
  const bytes = Uint8Array.from([1, 2, 3, 4, 5]);
  const handle = { readBytes: count => { const part = bytes.slice(cursor, cursor + Math.min(count, 2)); cursor += part.length; return part; }, close: () => { closed = true; } };
  assert.throws(() => readBoundedShareBytes(handle, 4), /limit/); assert.equal(closed, true);
  cursor = 0; closed = false;
  assert.deepEqual(readBoundedShareBytes(handle, 5), bytes); assert.equal(closed, true);
});

test('explicit save reuses library identity after crash replay and never overwrites an edited saved document', async () => {
  const f = fixture(); await f.inbox.capture([text]);
  const entry = f.inbox.snapshot().entries[0], clock = { id: () => 'unused', now: () => 100 };
  const saved = saveIncomingEntry(emptyAssistantState(), entry, clock);
  assert.equal(saved.state.library.length, 1);
  const edited = { ...saved.state, library: saved.state.library.map(item => ({ ...item, content: 'My edited content' })) };
  const replay = saveIncomingEntry(edited, entry, clock);
  assert.equal(replay.record.id, saved.record.id);
  assert.equal(replay.record.content, 'My edited content');
  assert.equal(replay.state.library.length, 1);
  assert.equal(f.inbox.snapshot().entries.length, 1);
  assert.throws(() => saveIncomingEntry(edited, { ...entry, input: undefined }, clock), /Retry/);
});
