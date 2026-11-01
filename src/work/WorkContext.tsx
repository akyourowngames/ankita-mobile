import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState as Lifecycle, Platform } from 'react-native';
import { useApp } from '../core/AppContext';
import { makeId, newConversation, TITLE_LIMIT, type AppState, type Message } from '../core/state';
import { assistantPrompt } from '../core/assistant';
import { attachmentMessages } from '../assistant/attachments';
import { buildMemoryContext } from '../assistant/retrieval';
import { ASSISTANT_LIMITS, ASSISTANT_SECRET_IDS } from '../assistant/config';
import { MAX_CONTEXT_MESSAGES } from '../constants/appConfig';
import { getKey, putKey } from '../storage/persistence';
import { workClient, WorkConnectionError } from './client';
import { applyWorkResult } from './delivery';
import { isWorkTerminal, type LocalWork, type WorkInput, type WorkNotice } from './records';
import { createWorkNotifications } from './notifications';
import policy from './policy.cjs';
import config from '../constants/work.json';

type Actions = {
  queue(prompt: string, fileIds: string[]): Promise<boolean>; refresh(): Promise<void>;
  cancel(id: string): Promise<void>; resume(id: string): Promise<void>; remove(id: string): Promise<void>;
  connect(base: string, key: string): Promise<void>; disconnect(): Promise<void>;
  enableNotifications(enabled: boolean): Promise<void>; registerPush(projectId: string): Promise<void>;
  testNotification(): Promise<void>; open(id: string): void; markRead(id: string): Promise<void>;
  selectedId: string | null; pending: boolean; error: string;
};
const Context = createContext<Actions | null>(null);
export function useWork() { const value = useContext(Context); if (!value) throw new Error('Work context missing'); return value; }
const safeError = (error: unknown) => error instanceof WorkConnectionError ? error.message : error instanceof Error && /^(Choose|Connect|Keep|Remove|Enter|Notification|Push|Work |Saved |Your |The worker|This worker)/.test(error.message) ? error.message : 'Work could not be updated. Check the worker connection and available storage, then retry.';

export function WorkProvider({ children }: { children: ReactNode }) {
  const app = useApp(), latest = useRef(app); latest.current = app;
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [selectedId, setSelected] = useState<string | null>(null);
  const actionBusy = useRef(false), syncing = useRef<Promise<void> | null>(null), epoch = useRef(new AbortController());
  const notifications = useRef(createWorkNotifications(Platform.OS)).current;
  const commit = (deviceId: string, update: (state: AppState) => AppState, signal = epoch.current.signal) => latest.current.commitState(state => state.work.deviceId === deviceId ? update(state) : state, signal);
  async function action<T>(operation: () => Promise<T>): Promise<T> {
    if (actionBusy.current) throw new Error('Work is already updating. Please wait.');
    actionBusy.current = true; setPending(true); setError('');
    try { return await operation(); } catch (cause) { const message = safeError(cause); setError(message); throw new Error(message); }
    finally { actionBusy.current = false; setPending(false); }
  }
  async function client(signal = epoch.current.signal) {
    const { connection } = latest.current.state.work;
    if (!connection.enabled) throw new Error('Connect your trusted worker in Settings first.');
    const key = await getKey(ASSISTANT_SECRET_IDS.worker); signal.throwIfAborted();
    return workClient(connection.baseUrl, key, signal);
  }
  async function noticeDelivery(deviceId: string, signal: AbortSignal) {
    // A persisted claim precedes OS delivery. An app crash after the claim is
    // shown as unknown instead of automatically presenting a duplicate alert.
    for (const item of latest.current.state.work.notices) {
      signal.throwIfAborted();
      const snapshot = latest.current.state.work;
      const job = snapshot.jobs.find(job => job.id === item.workId);
      if (item.delivery === 'push' && ['failed', 'unavailable', 'uncertain', 'receipt_unknown'].includes(job?.notification || '')) {
        const uncertain = ['uncertain', 'receipt_unknown'].includes(job?.notification || '');
        await commit(deviceId, state => ({ ...state, work: { ...state.work, notices: state.work.notices.map(notice => notice.id === item.id ? { ...notice, delivery: uncertain ? 'unknown' : 'failed', error: uncertain ? 'Push delivery could not be confirmed. The result remains here; no duplicate alert was sent.' : 'Push delivery failed. Check the registered project, device permission and platform credentials.' } : notice) } }), signal); continue;
      }
      if (!['pending', 'sending'].includes(item.delivery)) continue;
      const push = snapshot.notifications.registered || ['sending', 'accepted', 'provider_received', 'uncertain', 'receipt_unknown'].includes(job?.notification || '');
      let delivery: WorkNotice['delivery'] = !snapshot.notifications.enabled ? 'disabled' : push ? 'push' : item.delivery === 'sending' ? 'unknown' : 'sending';
      await commit(deviceId, state => ({ ...state, work: { ...state.work, notices: state.work.notices.map(notice => notice.id === item.id ? { ...notice, delivery } : notice) } }), signal);
      if (delivery !== 'sending') continue;
      let detail = '';
      try { await notifications.present({ workId: item.workId, eventId: item.id }); delivery = 'scheduled'; }
      catch { delivery = 'failed'; detail = 'The phone could not schedule this alert. Check notification permission. Your result remains in the inbox.'; }
      await commit(deviceId, state => ({ ...state, work: { ...state.work, notices: state.work.notices.map(notice => notice.id === item.id ? { ...notice, delivery, ...(detail ? { error: detail } : {}) } : notice) } }), signal);
    }
  }
  async function reconcile(force = false) {
    if (syncing.current) return syncing.current;
    const snapshot = latest.current.state.work, deviceId = snapshot.deviceId, signal = epoch.current.signal;
    if (!latest.current.ready || !snapshot.connection.enabled) return;
    const task = (async () => {
      const remote = await client(signal);
      if (snapshot.notifications.revokePending) { await remote.unregister(deviceId); await commit(deviceId, state => ({ ...state, work: { ...state.work, notifications: { ...state.work.notifications, revokePending: false } } }), signal); }
      for (const saved of snapshot.jobs) {
        signal.throwIfAborted();
        const awaitingReceipt = ['pending', 'sending', 'accepted'].includes(saved.notification || '');
        if (!force && !awaitingReceipt && isWorkTerminal(saved.status) && (saved.status !== 'completed' || saved.delivered)) continue;
        // Refetch current intent after awaiting preceding jobs: a cancellation
        // may have been saved while this polling pass was in flight.
        const job = latest.current.state.work.jobs.find(item => item.id === saved.id); if (!job) continue;
        try {
          let result: unknown;
          if (job.cancelRequested) {
            try { result = await remote.cancel(job.id); }
            catch (cause) { if (!(cause instanceof WorkConnectionError) || cause.status !== 404) throw cause; result = { ...job, status: 'cancelled', progress: 'Cancelled before submission', updatedAt: Date.now() }; }
          } else {
            try { result = await remote.get(job.id); }
            catch (cause) {
              if (!(cause instanceof WorkConnectionError) || cause.status !== 404 || job.submitted) throw cause;
              const key = await getKey(job.request.provider.id), searchKey = job.request.search ? await getKey(ASSISTANT_SECRET_IDS.search) : '';
              signal.throwIfAborted(); result = await remote.submit(job.request, key, searchKey);
            }
          }
          await commit(deviceId, state => applyWorkResult(state, job.id, result), signal);
        } catch (cause) {
          signal.throwIfAborted(); const message = safeError(cause);
          await commit(deviceId, state => ({ ...state, work: { ...state.work, jobs: state.work.jobs.map(item => item.id === job.id ? { ...item, lastConnectionError: message } : item) } }), signal);
          if (force) throw cause;
        }
      }
      await noticeDelivery(deviceId, signal);
    })();
    syncing.current = task;
    try { await task; } finally { if (syncing.current === task) syncing.current = null; }
  }
  useEffect(() => {
    epoch.current.abort(); epoch.current = new AbortController(); const signal = epoch.current.signal;
    let timer: ReturnType<typeof setTimeout> | undefined, active = true;
    const poll = async () => { if (!active || signal.aborted || !latest.current.ready || !latest.current.state.work.connection.enabled) return; try { await reconcile(); } catch { /* Per-job errors stay visible; no unhandled background rejection. */ } if (active && !signal.aborted) timer = setTimeout(poll, config.pollMs); };
    void poll(); const sub = Lifecycle.addEventListener('change', state => { active = state === 'active'; if (timer) clearTimeout(timer); if (active) void poll(); });
    return () => { epoch.current.abort(); active = false; if (timer) clearTimeout(timer); sub.remove(); };
  }, [app.ready, app.state.work.deviceId, app.state.work.connection.baseUrl, app.state.work.connection.enabled]);
  useEffect(() => {
    if (!app.ready) return; let disposed = false, cleanup: (() => void) | undefined;
    void notifications.attachOpenHandler((id) => { const current = latest.current, job = current.state.work.jobs.find(job => job.id === id); if (!job) return; setSelected(id); if (current.state.conversations.some(chat => chat.id === job.conversationId)) current.openChat(job.conversationId); else current.navigate('work'); void current.commitState(state => ({ ...state, work: { ...state.work, notices: state.work.notices.map(notice => notice.workId === id ? { ...notice, read: true } : notice) } })).catch(() => {}); }).then(stop => { if (disposed) stop(); else cleanup = stop; }).catch(() => {});
    return () => { disposed = true; cleanup?.(); };
  }, [app.ready, app.state.work.deviceId]);
  const initialDevice = useRef<string | null>(null);
  useEffect(() => { if (!app.ready) return; if (initialDevice.current === null) initialDevice.current = app.state.work.deviceId; else if (initialDevice.current !== app.state.work.deviceId) { initialDevice.current = app.state.work.deviceId; setSelected(null); void notifications.clear().catch(() => {}); } }, [app.ready, app.state.work.deviceId]);
  const value: Actions = {
    selectedId, pending, error,
    queue: (text, selected) => action(async () => {
      const current = latest.current, snapshot = current.state;
      if (!snapshot.work.connection.enabled) { current.navigate('work'); return false; }
      if (current.busy) throw new Error('Keep the current reply finished or stopped before queuing work.');
      if (snapshot.work.jobs.length >= config.maxJobs) throw new Error('Remove an old work record before queuing another.');
      const mate = snapshot.teammates.find(item => item.id === snapshot.activeTeammateId) || snapshot.teammates[0];
      const selectedProvider = snapshot.providers.find(item => item.id === (mate.providerId || snapshot.activeProviderId));
      if (!selectedProvider || selectedProvider.kind === 'chief') { current.navigate('providers'); throw new Error('Choose an OpenAI-compatible or Anthropic provider for persistent work.'); }
      const provider = { id: selectedProvider.id, name: selectedProvider.name, kind: selectedProvider.kind, baseUrl: selectedProvider.baseUrl, model: mate.model || selectedProvider.model, keyRequired: selectedProvider.keyRequired };
      if (!provider.model) throw new Error('Choose a model before queuing work.');
      if (provider.keyRequired && !await getKey(provider.id)) throw new Error('Enter your provider API key before queuing work.');
      const prompt = text.trim() || 'Work with the selected files.';
      if (prompt.length > config.promptChars) throw new Error('Work requests can contain at most 16,000 characters.');
      const fileIds = [...new Set(selected)].filter(id => snapshot.assistant.library.some(item => item.id === id)).slice(0, ASSISTANT_LIMITS.messageFiles);
      const chat = snapshot.conversations.find(item => item.id === current.chatId) || { ...newConversation(), teammateId: mate.id };
      const id = makeId(), messageId = makeId(), now = Date.now();
      const user: Message = { id: makeId(), role: 'user', content: prompt, status: 'complete', ...(fileIds.length ? { fileIds } : {}) };
      const request: WorkInput = { id, deviceId: snapshot.work.deviceId, title: prompt.slice(0, TITLE_LIMIT), prompt, system: assistantPrompt(snapshot.settings, mate, snapshot.assistant, prompt), messages: attachmentMessages([...chat.messages, user].slice(-MAX_CONTEXT_MESSAGES), snapshot.assistant), provider, ...(snapshot.assistant.webSearch.kind === 'none' ? {} : { search: { ...snapshot.assistant.webSearch } as WorkInput['search'] }) };
      if (request.system.length > config.systemChars || request.messages.reduce((size, item) => size + item.content.length, 0) > config.historyChars || JSON.stringify(request).length > config.maxRequestBytes / 2) throw new Error('Work context is too large. Start a new conversation or select smaller files.');
      const job: LocalWork = { id, title: request.title, status: 'queued', progress: 'Saved on this device; waiting for the worker', reply: '', error: '', artifacts: [], createdAt: now, updatedAt: now, request, conversationId: chat.id, messageId, teammateId: mate.id, submitted: false, delivered: false };
      const reply: Message = { id: messageId, role: 'assistant', content: '', status: 'complete', workId: id, memoryIds: buildMemoryContext(snapshot.assistant, prompt).ids };
      await commit(snapshot.work.deviceId, state => ({ ...state, work: { ...state.work, jobs: [job, ...state.work.jobs] }, conversations: [{ ...(state.conversations.find(item => item.id === chat.id) || chat), title: chat.messages.length ? chat.title : request.title, providerId: provider.id, model: provider.model, updatedAt: now, messages: [...(state.conversations.find(item => item.id === chat.id)?.messages || chat.messages), user, reply] }, ...state.conversations.filter(item => item.id !== chat.id)] }));
      current.openChat(chat.id); return true;
    }),
    refresh: () => action(() => reconcile(true)),
    connect: (base, key) => action(async () => {
      const normalized = new URL(policy.workerURL(base)).origin, saved = latest.current.state.work;
      if (saved.jobs.length && saved.connection.baseUrl && normalized !== saved.connection.baseUrl) throw new Error('Remove existing work records before switching to a different worker. Reconnect to the original worker to recover them.');
      await workClient(normalized, key, epoch.current.signal).capabilities();
      await putKey(ASSISTANT_SECRET_IDS.worker, key);
      await commit(saved.deviceId, state => ({ ...state, work: { ...state.work, connection: { baseUrl: normalized, enabled: true } } }));
    }),
    disconnect: () => action(async () => {
      const saved = latest.current.state.work;
      let revokePending = !!(saved.notifications.registered || saved.notifications.revokePending);
      if (revokePending) try { await (await client()).unregister(saved.deviceId); revokePending = false; } catch { setError('Local worker connection closed. Push revocation is waiting for a reconnect; remote alerts may still arrive.'); }
      await notifications.clear();
      await commit(saved.deviceId, state => ({ ...state, work: { ...state.work, connection: { ...state.work.connection, enabled: false }, notifications: { ...state.work.notifications, registered: false, revokePending } } }));
      await putKey(ASSISTANT_SECRET_IDS.worker, '');
    }),
    cancel: id => action(async () => {
      const saved = latest.current.state.work;
      await commit(saved.deviceId, state => ({ ...state, work: { ...state.work, jobs: state.work.jobs.map(job => job.id === id && !isWorkTerminal(job.status) ? { ...job, cancelRequested: true, progress: 'Stop requested; reconnect to confirm cancellation' } : job) } }));
      // A saved cancellation intent survives an offline worker and is applied
      // before fetching a result on the next reconciliation.
      const remote = await client(); let result: unknown;
      try { result = await remote.cancel(id); }
      catch (cause) { const job = saved.jobs.find(job => job.id === id); if (!(cause instanceof WorkConnectionError) || cause.status !== 404 || !job || job.submitted) throw cause; result = { ...job, status: 'cancelled', progress: 'Cancelled before submission', updatedAt: Date.now() }; }
      await commit(saved.deviceId, state => applyWorkResult(state, id, result));
    }),
    resume: id => action(async () => { const saved = latest.current.state.work; const result = await (await client()).resume(id); await commit(saved.deviceId, state => applyWorkResult(state, id, result)); }),
    remove: id => action(async () => { const saved = latest.current.state.work, job = saved.jobs.find(job => job.id === id); if (!job || !isWorkTerminal(job.status)) throw new Error('Work must finish or be cancelled before removing its record.'); await (await client()).remove(id); await commit(saved.deviceId, state => ({ ...state, work: { ...state.work, jobs: state.work.jobs.filter(job => job.id !== id), notices: state.work.notices.filter(notice => notice.workId !== id) } })); if (selectedId === id) setSelected(null); }),
    enableNotifications: enabled => action(async () => {
      const saved = latest.current.state.work;
      if (enabled && !await notifications.requestPermission()) throw new Error('Notification permission is required. Enable it in phone settings.');
      if (!enabled) await notifications.clear();
      const revokePending = !enabled && !!(saved.notifications.registered || saved.notifications.revokePending);
      await commit(saved.deviceId, state => ({ ...state, work: { ...state.work, notifications: { ...state.work.notifications, enabled, registered: enabled && state.work.notifications.registered, revokePending: revokePending || enabled && !!state.work.notifications.revokePending } } }));
      if (revokePending) try { await (await client()).unregister(saved.deviceId); await commit(saved.deviceId, state => ({ ...state, work: { ...state.work, notifications: { ...state.work.notifications, revokePending: false } } })); } catch { setError('Local alerts are disabled. Push revocation is waiting for the worker to reconnect; remote alerts may still arrive.'); }
    }),
    registerPush: projectId => action(async () => { const saved = latest.current.state.work; const token = await notifications.register(projectId); await (await client()).register(saved.deviceId, token); await commit(saved.deviceId, state => ({ ...state, work: { ...state.work, notifications: { enabled: true, projectId: projectId.trim(), registered: true } } })); }),
    testNotification: () => action(async () => { await notifications.test(); }),
    open: id => { setSelected(id); latest.current.navigate('work'); },
    markRead: id => action(async () => { const saved = latest.current.state.work; await commit(saved.deviceId, state => ({ ...state, work: { ...state.work, notices: state.work.notices.map(notice => notice.id === id ? { ...notice, read: true } : notice) } })); }),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
