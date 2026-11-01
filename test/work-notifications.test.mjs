import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openWorkStore } from '../server/work-store.mjs';
import config from '../src/constants/work.json' with { type: 'json' };
const push = await import('../server/work-push.mjs');
const native = await import('../src/work/notifications.ts');
const eventId = 'work-job-one';
async function storeFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'work-push-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = await openWorkStore(root);
  await store.change(s => { s.jobs.one = { id: 'one', status: 'completed', spec: { title: 'PRIVATE medical report' } }; s.devices.phone = { token: 'ExponentPushToken[fixture]', updatedAt: 1 }; s.outbox[eventId] = { id: eventId, jobId: 'one', deviceId: 'phone', status: 'pending', attempts: 0, nextAt: 0 }; });
  return { store, root };
}

test('push persists sending before request, records genuine ticket/receipt, and never duplicates on poll/reopen', async t => {
  assert.equal(typeof push.createPushDelivery, 'function');
  const f = await storeFixture(t); let time = 100, sends = 0, receipts = 0;
  const fetcher = async (url, init) => {
    if (url === config.pushSendUrl) {
      sends++; assert.equal(f.store.read().outbox[eventId].status, 'sending');
      const body = JSON.parse(init.body); assert.equal(body.data.workId, 'one'); assert.equal(body.data.eventId, eventId); assert.ok(!init.body.includes('PRIVATE')); assert.ok(init.signal);
      return Response.json({ data: { status: 'ok', id: 'ticket-one' } });
    }
    receipts++; assert.deepEqual(JSON.parse(init.body), { ids: ['ticket-one'] });
    return Response.json({ data: { 'ticket-one': { status: 'ok' } } });
  };
  const delivery = push.createPushDelivery({ store: f.store, fetcher, now: () => time });
  await Promise.all([delivery.tick(), delivery.tick()]);
  assert.equal(sends, 1); assert.equal(f.store.read().outbox[eventId].status, 'accepted');
  time += config.pushReceiptMs;
  const reopened = await openWorkStore(f.root);
  await push.createPushDelivery({ store: reopened, fetcher, now: () => time }).tick();
  assert.equal(reopened.read().outbox[eventId].status, 'provider_received');
  await push.createPushDelivery({ store: reopened, fetcher, now: () => time + config.pushReceiptMs }).tick();
  assert.equal(sends, 1); assert.equal(receipts, 1);
});

test('definite service rejection retries notification only with persisted bounded backoff', async t => {
  assert.equal(typeof push.createPushDelivery, 'function');
  const { store } = await storeFixture(t); let time = 1, sends = 0;
  const delivery = push.createPushDelivery({ store, now: () => time, fetcher: async () => { sends++; return new Response('', { status: 503 }); } });
  for (let i = 0; i < config.pushMaxAttempts; i++) {
    await delivery.tick(); assert.equal(sends, i + 1);
    await delivery.tick(); assert.equal(sends, i + 1);
    time = store.read().outbox[eventId].nextAt;
  }
  assert.equal(store.read().outbox[eventId].status, 'failed');
  assert.equal(store.read().jobs.one.status, 'completed');
  await delivery.tick(); assert.equal(sends, config.pushMaxAttempts);
});

test('ambiguous network outcome and interrupted sending become uncertain without automatic replay', async t => {
  assert.equal(typeof push.createPushDelivery, 'function');
  const f = await storeFixture(t); let sends = 0;
  const fetcher = async () => { sends++; throw new Error('secret response/token'); };
  await push.createPushDelivery({ store: f.store, fetcher }).tick();
  assert.equal(f.store.read().outbox[eventId].status, 'uncertain');
  assert.ok(!JSON.stringify(f.store.read().outbox).includes('secret response'));
  await f.store.change(s => { s.outbox[eventId].status = 'sending'; });
  const reopened = await openWorkStore(f.root);
  await push.createPushDelivery({ store: reopened, fetcher }).tick();
  assert.equal(sends, 1); assert.equal(reopened.read().outbox[eventId].status, 'uncertain');
});

test('DeviceNotRegistered removes the actual stale token and stops notification retries', async t => {
  assert.equal(typeof push.createPushDelivery, 'function');
  const { store } = await storeFixture(t);
  const delivery = push.createPushDelivery({ store, fetcher: async () => Response.json({ data: { status: 'error', details: { error: 'DeviceNotRegistered' } } }) });
  await delivery.tick(); assert.equal(store.read().devices.phone, undefined); assert.equal(store.read().outbox[eventId].status, 'failed');
  await delivery.tick(); assert.equal(store.read().outbox[eventId].attempts, 1);
});

test('receipt failures retry receipt lookup without resending an accepted notification', async t => {
  assert.equal(typeof push.createPushDelivery, 'function');
  const { store } = await storeFixture(t); let time = 1, sends = 0;
  const fetcher = async url => { if (url === config.pushSendUrl) { sends++; return Response.json({ data: { status: 'ok', id: 'ticket-one' } }); } return new Response('', { status: 503 }); };
  const delivery = push.createPushDelivery({ store, fetcher, now: () => time });
  await delivery.tick();
  for (let i = 0; i < config.pushMaxAttempts; i++) { time = store.read().outbox[eventId].nextAt; await delivery.tick(); }
  assert.equal(store.read().outbox[eventId].status, 'receipt_unknown'); assert.equal(sends, 1);
});

test('missing devices and failed persistence cannot trigger a send', async t => {
  assert.equal(typeof push.createPushDelivery, 'function');
  const { store } = await storeFixture(t); let sends = 0;
  await assert.rejects(push.createPushDelivery({ store: { read: store.read, change: async () => { throw new Error('storage'); } }, fetcher: async () => { sends++; } }).tick(), /storage/);
  assert.equal(sends, 0);
  await store.change(s => { delete s.devices.phone; });
  await push.createPushDelivery({ store, fetcher: async () => { sends++; } }).tick();
  assert.equal(sends, 0); assert.equal(store.read().outbox[eventId].status, 'unavailable');
});

test('lost ticket persistence is uncertain on retry and never silently resends', async t => {
  const { store } = await storeFixture(t); let changes = 0, sends = 0;
  const interrupted = { read: store.read, change: update => { if (++changes === 2) throw new Error('save failed'); return store.change(update); } };
  const fetcher = async () => { sends++; return Response.json({ data: { status: 'ok', id: 'ticket-one' } }); };
  await assert.rejects(push.createPushDelivery({ store: interrupted, fetcher }).tick(), /save failed/);
  assert.equal(store.read().outbox[eventId].status, 'sending');
  await push.createPushDelivery({ store, fetcher }).tick();
  assert.equal(store.read().outbox[eventId].status, 'uncertain'); assert.equal(sends, 1);
});

test('receipt DeviceNotRegistered cannot delete a newly refreshed device token', async t => {
  const { store } = await storeFixture(t); let time = 1;
  const delivery = push.createPushDelivery({ store, now: () => time, fetcher: async url => url === config.pushSendUrl ? Response.json({ data: { status: 'ok', id: 'ticket-one' } }) : Response.json({ data: { 'ticket-one': { status: 'error', details: { error: 'DeviceNotRegistered' } } } }) });
  await delivery.tick();
  await store.change(s => { s.devices.phone.token = 'ExpoPushToken[renewed]'; });
  time += config.pushReceiptMs; await delivery.tick();
  assert.equal(store.read().devices.phone.token, 'ExpoPushToken[renewed]');
  assert.equal(store.read().outbox[eventId].status, 'failed');
});

test('malformed and oversized successful send responses remain uncertain rather than retrying sends', async t => {
  for (const body of ['not json', 'x'.repeat(70_000)]) {
    const { store } = await storeFixture(t); let sends = 0;
    const delivery = push.createPushDelivery({ store, fetcher: async () => { sends++; return new Response(body); } });
    await delivery.tick(); await delivery.tick();
    assert.equal(store.read().outbox[eventId].status, 'uncertain'); assert.equal(sends, 1);
  }
});

function nativeFixture(permission = { granted: true, canAskAgain: false }) {
  const calls = []; let listener, last = null;
  const api = {
    AndroidImportance: { DEFAULT: 3 }, IosAuthorizationStatus: { PROVISIONAL: 3 }, DEFAULT_ACTION_IDENTIFIER: 'default',
    setNotificationHandler: input => calls.push(['handler', input]),
    getPermissionsAsync: async () => permission, requestPermissionsAsync: async () => { calls.push(['permission']); return permission; },
    setNotificationChannelAsync: async (...args) => calls.push(['channel', ...args]),
    getExpoPushTokenAsync: async input => { calls.push(['token', input]); return { data: 'ExpoPushToken[actual]' }; },
    getAllScheduledNotificationsAsync: async () => [], getPresentedNotificationsAsync: async () => [],
    cancelScheduledNotificationAsync: async id => calls.push(['cancel', id]), dismissNotificationAsync: async id => calls.push(['dismiss', id]),
    scheduleNotificationAsync: async input => { calls.push(['schedule', input]); return input.identifier; },
    addNotificationResponseReceivedListener: fn => { listener = fn; return { remove: () => calls.push(['remove']) }; },
    getLastNotificationResponse: () => last, clearLastNotificationResponse: () => { last = null; calls.push(['clear']); },
  };
  return { api, calls, click: response => listener(response), initial: response => { last = response; } };
}

test('native adapter requests permission only explicitly and requires an actual project ID', async () => {
  assert.equal(typeof native.createWorkNotifications, 'function');
  const f = nativeFixture({ granted: false, canAskAgain: true });
  const adapter = native.createWorkNotifications('android', async () => f.api);
  await assert.rejects(adapter.present({ workId: 'one', eventId }), /permission/i);
  assert.equal(f.calls.filter(c => c[0] === 'permission').length, 0);
  assert.equal(await adapter.requestPermission(), false);
  await assert.rejects(adapter.register(''), /project/i);
  await assert.rejects(adapter.register('11111111-1111-4111-8111-111111111111'), /permission/i);
  assert.equal(f.calls.filter(c => c[0] === 'token').length, 0);
});

test('native API receives actual token project and private deterministic completion payload, deduplicated concurrently', async () => {
  assert.equal(typeof native.createWorkNotifications, 'function');
  const f = nativeFixture(), adapter = native.createWorkNotifications('android', async () => f.api);
  const projectId = '11111111-1111-4111-8111-111111111111';
  assert.equal(await adapter.register(projectId), 'ExpoPushToken[actual]');
  assert.deepEqual(f.calls.find(c => c[0] === 'token')[1], { projectId });
  const [one, two] = await Promise.all([adapter.present({ workId: 'one', eventId }), adapter.present({ workId: 'one', eventId })]);
  assert.deepEqual(one, two); assert.equal(one.status, 'scheduled');
  const schedules = f.calls.filter(c => c[0] === 'schedule'); assert.equal(schedules.length, 1);
  assert.equal(schedules[0][1].identifier, eventId); assert.deepEqual(schedules[0][1].content.data, { workId: 'one', eventId });
  assert.equal(schedules[0][1].trigger.channelId, config.pushChannel);
  assert.ok(!schedules[0][1].content.body.includes('one'));
});

test('native cold-start and live clicks route validated work identifiers once and unsubscribe cleanly', async () => {
  assert.equal(typeof native.createWorkNotifications, 'function');
  const f = nativeFixture(), adapter = native.createWorkNotifications('ios', async () => f.api), opened = [];
  const response = { actionIdentifier: 'default', notification: { request: { identifier: eventId, content: { data: { workId: 'one', eventId } } } } };
  f.initial(response);
  const dispose = await adapter.attachOpenHandler((...args) => opened.push(args));
  f.click(response); f.click({ ...response, actionIdentifier: 'dismiss' });
  f.click({ actionIdentifier: 'default', notification: { request: { identifier: 'bad', content: { data: { workId: 'https://evil.test', eventId } } } } });
  f.click({ actionIdentifier: 'default', notification: { request: { identifier: 'task-reminder', content: {} } } });
  assert.deepEqual(opened, [['one', eventId]]); dispose(); assert.ok(f.calls.some(c => c[0] === 'remove'));
});

test('native fallback recognizes an already displayed remote event despite its different OS identifier', async () => {
  const f = nativeFixture();
  f.api.getPresentedNotificationsAsync = async () => [{ request: { identifier: 'remote-system-id', content: { data: { workId: 'one', eventId } } } }];
  const adapter = native.createWorkNotifications('android', async () => f.api);
  const result = await adapter.present({ workId: 'one', eventId });
  assert.equal(result.identifier, 'remote-system-id');
  assert.equal(f.calls.filter(c => c[0] === 'schedule').length, 0);
});

test('browser adapter is honest about unsupported closed-background delivery', async () => {
  assert.equal(typeof native.createWorkNotifications, 'function');
  const adapter = native.createWorkNotifications('web', async () => { throw new Error('must not load native'); });
  assert.equal(adapter.supported, false); assert.equal(await adapter.requestPermission(), false);
  await assert.rejects(adapter.register('11111111-1111-4111-8111-111111111111'), /native/i);
  await assert.rejects(adapter.test(), /native/i);
});

test('clearing work alerts cancels and dismisses only work notifications, preserving phone reminders', async () => {
  const f = nativeFixture();
  f.api.getAllScheduledNotificationsAsync = async () => [{ identifier: eventId, content: { data: { workId: 'one', eventId } } }, { identifier: 'phone-reminder', content: { data: { taskId: 'task' } } }];
  f.api.getPresentedNotificationsAsync = async () => [{ request: { identifier: 'remote-alert', content: { data: { workId: 'one', eventId } } } }, { request: { identifier: 'phone-reminder', content: { data: { taskId: 'task' } } } }];
  const adapter = native.createWorkNotifications('android', async () => f.api);
  assert.equal(typeof adapter.clear, 'function');
  await adapter.clear();
  assert.deepEqual(f.calls.filter(c => c[0] === 'cancel' || c[0] === 'dismiss'), [['cancel', eventId], ['dismiss', 'remote-alert']]);
  assert.equal(f.calls.filter(c => c[0] === 'permission').length, 0);
});

test('clearing while native scheduling is in flight removes the late alert', async () => {
  const f = nativeFixture(); let release, started;
  const began = new Promise(resolve => { started = resolve; });
  f.api.scheduleNotificationAsync = async () => { started(); return new Promise(resolve => { release = resolve; }); };
  const adapter = native.createWorkNotifications('ios', async () => f.api);
  assert.equal(typeof adapter.clear, 'function');
  const presenting = adapter.present({ workId: 'one', eventId });
  await began; await adapter.clear(); release(eventId);
  await assert.rejects(presenting, /disabled|cleared/i);
  assert.ok(f.calls.some(c => c[0] === 'cancel' && c[1] === eventId));
  assert.ok(f.calls.some(c => c[0] === 'dismiss' && c[1] === eventId));
});
