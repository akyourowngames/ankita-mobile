import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationPort } from '../src/assistant/notificationPort.ts';
const TASK = { id: 'fixture-task', title: 'Actual task title', notes: 'Task details', dueAt: 2000 };
function fixture(platform, permissions = { granted: true }) {
  const calls = [], os = {
    AndroidImportance: { DEFAULT: 'default' }, IosAuthorizationStatus: { PROVISIONAL: 'provisional' }, SchedulableTriggerInputTypes: { DATE: 'date' },
    setNotificationHandler: value => calls.push(['handler', value]),
    setNotificationChannelAsync: async (...args) => calls.push(['channel', ...args]),
    getPermissionsAsync: async () => permissions, requestPermissionsAsync: async () => permissions,
    scheduleNotificationAsync: async input => { calls.push(['schedule', input]); return 'actual-os-id'; },
    cancelScheduledNotificationAsync: async id => calls.push(['cancel', id]), cancelAllScheduledNotificationsAsync: async () => calls.push(['clear']),
  };
  let loads = 0;
  const port = createNotificationPort(platform, async () => { loads++; return os; }, 'Fixture app');
  return { port, calls, loads: () => loads };
}
test('native initialization restores the foreground notification handler without requesting permission', async () => {
  const f = fixture('android'); await f.port.initialize(); await f.port.initialize();
  assert.equal(f.loads(), 1); assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], 'handler');
  assert.equal((await f.calls[0][1].handleNotification()).shouldShowBanner, true);
});
test('native reminder adapter uses real date/channel payload, OS ID and cancellation APIs', async () => {
  const f = fixture('android');
  assert.equal(await f.port.schedule(TASK, new AbortController().signal), 'actual-os-id');
  const input = f.calls.find(call => call[0] === 'schedule')[1];
  assert.equal(input.content.title, TASK.title); assert.equal(input.trigger.date.getTime(), TASK.dueAt); assert.equal(input.trigger.channelId, f.calls.find(call => call[0] === 'channel')[1]);
  await f.port.cancel('actual-os-id'); await f.port.cancelAll();
  assert.ok(f.calls.some(call => call[0] === 'cancel' && call[1] === 'actual-os-id')); assert.ok(f.calls.some(call => call[0] === 'clear'));
});
test('denied notification permission and browser adapter never schedule', async () => {
  const denied = fixture('ios', { granted: false, canAskAgain: false });
  await assert.rejects(denied.port.schedule(TASK, new AbortController().signal), /permission was denied/);
  assert.ok(!denied.calls.some(call => call[0] === 'schedule'));
  const web = fixture('web'); await web.port.initialize(); assert.equal(web.loads(), 0); assert.equal(web.port.supported, false);
  await assert.rejects(web.port.schedule(TASK, new AbortController().signal), /native phone app/);
});
