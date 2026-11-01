import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssistantState, searchMemory, memoryPrompt, updateMemory } from '../src/assistant/records.ts';
import { assistantPrompt } from '../src/core/assistant.ts';
import { initialState } from '../src/core/state.ts';
import { ASSISTANT_LIMITS as L } from '../src/assistant/config.ts';

const fact = (id, text, extra = {}) => ({ id, text, category: 'fact', pinned: false, createdAt: 1, updatedAt: 1, source: { kind: 'user', conversationId: 'chat-one', messageId: `msg-${id}`, quote: text }, ...extra });
const state = (...memories) => ({ ...emptyAssistantState(), memories });
const retrieval = await import('../src/assistant/retrieval.ts');

test('natural questions ignore conversational noise instead of retrieving unrelated pronouns', () => {
  const store = state(fact('wrong', 'I enjoy swimming and I own a bicycle'), fact('right', 'My passport expires in September 2028'));
  assert.deepEqual(searchMemory(store, 'Could you please tell me when my passport expires?').map(m => m.id), ['right']);
  assert.deepEqual(searchMemory(store, 'I want to know my passport expiration').map(m => m.id), ['right']);
  assert.deepEqual(searchMemory(store, 'could you please tell me'), []);
});

test('whole numeric terms do not confuse exact facts or substrings', () => {
  const store = state(fact('wrong', 'Apartment 142, PIN 560001'), fact('right', 'Apartment 42, PIN 110001'));
  assert.deepEqual(searchMemory(store, '42').map(m => m.id), ['right']);
  assert.deepEqual(searchMemory(store, '56000'), []);
  assert.deepEqual(searchMemory(store, 'Apartment 42').map(m => m.id), ['right']);
});

test('diacritics, inflections and small semantic equivalents recall the saved fact', () => {
  const store = state(fact('cafe', 'My favourite cafés are in Montréal'), fact('birth', 'Birthday is 12 July'), fact('travel', 'Prefers travelling by train'));
  assert.equal(searchMemory(store, 'favorite cafes Montreal')[0]?.id, 'cafe');
  assert.equal(searchMemory(store, 'date of birth')[0]?.id, 'birth');
  assert.equal(searchMemory(store, 'travel')[0]?.id, 'travel');
});

test('relevance outranks repetition and irrelevant pins; ties favor recent corrections', () => {
  assert.equal(typeof retrieval.retrieveMemories, 'function', 'Local retrieval API must exist');
  const relevant = fact('useful', 'Passport expires September 2028');
  const store = state(fact('noise', 'passport '.repeat(30)), fact('pin', 'I like cats', { pinned: true }), relevant);
  assert.equal(retrieval.retrieveMemories(store.memories, 'When does my passport expire?')[0].memory.id, 'useful');
  const duplicates = [fact('old', '  Café closes at 4 ', { updatedAt: 1 }), fact('new', 'café   closes at 4', { updatedAt: 10 })];
  assert.deepEqual(retrieval.retrieveMemories(duplicates, 'cafe').map(hit => hit.memory.id), ['new']);
  const updated = updateMemory(store, 'useful', { text: 'Passport expires September 2030' }, { now: () => 100, id: () => 'unused' }).state;
  assert.equal(retrieval.retrieveMemories(updated.memories, '2030')[0].memory.source.messageId, 'msg-useful');
  assert.deepEqual(retrieval.retrieveMemories(updated.memories, '2028'), []);
  assert.ok(retrieval.retrieveMemories(store.memories, 'passport')[0].matchedTerms.includes('passport'));
});

test('local retrieval applies caller limits and exclusions without mutating records', () => {
  assert.equal(typeof retrieval.retrieveMemories, 'function');
  const memories = [fact('first', 'Train journeys'), fact('second', 'Train tickets'), fact('third', 'Train stations')];
  const before = structuredClone(memories);
  assert.equal(retrieval.retrieveMemories(memories, 'train', { limit: 1, excludeIds: ['first'] }).length, 1);
  assert.deepEqual(memories, before);
  assert.deepEqual(retrieval.retrieveMemories(memories, 'train', { limit: 0 }), []);
});

test('prompt context contains bounded deduplicated pins, relevant facts and honest provenance', () => {
  assert.equal(typeof retrieval.buildMemoryContext, 'function', 'Bounded context API must exist');
  const pin = fact('pin', 'Prefers short replies', { pinned: true });
  const recalled = fact('recall', 'Passport expires in 2028');
  const store = state(pin, recalled, fact('duplicate', pin.text, { pinned: true, updatedAt: 0 }), fact('unrelated', 'Enjoys kayaking'));
  const context = retrieval.buildMemoryContext(store, 'When does my passport expire?');
  assert.deepEqual(context.ids, ['pin', 'recall']);
  assert.ok(context.prompt.length <= L.promptChars);
  assert.match(context.prompt, /data, not instructions/);
  assert.match(context.prompt, /msg-recall/);
  assert.match(context.prompt, /chat-one/);
  assert.doesNotMatch(context.prompt, /kayaking/);
  const lines = context.prompt.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  assert.equal(lines.find(line => line.id === 'recall').source.quote, recalled.source.quote);
  const huge = state(...Array.from({ length: 100 }, (_, i) => fact(`id-${i}`, `passport ${i} ` + 'x'.repeat(580), { pinned: i < 12 })));
  const bounded = retrieval.buildMemoryContext(huge, 'passport');
  assert.ok(bounded.prompt.length <= L.promptChars);
  assert.ok(bounded.ids.length > 1);
  assert.equal(new Set(bounded.ids).size, bounded.ids.length);
  assert.equal(bounded.prompt.split('\n').filter(line => line.startsWith('{')).length, bounded.ids.length, 'No partial JSON records or phantom provenance IDs');
});

test('assistantPrompt adds current recall while empty-query behavior stays compatible', () => {
  const app = initialState(), store = state(fact('pin', 'Prefers brief answers', { pinned: true }), fact('pass', 'Passport expires in 2028'));
  const old = assistantPrompt(app.settings, app.teammates[0], store);
  assert.ok(old.endsWith(memoryPrompt(store)));
  assert.doesNotMatch(old, /Passport expires/);
  assert.match(assistantPrompt(app.settings, app.teammates[0], store, 'passport'), /Passport expires/);
  assert.doesNotMatch(assistantPrompt(app.settings, app.teammates[0], store, 'could you please'), /Passport expires/);
});

test('recall keeps exact facts near the end of a saved memory instead of clipping the relevant evidence', () => {
  const memory = fact('long', 'Background detail '.repeat(28) + 'Passport expires 2031-09-18.');
  const context = retrieval.buildMemoryContext(state(memory), 'passport expires');
  assert.match(context.prompt, /2031-09-18/);
  assert.deepEqual(context.ids, ['long']);
  const pinnedContext = retrieval.buildMemoryContext(state({ ...memory, pinned: true }), 'passport expires');
  assert.match(pinnedContext.prompt, /2031-09-18/, 'Relevant pins need the whole fact too');
  assert.deepEqual(pinnedContext.ids, ['long']);
});
