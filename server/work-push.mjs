import { createHash } from 'node:crypto';
import config from '../src/constants/work.json' with { type: 'json' };

const tokenKey = token => createHash('sha256').update(token).digest('hex');
const validToken = token => typeof token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token);
const retryable = code => ['MessageRateExceeded', 'TOO_MANY_REQUESTS'].includes(code);

// Tickets mean Expo accepted the request; receipts mean APNs/FCM accepted it.
// Neither establishes that a phone displayed an alert.
export function createPushDelivery({ store, fetcher = fetch, now = Date.now }) {
  let running;
  async function request(url, body) {
    const controller = new AbortController(); let timer;
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('push_timeout')); }, config.requestMs); });
    try {
      return await Promise.race([deadline, (async () => {
        const response = await fetcher(url, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
        if (!response.ok) { await response.body?.cancel().catch(() => {}); return { http: response.status }; }
        const reader = response.body?.getReader();
        if (!reader) throw new Error('push_invalid_response');
        const chunks = []; let size = 0;
        try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 65_536) { await reader.cancel(); throw new Error('push_response_limit'); } chunks.push(Buffer.from(part.value)); } }
        finally { reader.releaseLock(); }
        return { http: response.status, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
      })()]);
    } finally { clearTimeout(timer); controller.abort(); }
  }
  async function update(id, expected, action) {
    await store.change(state => { const event = state.outbox[id]; if (!event || event.status !== expected) return; action(event, state); const job = state.jobs[event.jobId]; if (job && (!job.notificationId || job.notificationId === id)) job.notification = event.status; });
  }
  const retry = (event, code) => {
    event.error = code;
    event.status = event.attempts >= config.pushMaxAttempts ? 'failed' : 'pending';
    event.nextAt = now() + config.pushRetryMs * 2 ** Math.max(0, event.attempts - 1);
  };
  function failure(event, state, code) {
    if (code === 'DeviceNotRegistered') {
      const device = state.devices[event.deviceId];
      if (device && tokenKey(device.token) === event.tokenHash) delete state.devices[event.deviceId];
    }
    if (retryable(code)) retry(event, code);
    else { event.status = 'failed'; event.error = code; }
  }
  async function send(id) {
    let claimed;
    await store.change(state => {
      const event = state.outbox[id]; if (!event || event.status !== 'pending' || event.nextAt > now()) return;
      const device = state.devices[event.deviceId], job = state.jobs[event.jobId];
      if (!job) { event.status = 'unavailable'; event.error = 'work_removed'; return; }
      const mirror = () => { if (!job.notificationId || job.notificationId === id) job.notification = event.status; };
      if (!validToken(device?.token)) { event.status = 'unavailable'; event.error = 'device_not_registered'; mirror(); return; }
      if (event.attempts >= config.pushMaxAttempts) { event.status = 'failed'; event.error = 'retry_limit'; mirror(); return; }
      event.status = 'sending'; event.attempts++; event.startedAt = now(); event.tokenHash = tokenKey(device.token); mirror();
      claimed = { token: device.token, jobId: event.jobId, eventId: event.id };
    });
    if (!claimed) return;
    let response;
    try { response = await request(config.pushSendUrl, { to: claimed.token, title: 'ANKITA work update', body: 'Your work has an update. Open ANKITA to review it.', sound: 'default', channelId: config.pushChannel, data: { workId: claimed.jobId, eventId: claimed.eventId } }); }
    catch { await update(id, 'sending', event => { event.status = 'uncertain'; event.error = 'send_outcome_unknown'; }); return; }
    await update(id, 'sending', (event, state) => {
      if (response.http === 429 || response.http >= 500) { retry(event, `service_http_${response.http}`); return; }
      if (response.http !== 200) { event.status = 'failed'; event.error = 'service_rejected'; return; }
      const ticket = Array.isArray(response.json?.data) ? response.json.data[0] : response.json?.data;
      if (ticket?.status === 'ok' && typeof ticket.id === 'string' && ticket.id.length > 0 && ticket.id.length <= 256) {
        event.status = 'accepted'; event.ticketId = ticket.id; event.acceptedAt = now(); event.nextAt = now() + config.pushReceiptMs; event.receiptAttempts = 0; delete event.error;
      } else if (ticket?.status === 'error') failure(event, state, ['DeviceNotRegistered', 'MessageRateExceeded', 'MessageTooBig', 'MismatchSenderId', 'InvalidCredentials', 'TOO_MANY_REQUESTS'].includes(ticket.details?.error) ? ticket.details.error : 'push_rejected');
      else { event.status = 'uncertain'; event.error = 'send_response_unknown'; }
    });
  }
  async function receipt(id, snapshot) {
    let response;
    try { response = await request(config.pushReceiptsUrl, { ids: [snapshot.ticketId] }); } catch { /* Retry only this lookup. */ }
    await update(id, 'accepted', (event, state) => {
      event.receiptAttempts = (event.receiptAttempts || 0) + 1;
      const result = response?.http === 200 && response.json?.data?.[event.ticketId];
      if (result?.status === 'ok') { event.status = 'provider_received'; event.receiptAt = now(); delete event.error; }
      else if (result?.status === 'error') failure(event, state, ['DeviceNotRegistered', 'MessageRateExceeded', 'MessageTooBig', 'MismatchSenderId', 'InvalidCredentials', 'TOO_MANY_REQUESTS'].includes(result.details?.error) ? result.details.error : 'provider_rejected');
      else if (event.receiptAttempts >= config.pushMaxAttempts) { event.status = 'receipt_unknown'; event.error = 'receipt_not_confirmed'; }
      else { event.nextAt = now() + config.pushReceiptMs; event.error = 'receipt_not_available'; }
    });
  }
  async function run() {
    // A process can die after the provider accepted a send but before saving its
    // ticket. Replaying such a send would risk a second alert: require review.
    if (Object.values(store.read().outbox).some(event => event.status === 'sending')) await store.change(state => {
      for (const event of Object.values(state.outbox)) if (event.status === 'sending') { event.status = 'uncertain'; event.error = 'interrupted_send_unknown'; const job = state.jobs[event.jobId]; if (job && (!job.notificationId || job.notificationId === event.id)) job.notification = event.status; }
    });
    for (const [id, event] of Object.entries(store.read().outbox).slice(0, config.maxNotices)) {
      if (event.nextAt > now()) continue;
      if (event.status === 'pending') await send(id);
      else if (event.status === 'accepted' && typeof event.ticketId === 'string') await receipt(id, event);
    }
  }
  return { tick() { if (!running) running = run().finally(() => { running = undefined; }); return running; } };
}
