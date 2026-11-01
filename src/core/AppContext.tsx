import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState as Lifecycle } from 'react-native';
import { postChat } from '../api/chiefClient';
import { clearAssetStore, deleteKeys, getKey, loadState, putKey, saveState } from '../storage/persistence';
import { initialState, makeId, newConversation, TITLE_LIMIT, updateMessage, type AppState, type Provider, type Settings } from './state';
import { CHIEF_ID, withoutProvider, teammateOwnsChat, type Teammate, type IntegrationConfig } from './state';
import { assistantPrompt } from './assistant';
import composioConfig from '../constants/composio.json';
import { createStateWriter } from '../storage/stateWriter';
import { ApprovalQueue, type ApprovalRequest } from '../assistant/approvals';
import type { AssistantState, ToolReceipt, TaskInput } from '../assistant/types';
import { ASSISTANT_LIMITS, ASSISTANT_SECRET_IDS } from '../assistant/config';
import { publicFetch, companionFetch } from '../api/transport';
import { phoneReminders } from '../assistant/phonePlatform';
import { createReminderService } from '../assistant/reminders';
import { attachmentMessages } from '../assistant/attachments';
import { createMemoryConsolidator } from '../assistant/consolidation';
import { extractPersonalMemories, type ModelMemoryInput } from '../api/memoryExtraction';
import { providerFetch } from '../api/transport';
import { ProviderError } from '../api/providerErrors';
import { buildMemoryContext } from '../assistant/retrieval';
import { clearIncomingShares } from '../sharing/platform';

export type Screen = 'chat' | 'history' | 'settings' | 'providers' | 'appearance' | 'profile' | 'behavior' | 'privacy' | 'about' | 'teammates' | 'plugins' | 'assistant' | 'memory' | 'tasks' | 'library' | 'tools' | 'work' | 'outputs' | 'desktop';
const SAVE_DELAY_MS = 300; // Milliseconds: coalesce streaming UI changes into bounded storage writes.
const STREAM_PAINT_MS = 32; // Milliseconds: cap stream renders while retaining every provider token.
type Actions = {
  state: AppState; ready: boolean; loadError: string; storageError: string; busy: boolean;
  screen: Screen; chatId: string | null; navigate: (screen: Screen) => void;
  pairingLink: string | null; setPairingLink: (value: string | null) => void;
  patchSettings: (patch: Partial<Settings>) => void; finishOnboarding: () => void;
  saveTeammate: (mate: Teammate) => void; removeTeammate: (id: string) => void; chooseTeammate: (id: string) => void; patchIntegrations: (patch: Partial<IntegrationConfig>) => void;
  cacheModels: (id: string, models: string[]) => void;
  saveProvider: (provider: Provider, key?: string) => Promise<void>; removeProvider: (id: string) => Promise<void>; chooseProvider: (id: string) => void; chooseModel: (providerId: string, model: string) => void;
  newChat: () => void; openChat: (id: string) => void; deleteChat: (id: string) => void; renameChat: (id: string, title: string) => void; pinChat: (id: string) => void;
  send: (text: string, retry?: boolean, fileIds?: string[]) => Promise<void>; stop: () => void;
  clearHistory: () => void; reset: () => Promise<void>; retryLoad: () => void;
  commitAssistant: (update: (state: AssistantState) => AssistantState) => Promise<void>;
  assistantDataEpoch: number;
  commitState: (update: (state: AppState) => AppState, signal?: AbortSignal) => Promise<void>;
  approvals: ApprovalRequest[]; resolveApproval: (id: string, approved: boolean) => void; allowApprovalTool: (id: string, toolName: string) => Promise<void>;
  savePhoneTask: (input: TaskInput) => Promise<void>; completePhoneTask: (id: string) => Promise<void>; removePhoneTask: (id: string) => Promise<void>; scheduleReminder: (id: string) => Promise<void>; cancelReminder: (id: string) => Promise<void>;
  memoryStatus: 'idle' | 'checking' | 'unavailable';
  clearAssistantRecords: () => Promise<void>;
};
const Context = createContext<Actions | null>(null);
export const useApp = () => { const app = useContext(Context); if (!app) throw new Error('App context missing'); return app; };

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, renderState] = useState(initialState), stateRef = useRef(state);
  const setState = (update: AppState | ((state: AppState) => AppState)) => { const next = typeof update === 'function' ? update(stateRef.current) : update; stateRef.current = next; renderState(next); };
  const writer = useRef<ReturnType<typeof createStateWriter> | null>(null);
  if (!writer.current) writer.current = createStateWriter({ get: () => stateRef.current, publish: setState, persist: saveState });
  const reminders = useRef<ReturnType<typeof createReminderService> | null>(null);
  if (!reminders.current) reminders.current = createReminderService({ get: () => stateRef.current.assistant, commit: (update, signal) => writer.current!.commit(update, signal) }, { id: makeId, now: Date.now }, phoneReminders);
  const approvalQueue = useRef(new ApprovalQueue()), [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [memoryStatus, setMemoryStatus] = useState<Actions['memoryStatus']>('idle');
  const memoryJob = useRef<ReturnType<typeof createMemoryConsolidator<ModelMemoryInput>> | null>(null);
  if (!memoryJob.current) memoryJob.current = createMemoryConsolidator<ModelMemoryInput>({ store: { get: () => stateRef.current.assistant, commit: (update, signal) => writer.current!.commit(update, signal) }, clock: { id: makeId, now: Date.now }, extract: (input, signal) => extractPersonalMemories(input, providerFetch, signal), status: setMemoryStatus });
  const [ready, setReady] = useState(false), [loadError, setLoadError] = useState(''), [storageError, setStorageError] = useState('');
  const [screen, navigate] = useState<Screen>('chat'), [chatId, setChatId] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [pairingLink, setPairingLink] = useState<string | null>(null);
  // Ephemeral editors must forget private drafts after an explicit data clear.
  // Ordinary record deletion and screen changes leave that session intact.
  const [assistantDataEpoch, setAssistantDataEpoch] = useState(0);
  const active = useRef<{ controller: AbortController; chatId: string; providerId: string; teammateId: string } | null>(null);
  const load = () => { setLoadError(''); loadState().then(saved => { setState(saved); setChatId(saved.conversations.find(c => (c.teammateId || CHIEF_ID) === saved.activeTeammateId)?.id || null); setReady(true); }).catch(error => setLoadError(error instanceof Error ? error.message : 'Local storage is unavailable. Retry or reset your local data.')); };
  useEffect(load, []);
  useEffect(() => { if (!ready) return; const timer = setTimeout(() => { writer.current!.save().then(() => setStorageError('')).catch(() => setStorageError('Changes could not be saved on this device. Keep the app open and check available storage.')); }, SAVE_DELAY_MS); return () => clearTimeout(timer); }, [state, ready]);
  useEffect(() => { const sub = Lifecycle.addEventListener('change', next => { if (next !== 'active') memoryJob.current?.cancel(); if (next !== 'active' && ready) void writer.current!.save().catch(() => setStorageError('Changes could not be saved on this device.')); }); return () => sub.remove(); }, [ready]);
  useEffect(() => approvalQueue.current.subscribe(() => setApprovals(approvalQueue.current.pending())), []);
  useEffect(() => () => { active.current?.controller.abort(); memoryJob.current?.cancel(); }, []);
  const patchSettings = (patch: Partial<Settings>) => setState(s => ({ ...s, settings: { ...s.settings, ...patch } }));
  const chooseProvider = (id: string) => setState(s => ({ ...s, activeProviderId: id, teammates: s.teammates.map(m => m.id === s.activeTeammateId ? { ...m, providerId: id, model: '' } : m) }));
  // Switches provider and model together so the picker is one step from chat.
  const chooseModel = (providerId: string, model: string) => setState(s => ({ ...s, activeProviderId: providerId, teammates: s.teammates.map(m => m.id === s.activeTeammateId ? { ...m, providerId, model } : m) }));
  const stop = () => active.current?.controller.abort();
  const newChat = () => {
    const empty = stateRef.current.conversations.find(c => !c.messages.length && (c.teammateId || CHIEF_ID) === stateRef.current.activeTeammateId);
    if (empty) setChatId(empty.id);
    else { const chat = { ...newConversation(), teammateId: stateRef.current.activeTeammateId }; setState(s => ({ ...s, conversations: [chat, ...s.conversations] })); setChatId(chat.id); }
    navigate('chat');
  };
  async function send(text: string, retry = false, selectedFiles: string[] = []) {
    if (active.current || (!text.trim() && !retry && !selectedFiles.length)) return;
    memoryJob.current?.cancel();
    const snapshot = stateRef.current;
    const teammate = snapshot.teammates.find(m => m.id === snapshot.activeTeammateId) || snapshot.teammates[0];
    const selectedProvider = snapshot.providers.find(p => p.id === (teammate.providerId || snapshot.activeProviderId));
    const provider = selectedProvider ? { ...selectedProvider, model: teammate.model || selectedProvider.model } : undefined;
    if (!provider) { navigate('providers'); return; }
    let chat = snapshot.conversations.find(c => c.id === chatId) || newConversation();
    const id = chat.id, assistantId = makeId(), controller = new AbortController();
    const base = retry && chat.messages.at(-1)?.role === 'assistant' ? chat.messages.slice(0, -1) : chat.messages;
    const fileIds = [...new Set(selectedFiles)].filter(id => snapshot.assistant.library.some(item => item.id === id)).slice(0, ASSISTANT_LIMITS.messageFiles);
    const messages = [...base, ...(!retry ? [{ id: makeId(), role: 'user' as const, content: text.trim(), status: 'complete' as const, ...(fileIds.length ? { fileIds } : {}) }] : [])];
    if (!messages.length || messages.at(-1)?.role !== 'user') return;
    const recalled = buildMemoryContext(snapshot.assistant, messages.at(-1)!.content);
    chat = { ...chat, teammateId: teammate.id, title: chat.messages.length ? chat.title : (text.trim() || snapshot.assistant.library.find(item => item.id === fileIds[0])?.title || 'Selected document').slice(0, TITLE_LIMIT), providerId: provider.id, model: provider.model, updatedAt: Date.now(), messages: [...messages, { id: assistantId, role: 'assistant', content: '', status: 'streaming', memoryIds: recalled.ids }] };
    active.current = { controller, chatId: id, providerId: provider.id, teammateId: teammate.id }; setBusy(true); setChatId(id);
    setState(s => ({ ...s, conversations: [chat, ...s.conversations.filter(c => c.id !== id)] }));
    let content = '', lastActivity = ''; let paint: ReturnType<typeof setTimeout> | undefined;
    const flush = () => { if (paint) clearTimeout(paint); paint = undefined; setState(s => ({ ...s, conversations: updateMessage(s.conversations, id, assistantId, { content }) })); };
    try {
      const key = await getKey(provider.id), composioKey = snapshot.integrations.enabled ? await getKey(composioConfig.secretId) : '', searchKey = await getKey(ASSISTANT_SECRET_IDS.search), desktopKey = await getKey(ASSISTANT_SECRET_IDS.desktop); controller.signal.throwIfAborted();
      const user = messages.at(-1)!;
      const event = (receipt: ToolReceipt) => setState(s => ({ ...s, conversations: s.conversations.map(chat => chat.id !== id ? chat : { ...chat, messages: chat.messages.map(message => message.id !== assistantId ? message : { ...message, tools: [...(message.tools || []).filter(item => item.id !== receipt.id), receipt].slice(-ASSISTANT_LIMITS.toolReceipts) }) }) }));
      await postChat(provider, key, attachmentMessages(messages, snapshot.assistant), assistantPrompt(snapshot.settings, teammate, snapshot.assistant, user.content), controller.signal, delta => {
        if (controller.signal.aborted) return; content += delta;
        if (!paint) paint = setTimeout(flush, STREAM_PAINT_MS);
      }, { integrations: snapshot.integrations, composioKey, phone: { store: { get: () => stateRef.current.assistant, commit: (update, signal) => writer.current!.commit(update, signal) }, clock: { id: makeId, now: Date.now }, user: { conversationId: id, messageId: user.id, text: user.content }, approve: (request, signal) => approvalQueue.current.request(request, signal), event, publicFetch, searchKey, desktopFetch: companionFetch, desktopKey, reminderService: reminders.current!, secrets: [key, composioKey, searchKey, desktopKey] }, activity: activity => { if (!controller.signal.aborted && lastActivity !== activity) { lastActivity = activity; setState(s => ({ ...s, conversations: updateMessage(s.conversations, id, assistantId, { activity }) })); } } });
      setState(s => ({ ...s, conversations: updateMessage(s.conversations, id, assistantId, { content, status: 'complete' }) }));
      if (!controller.signal.aborted && provider.kind !== 'chief') memoryJob.current?.enqueue({ provider, key, user: { conversationId: id, messageId: user.id, text: user.content }, secrets: [key, composioKey, searchKey, desktopKey] });
    } catch (error) {
      const stopped = controller.signal.aborted;
      // Request/library failures may contain headers or remote payloads: expose only our known safe messages.
      const raw = error instanceof Error ? error.message : '';
      const safe = error instanceof ProviderError || /^(Provider returned HTTP|Add your API key|Add your Composio|Composio returned|Choose a model|The provider|The response|The assistant turn|Use an|Use HTTPS|Enter the full)/.test(raw) ? raw : 'Could not reach this provider. Check your connection, endpoint and API key, then retry.';
      setState(s => ({ ...s, conversations: updateMessage(s.conversations, id, assistantId, { content, status: stopped ? 'stopped' : 'error', ...(stopped ? {} : { error: safe }) }) }));
    } finally { if (paint) clearTimeout(paint); if (active.current?.controller === controller) { active.current = null; setBusy(false); } }
  }
  useEffect(() => { if (ready && state.assistant.tasks.some(task => task.notificationId)) void phoneReminders.initialize().catch(() => {}); }, [ready, state.assistant.tasks]);
  const value: Actions = {
    state, ready, loadError, storageError, busy, screen, chatId, navigate, pairingLink, setPairingLink, patchSettings, stop, send, memoryStatus, assistantDataEpoch,
    commitState: (update, signal = new AbortController().signal) => writer.current!.transaction(update, signal),
    approvals, resolveApproval: (id, approved) => { approvalQueue.current.resolve(id, approved); },
    // Persist the allow policy before releasing the waiting tool so a later run
    // reads the saved choice instead of asking again.
    allowApprovalTool: async (id, toolName) => { await writer.current!.commit(state => ({ ...state, toolPolicies: { ...state.toolPolicies, [toolName]: 'allow' } }), new AbortController().signal); approvalQueue.current.resolve(id, true); },
    commitAssistant: async update => { await writer.current!.commit(update, new AbortController().signal); if (!stateRef.current.assistant.preferences.suggestMemories) memoryJob.current?.cancel(); },
    savePhoneTask: async input => { await reminders.current!.save(input, new AbortController().signal); },
    completePhoneTask: async id => { await reminders.current!.complete(id, new AbortController().signal); },
    removePhoneTask: async id => { await reminders.current!.remove(id, new AbortController().signal); },
    scheduleReminder: async id => { await reminders.current!.schedule(id, new AbortController().signal); },
    cancelReminder: async id => { await reminders.current!.cancel(id, new AbortController().signal); },
    clearAssistantRecords: async () => { stop(); memoryJob.current?.cancel(); await clearIncomingShares(); await reminders.current!.clear(new AbortController().signal); await clearAssetStore().catch(() => {}); setAssistantDataEpoch(value => value + 1); },
    finishOnboarding: () => { setState(s => ({ ...s, onboardingDone: true })); navigate('chat'); },
    chooseProvider, chooseModel,
    saveTeammate: mate => setState(s => ({ ...s, teammates: [...s.teammates.filter(m => m.id !== mate.id), mate] })),
    removeTeammate: id => {
      if (id === CHIEF_ID) return;
      const snapshot = stateRef.current;
      if (active.current?.teammateId === id) stop();
      if (snapshot.activeTeammateId === id || teammateOwnsChat(snapshot, id, chatId)) setChatId(null);
      setState(s => ({ ...s, teammates: s.teammates.filter(m => m.id !== id), activeTeammateId: s.activeTeammateId === id ? CHIEF_ID : s.activeTeammateId }));
    },
    chooseTeammate: id => { setState(s => ({ ...s, activeTeammateId: id })); setChatId(stateRef.current.conversations.find(c => (c.teammateId || CHIEF_ID) === id)?.id || null); navigate('chat'); },
    patchIntegrations: patch => setState(s => ({ ...s, integrations: { ...s.integrations, ...patch } })),
    cacheModels: (id, models) => setState(s => ({ ...s, providers: s.providers.map(p => p.id === id ? { ...p, models, modelsUpdatedAt: Date.now() } : p) })),
    saveProvider: async (provider, key) => { if (key !== undefined) await putKey(provider.id, key); setState(s => ({ ...s, providers: [...s.providers.filter(p => p.id !== provider.id), provider], activeProviderId: s.activeProviderId || provider.id })); },
    removeProvider: async id => { if (active.current?.providerId === id) stop(); await putKey(id, ''); setState(s => withoutProvider(s, id)); },
    newChat, openChat: id => { const chat = stateRef.current.conversations.find(c => c.id === id); setChatId(id); setState(s => ({ ...s, activeTeammateId: s.teammates.some(m => m.id === chat?.teammateId) ? chat!.teammateId! : CHIEF_ID })); navigate('chat'); },
    deleteChat: id => { memoryJob.current?.cancel(); if (active.current?.chatId === id) stop(); setState(s => ({ ...s, conversations: s.conversations.filter(c => c.id !== id) })); if (chatId === id) setChatId(null); },
    renameChat: (id, title) => { if (title.trim()) setState(s => ({ ...s, conversations: s.conversations.map(c => c.id === id ? { ...c, title: title.trim() } : c) })); },
    pinChat: id => setState(s => ({ ...s, conversations: s.conversations.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c) })),
    clearHistory: () => { stop(); memoryJob.current?.cancel(); setState(s => ({ ...s, conversations: [] })); setChatId(null); },
    reset: async () => { stop(); memoryJob.current?.cancel(); approvalQueue.current.cancelAll(); await clearIncomingShares(); await reminders.current!.clear(new AbortController().signal); setAssistantDataEpoch(value => value + 1); await deleteKeys([...stateRef.current.providers.map(p => p.id), composioConfig.secretId, ...Object.values(ASSISTANT_SECRET_IDS)]); await writer.current!.replace(initialState()); await clearAssetStore().catch(() => {}); setChatId(null); setReady(true); setLoadError(''); navigate('chat'); },
    retryLoad: load,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
