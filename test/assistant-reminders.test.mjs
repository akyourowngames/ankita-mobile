import test from 'node:test';
import assert from 'node:assert/strict';
import { createReminderService } from '../src/assistant/reminders.ts';
import { emptyAssistantState, saveTask } from '../src/assistant/records.ts';
const clock = { id: () => 'task', now: () => 100 };
const fixture = overrides => { let state = saveTask(emptyAssistantState(), { title: 'Real task', notes: '', status: 'open', dueAt: 10000 }, clock).state, scheduled = [], cancelled = [];
  const port = { supported: true, schedule: async task => { scheduled.push(task); return 'os-reminder'; }, cancel: async id => { cancelled.push(id); }, ...overrides };
  const store = { get: () => state, commit: async (update, signal) => { signal.throwIfAborted(); state = update(state); } };
  return { store, get: () => state, scheduled, cancelled, service: createReminderService(store, clock, port) };
};
test('OS-scheduled reminders persist the actual returned identity and cancel on completion', async () => {
  const app = fixture(), signal = new AbortController().signal;
  const result = await app.service.schedule('task', signal); assert.equal(result.notificationId, 'os-reminder'); assert.equal(app.get().tasks[0].notificationId, 'os-reminder');
  await app.service.complete('task', signal); assert.deepEqual(app.cancelled, ['os-reminder']); assert.equal(app.get().tasks[0].status, 'done'); assert.equal(app.get().tasks[0].notificationId, null);
});
test('unsupported or denied native reminders never claim a scheduled identity', async () => {
  const web = fixture({ supported: false }); await assert.rejects(web.service.schedule('task', new AbortController().signal), /native phone/); assert.equal(web.scheduled.length, 0);
  const denied = fixture({ schedule: async () => { throw new Error('Notification permission denied'); } }); await assert.rejects(denied.service.schedule('task', new AbortController().signal), /denied/); assert.equal(denied.get().tasks[0].notificationId, null);
});
test('Stop or failed persistence after OS scheduling cancels the newly scheduled reminder', async () => {
  const controller = new AbortController(), app = fixture({ schedule: async () => { controller.abort(); return 'late-reminder'; } });
  await assert.rejects(app.service.schedule('task', controller.signal), { name: 'AbortError' }); assert.deepEqual(app.cancelled, ['late-reminder']); assert.equal(app.get().tasks[0].notificationId, null);
  const failed = fixture(); failed.store.commit = async () => { throw new Error('disk failed'); };
  await assert.rejects(failed.service.schedule('task', new AbortController().signal), /disk failed/); assert.deepEqual(failed.cancelled, ['os-reminder']);
});
test('concurrent scheduling is serialized and clearing records cancels every known OS reminder', async () => {
  const app = fixture(), signal = new AbortController().signal;
  await Promise.all([app.service.schedule('task', signal), app.service.schedule('task', signal)]);
  assert.equal(app.scheduled.length, 2); assert.deepEqual(app.cancelled, ['os-reminder']);
  await app.service.clear(signal); assert.deepEqual(app.cancelled, ['os-reminder', 'os-reminder']); assert.equal(app.get().tasks.length, 0);
});
