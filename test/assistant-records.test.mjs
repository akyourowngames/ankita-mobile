import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssistantState, rememberMemory, forgetMemory, memoryPrompt, searchMemory, saveTask, saveLibraryItem, restoreAssistantState } from '../src/assistant/records.ts';
import { ASSISTANT_LIMITS } from '../src/assistant/config.ts';
import { restoreToolReceipts } from '../src/assistant/validation.ts';
import { initialState, restoreState } from '../src/core/state.ts';

let sequence = 0;
const clock = { id: () => `record-${++sequence}`, now: () => 1_000_000 }; // Deterministic record fixtures, not production clock/IDs.
const source = { kind: 'user', conversationId: 'chat', messageId: 'message', quote: 'I prefer concise answers' };
const memory = text => ({ text, category: 'preference', source, pinned: false });

test('old app data migrates an empty assistant store without changing providers/chats', () => {
  const state = initialState(); delete state.assistant;
  const restored = restoreState(JSON.stringify(state));
  assert.deepEqual(restored.assistant, emptyAssistantState());
  assert.deepEqual(restored.teammates, state.teammates);
});
test('personal memories deduplicate without losing identity and are recallable across chats', () => {
  let result = rememberMemory(emptyAssistantState(), memory('Prefers concise answers'), clock);
  const id = result.record.id;
  result = rememberMemory(result.state, memory('  prefers   concise answers '), clock);
  assert.equal(result.state.memories.length, 1); assert.equal(result.record.id, id);
  assert.equal(searchMemory(result.state, 'concise')[0].id, id);
  assert.equal(memoryPrompt(result.state), '', 'Unpinned facts must not enter every prompt');
  assert.equal(forgetMemory(result.state, id).memories.length, 0);
  assert.equal(result.state.memories.length, 1, 'Record operations must be immutable');
});
test('memory pins and records are bounded and quotes require provenance', () => {
  let state = emptyAssistantState();
  for (let i = 0; i < ASSISTANT_LIMITS.promptPins; i++) state = rememberMemory(state, { ...memory(`Preference ${i}: ` + 'x'.repeat(ASSISTANT_LIMITS.memoryChars / 2)), pinned: true }, clock).state;
  assert.throws(() => rememberMemory(state, { ...memory('One too many pins'), pinned: true }, clock), /pin limit/i);
  const prompt = memoryPrompt(state);
  assert.ok(prompt.length <= ASSISTANT_LIMITS.promptChars);
  assert.equal(prompt.split('\n').filter(line => line.startsWith('- ')).length, ASSISTANT_LIMITS.promptPins);
  assert.throws(() => rememberMemory(state, { ...memory('Unsupported fact'), source: { ...source, quote: '' } }, clock), /evidence/i);
  assert.throws(() => rememberMemory(state, memory('x'.repeat(ASSISTANT_LIMITS.memoryChars + 1)), clock), /limit/i);
});
test('assistant records restore strictly and corrupted records do not silently disappear', () => {
  const state = rememberMemory(emptyAssistantState(), memory('Prefers concise answers'), clock).state;
  assert.deepEqual(restoreAssistantState(state), state);
  const invalid = structuredClone(state); invalid.memories[0].pinned = 'yes';
  assert.throws(() => restoreAssistantState(invalid), /assistant/i);
  const app = initialState(); app.assistant = invalid;
  assert.throws(() => restoreState(JSON.stringify(app)), /could not be read/i);
  const duplicate = structuredClone(state); duplicate.memories.push({ ...duplicate.memories[0] });
  assert.throws(() => restoreAssistantState(duplicate), /assistant/i);
});
test('tasks and notes retain IDs/timestamps and reject oversized or invalid input', () => {
  let task = saveTask(emptyAssistantState(), { title: 'Book appointment', notes: '', status: 'open', dueAt: clock.now() + 5000 }, clock);
  const id = task.record.id;
  task = saveTask(task.state, { ...task.record, title: 'Book dentist', status: 'done' }, clock);
  assert.equal(task.state.tasks.length, 1); assert.equal(task.record.id, id); assert.equal(task.record.status, 'done');
  assert.throws(() => saveTask(task.state, { title: '', notes: '', status: 'open', dueAt: null }, clock), /title/i);
  assert.throws(() => saveTask(task.state, { title: 'Invalid', notes: '', status: 'open', dueAt: Infinity }, clock), /date/i);
  const note = saveLibraryItem(task.state, { title: 'Plan', content: '# Real notes', kind: 'note' }, clock);
  const updated = saveLibraryItem(note.state, { ...note.record, content: '# Edited' }, clock);
  assert.equal(updated.state.library.length, 1); assert.equal(updated.record.id, note.record.id);
  assert.equal(updated.record.createdAt, note.record.createdAt);
  assert.throws(() => saveLibraryItem(note.state, { title: 'Too large', content: 'x'.repeat(ASSISTANT_LIMITS.documentChars + 1), kind: 'note' }, clock), /limit/i);
  assert.deepEqual(restoreAssistantState(updated.state), updated.state);
});
test('interrupted persisted tool runs restore cancelled and unknown private fields are excluded', () => {
  const receipt = { id: 'run', name: 'memory_save', title: 'Remember a fact', status: 'running', arguments: '{}', result: '', startedAt: clock.now(), apiKey: 'not-a-saved-receipt-field' };
  const restored = restoreToolReceipts([receipt]);
  assert.equal(restored[0].status, 'cancelled'); assert.equal(restored[0].apiKey, undefined);
  assert.throws(() => restoreToolReceipts([receipt, receipt]), /assistant/i);
});
