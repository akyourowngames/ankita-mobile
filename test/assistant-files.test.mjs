import test from 'node:test';
import assert from 'node:assert/strict';
import { importDocument, validateAsset } from '../src/assistant/files.ts';
import { attachmentMessages } from '../src/assistant/attachments.ts';
import { buildRequest } from '../src/api/protocol.ts';
import { emptyAssistantState, saveLibraryItem, restoreAssistantState } from '../src/assistant/records.ts';
import { ASSISTANT_LIMITS as L } from '../src/assistant/config.ts';
const encoder = new TextEncoder(), clock = { id: () => 'selected-file', now: () => 100 };
test('selected text files become real bounded searchable library records', () => {
  const item = importDocument({ name: 'brief.md', mimeType: 'text/markdown', bytes: encoder.encode('# Actual brief\nA concise document.') });
  const changed = saveLibraryItem(emptyAssistantState(), item, clock);
  assert.match(changed.record.content, /Actual brief/); assert.equal(changed.record.kind, 'file');
  assert.equal(restoreAssistantState(changed.state).library[0].title, 'brief.md');
  assert.throws(() => importDocument({ name: 'large.txt', mimeType: 'text/plain', bytes: new Uint8Array(L.fileBytes + 1) }), /limit/);
  assert.throws(() => importDocument({ name: 'program.exe', mimeType: 'application/octet-stream', bytes: encoder.encode('executable') }), /supported/);
});
test('PDF and image files retain bounded verified bytes and corruption is rejected', () => {
  const item = importDocument({ name: 'paper.pdf', mimeType: 'application/pdf', bytes: encoder.encode('%PDF-1.7\nfixture') });
  assert.equal(item.asset.mimeType, 'application/pdf'); validateAsset(item.asset);
  assert.throws(() => importDocument({ name: 'fake.pdf', mimeType: 'application/pdf', bytes: encoder.encode('not a pdf') }), /match/);
  assert.throws(() => validateAsset({ ...item.asset, data: 'invalid base64' }), /asset/);
});
for (const kind of ['openai', 'anthropic']) test(`${kind}: selected PDF/image bytes follow the actual multimodal wire contract`, () => {
  let state = emptyAssistantState();
  const pdf = saveLibraryItem(state, importDocument({ name: 'paper.pdf', mimeType: 'application/pdf', bytes: encoder.encode('%PDF-1.7\nfixture') }), clock); state = pdf.state;
  const png = importDocument({ name: 'photo.png', mimeType: 'image/png', bytes: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]) });
  const image = saveLibraryItem(state, png, { ...clock, id: () => 'selected-image' }); state = image.state;
  const messages = attachmentMessages([{ id: 'user', role: 'user', content: 'Read these', status: 'complete', fileIds: ['selected-file', 'selected-image'] }], state);
  const provider = { id: 'test', kind, name: 'Fixture', baseUrl: 'https://example.test/v1', model: 'fixture', keyRequired: false };
  const body = buildRequest(provider, '', messages, '').body;
  const content = body.messages[0].content;
  assert.equal(content.length, 3);
  if (kind === 'openai') { assert.equal(content[1].type, 'file'); assert.match(content[1].file.file_data, /^data:application\/pdf;base64,/); assert.equal(content[2].type, 'image_url'); }
  else { assert.equal(content[1].type, 'document'); assert.equal(content[1].source.media_type, 'application/pdf'); assert.equal(content[2].type, 'image'); }
});
