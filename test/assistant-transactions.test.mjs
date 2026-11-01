import test from 'node:test';
import assert from 'node:assert/strict';
import { createStateWriter } from '../src/storage/stateWriter.ts';
import { initialState } from '../src/core/state.ts';

const fixture = persist => {
  let state = initialState();
  const writer = createStateWriter({ get: () => state, publish: update => { state = update(state); }, persist });
  return { writer, get: () => state, update: update => { state = update(state); } };
};
test('assistant changes publish only after storage succeeds and failed saves never look committed', async () => {
  const app = fixture(async () => { throw new Error('storage failed'); });
  await assert.rejects(app.writer.commit(assistant => ({ ...assistant, preferences: { ...assistant.preferences, toolsEnabled: false } }), new AbortController().signal));
  assert.equal(app.get().assistant.preferences.toolsEnabled, true);
});
test('queued background saves read the committed snapshot and preserve concurrent chat changes', async () => {
  let release, begin; const started = new Promise(resolve => { begin = resolve; }), disk = [];
  const app = fixture(async state => { disk.push(JSON.parse(JSON.stringify(state))); if (disk.length === 1) { begin(); await new Promise(resolve => { release = resolve; }); } });
  const commit = app.writer.commit(assistant => ({ ...assistant, preferences: { ...assistant.preferences, toolsEnabled: false } }), new AbortController().signal);
  await started;
  app.update(state => ({ ...state, settings: { ...state.settings, name: 'Concurrent update' } }));
  const save = app.writer.save(); release(); await Promise.all([commit, save]);
  assert.equal(disk.at(-1).assistant.preferences.toolsEnabled, false);
  assert.equal(disk.at(-1).settings.name, 'Concurrent update');
  assert.equal(app.get().settings.name, 'Concurrent update');
});
test('Stop during a nonabortable storage write restores the snapshot before queued writes continue', async () => {
  let release, begin; const started = new Promise(resolve => { begin = resolve; }), disk = [];
  const controller = new AbortController();
  const app = fixture(async state => { disk.push(state); if (disk.length === 1) { begin(); await new Promise(resolve => { release = resolve; }); } });
  const commit = app.writer.commit(assistant => ({ ...assistant, preferences: { ...assistant.preferences, toolsEnabled: false } }), controller.signal);
  await started; controller.abort(); const background = app.writer.save(); release();
  await assert.rejects(commit, { name: 'AbortError' }); await background;
  assert.equal(app.get().assistant.preferences.toolsEnabled, true);
  assert.equal(disk.at(-1).assistant.preferences.toolsEnabled, true);
});

test('work transactions rebase on foreground changes without losing reply text', async () => {
  let release, begin; const started = new Promise(resolve => { begin = resolve; }), disk = [];
  const app = fixture(async state => { disk.push(state); if (disk.length === 1) { begin(); await new Promise(resolve => { release = resolve; }); } });
  const transaction = app.writer.transaction(state => ({ ...state, work: { ...state.work, notices: [{ id: 'notice', workId: 'job', title: 'Ready', createdAt: 1, read: false, delivery: 'pending' }] } }), new AbortController().signal);
  await started; app.update(state => ({ ...state, settings: { ...state.settings, name: 'Concurrent foreground edit' } })); release(); await transaction;
  assert.equal(app.get().settings.name, 'Concurrent foreground edit'); assert.equal(disk.at(-1).settings.name, 'Concurrent foreground edit'); assert.equal(disk.at(-1).work.notices.length, 1);
});

test('aborting a rebasing work transaction compensates the unpublished disk snapshot', async () => {
  let release, begin; const started = new Promise(resolve => { begin = resolve; }), disk = [], controller = new AbortController();
  const app = fixture(async state => { disk.push(state); if (disk.length === 1) { begin(); await new Promise(resolve => { release = resolve; }); } });
  const transaction = app.writer.transaction(state => ({ ...state, work: { ...state.work, connection: { baseUrl: 'https://fixture.example', enabled: true } } }), controller.signal);
  await started; app.update(state => ({ ...state, settings: { ...state.settings, name: 'Kept' } })); controller.abort(); release();
  await assert.rejects(transaction, { name: 'AbortError' }); assert.equal(disk.at(-1).work.connection.enabled, false); assert.equal(disk.at(-1).settings.name, 'Kept'); assert.equal(app.get().work.connection.enabled, false);
});
