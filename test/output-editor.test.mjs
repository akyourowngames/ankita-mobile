import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutput, OUTPUT_LIMITS } from '../src/assistant/outputs.ts';
import { exportOutput } from '../src/outputs/formats.ts';
import { createOutputDraft, outputDraftChanged, outputDraftContent, resizeOutputTable, changeOutputList, saveOutputDraft } from '../src/outputs/editor.ts';
const clock = { id: () => 'output-one', now: () => 1000 };
const make = (kind, data) => createOutput([], { title: 'My output', kind, content: typeof data === 'string' ? data : JSON.stringify(data), source: { conversationId: 'chat-one', messageId: 'message-one', workId: 'work-one' } }, clock).record;

test('table shape changes stay bounded and immutable, and edits export real cells', () => {
  const source = make('table', { columns: ['Name'], rows: [['Ada']] });
  const draft = createOutputDraft(source);
  assert.equal(outputDraftChanged(draft), false);
  draft.data = resizeOutputTable(draft.data, 'add-column');
  draft.data.rows[0][1] = 'Engineer';
  draft.data = resizeOutputTable(draft.data, 'add-row');
  draft.data.rows[1][0] = 'Grace';
  const saved = saveOutputDraft([source], draft, { ...clock, now: () => 2000 }).record;
  assert.deepEqual(saved.source, source.source);
  assert.equal(saved.id, source.id);
  assert.equal(saved.createdAt, source.createdAt);
  assert.match(exportOutput(saved, 'csv').content, /"Ada","Engineer"/);
  assert.deepEqual(JSON.parse(source.content), { columns: ['Name'], rows: [['Ada']] });
  assert.deepEqual(resizeOutputTable(draft.data, 'remove-column', 0).rows, [['Engineer'], ['']]);
  assert.throws(() => resizeOutputTable({ columns: ['Only'], rows: [] }, 'remove-column', 0), /column/i);
  assert.throws(() => resizeOutputTable({ columns: Array(OUTPUT_LIMITS.columns).fill('A'), rows: [] }, 'add-column'), /limit/i);
  assert.throws(() => resizeOutputTable({ columns: ['A'], rows: Array.from({length: OUTPUT_LIMITS.rows}, () => ['']) }, 'add-row'), /limit/i);
});

test('checklist drafts preserve checks and cancel leaves original untouched; bounds keep a valid list', () => {
  const source = make('checklist', { items: [{ text: 'Pack', checked: true }] });
  const draft = createOutputDraft(source);
  draft.data.items = changeOutputList(draft.data.items, 'add', { text: 'Travel', checked: false }, OUTPUT_LIMITS.checklist);
  draft.data.items[0].checked = false;
  assert.equal(outputDraftChanged(draft), true);
  assert.equal(JSON.parse(source.content).items[0].checked, true);
  assert.deepEqual(JSON.parse(outputDraftContent(draft)).items.map(x => x.checked), [false, false]);
  assert.throws(() => changeOutputList([1], 'remove', 0, 10), /one/i);
  assert.throws(() => changeOutputList([1, 2], 'add', 3, 2), /limit/i);
  draft.data.items[0].text = '';
  assert.throws(() => saveOutputDraft([source], draft, clock), /checklist item/i);
  assert.equal(draft.data.items[0].text, '');
});

test('calendar fields serialize optional dates and enforce event dates at save without losing draft', () => {
  const source = make('calendar', { events: [{ title: 'Meet', start: '2026-10-26T09:00:00Z', end: '2026-10-26T10:00:00Z', location: 'Office' }] });
  const draft = createOutputDraft(source);
  delete draft.data.events[0].end;
  draft.data.events[0].description = 'Bring notes';
  const saved = saveOutputDraft([source], draft, clock).record;
  assert.match(exportOutput(saved, 'ics').content, /DESCRIPTION:Bring notes/);
  assert.doesNotMatch(exportOutput(saved, 'ics').content, /DTEND/);
  draft.data.events[0].start = '';
  assert.throws(() => saveOutputDraft([source], draft, clock), /date/i);
  assert.equal(draft.data.events[0].description, 'Bring notes');
});

test('saving rejects deleted or concurrently changed records even with identical timestamps', () => {
  const source = make('document', '# Original');
  const draft = createOutputDraft(source);
  draft.title = 'Edited';
  assert.throws(() => saveOutputDraft([], draft, clock), /deleted/i);
  for (const patch of [{ content: 'New content' }, { title: 'Other title' }, { updatedAt: 2000 }, { source: { conversationId: 'other-chat' } }]) {
    assert.throws(() => saveOutputDraft([{ ...source, ...patch }], draft, clock), /changed.*editing/i);
  }
  assert.equal(draft.title, 'Edited');
});

test('document and JSON use text drafts while final record validation handles malformed data', () => {
  const document = createOutputDraft(make('document', '# Notes'));
  document.text = 'New notes';
  assert.equal(outputDraftContent(document), 'New notes');
  const source = make('json', { value: 1 }), draft = createOutputDraft(source);
  assert.equal(outputDraftChanged(draft), false);
  draft.text = '{broken';
  assert.throws(() => saveOutputDraft([source], draft, clock), /valid JSON/i);
});
