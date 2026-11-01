import { DATA_VERSION, DEFAULT_SYSTEM_PROMPT } from '../constants/appConfig.ts';
import { emptyAssistantState, restoreAssistantState } from '../assistant/records.ts';
import { restoreToolReceipts, identity } from '../assistant/validation.ts';
import { ASSISTANT_LIMITS } from '../assistant/config.ts';
import type { AssistantState, ToolReceipt } from '../assistant/types.ts';
import { emptyWorkState, restoreWorkState, type WorkState } from '../work/records.ts';

export type ThemeMode = 'dark' | 'light' | 'system';
export type Accent = 'lavender' | 'blue' | 'sage' | 'amber';
export type ProviderKind = 'openai' | 'anthropic' | 'chief';
export type Provider = { id: string; name: string; kind: ProviderKind; baseUrl: string; model: string; keyRequired: boolean; models?: string[]; modelsUpdatedAt?: number };
export type Teammate = { id: string; name: string; description: string; instructions: string; providerId: string | null; model: string };
export type IntegrationConfig = { enabled: boolean; userId: string; toolkits: string[] };
export const CHIEF_ID = 'chief'; // Stable built-in teammate identity for migration and conversation ownership.
export function withoutProvider(state: AppState, id: string): AppState {
  const providers = state.providers.filter(p => p.id !== id);
  return { ...state, providers, activeProviderId: state.activeProviderId === id ? providers[0]?.id || null : state.activeProviderId, teammates: state.teammates.map(m => m.providerId === id ? { ...m, providerId: null, model: '' } : m) };
}
export function teammateOwnsChat(state: AppState, teammateId: string, chatId: string | null): boolean {
  return !!chatId && (state.conversations.find(c => c.id === chatId)?.teammateId || CHIEF_ID) === teammateId;
}
export type Message = { id: string; role: 'user' | 'assistant'; content: string; status: 'complete' | 'streaming' | 'stopped' | 'error'; error?: string; activity?: string; tools?: ToolReceipt[]; fileIds?: string[]; workId?: string; memoryIds?: string[] };
export type Conversation = { id: string; title: string; createdAt: number; updatedAt: number; providerId?: string; model?: string; teammateId?: string; pinned: boolean; messages: Message[] };
export type Settings = { name: string; theme: ThemeMode; accent: Accent; textSize: 'standard' | 'large'; systemPrompt: string };
export type AppState = { version: number; onboardingDone: boolean; settings: Settings; providers: Provider[]; activeProviderId: string | null; conversations: Conversation[]; teammates: Teammate[]; activeTeammateId: string; integrations: IntegrationConfig; assistant: AssistantState; work: WorkState };
export const TITLE_LIMIT = 48; // Characters: compact conversation list title derived from first user message.
const ALLOWED_THEMES = ['dark', 'light', 'system'];
const ALLOWED_ACCENTS = ['lavender', 'blue', 'sage', 'amber'];
const MESSAGE_STATUSES = ['complete', 'streaming', 'stopped', 'error'];

export function initialState(): AppState {
  return { version: DATA_VERSION, onboardingDone: false, settings: { name: '', theme: 'dark', accent: 'lavender', textSize: 'standard', systemPrompt: DEFAULT_SYSTEM_PROMPT }, providers: [], activeProviderId: null, conversations: [], teammates: [{ id: CHIEF_ID, name: 'Chief', description: 'Your personal assistant', instructions: '', providerId: null, model: '' }], activeTeammateId: CHIEF_ID, integrations: { enabled: false, userId: makeId(), toolkits: [] }, assistant: emptyAssistantState(), work: emptyWorkState() };
}
export function makeId(): string { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
export function newConversation(id = makeId()): Conversation {
  return { id, title: 'New conversation', createdAt: Date.now(), updatedAt: Date.now(), pinned: false, messages: [] };
}
export function updateMessage(conversations: Conversation[], chatId: string, messageId: string, patch: Partial<Message>): Conversation[] {
  return conversations.map(chat => chat.id !== chatId ? chat : { ...chat, updatedAt: Date.now(), messages: chat.messages.map(m => m.id === messageId ? { ...m, ...patch, id: m.id, role: m.role } : m) });
}
export function exportConversation(chat: Conversation, assistantName = 'Chief'): string {
  return `${chat.title}\n${new Date(chat.createdAt).toLocaleString()}\n\n${chat.messages.map(m => `${m.role === 'user' ? 'You' : assistantName}\n${m.content}${m.status === 'stopped' ? '\n[Stopped]' : ''}`).join('\n\n')}`;
}
export function restoreState(raw: string): AppState {
  try {
    const data = JSON.parse(raw);
    const defaults = { ...initialState(), work: restoreWorkState(data.work) };
    if (data.version !== DATA_VERSION || typeof data.onboardingDone !== 'boolean' || !Array.isArray(data.providers) || !Array.isArray(data.conversations) || !data.settings) throw new Error();
    const s = data.settings;
    if (typeof s.name !== 'string' || !ALLOWED_THEMES.includes(s.theme) || !ALLOWED_ACCENTS.includes(s.accent) || !['standard', 'large'].includes(s.textSize) || typeof s.systemPrompt !== 'string') throw new Error();
    const providers: Provider[] = data.providers.map((p: Provider) => {
      if (!p || Object.keys(p).some(k => !['id', 'name', 'kind', 'baseUrl', 'model', 'keyRequired', 'models', 'modelsUpdatedAt'].includes(k)) || ![p.id, p.name, p.baseUrl, p.model].every(v => typeof v === 'string') || !['openai', 'anthropic', 'chief'].includes(p.kind) || typeof p.keyRequired !== 'boolean') throw new Error();
      if (p.models !== undefined && (!Array.isArray(p.models) || !p.models.every(m => typeof m === 'string'))) throw new Error();
      if (p.modelsUpdatedAt !== undefined && !Number.isFinite(p.modelsUpdatedAt)) throw new Error();
      return { id: p.id, name: p.name, kind: p.kind, baseUrl: p.baseUrl, model: p.model, keyRequired: p.keyRequired, ...(p.models ? { models: p.models, modelsUpdatedAt: p.modelsUpdatedAt } : {}) };
    });
    const conversations: Conversation[] = data.conversations.map((c: Conversation) => {
      if (!c || typeof c.id !== 'string' || typeof c.title !== 'string' || !Number.isFinite(c.createdAt) || !Number.isFinite(c.updatedAt) || !Array.isArray(c.messages)) throw new Error();
      const messages: Message[] = c.messages.map((m: Message) => {
        if (!m || typeof m.id !== 'string' || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !MESSAGE_STATUSES.includes(m.status)) throw new Error();
        if (m.fileIds !== undefined && (m.role !== 'user' || !Array.isArray(m.fileIds) || m.fileIds.length > ASSISTANT_LIMITS.messageFiles || new Set(m.fileIds).size !== m.fileIds.length || !m.fileIds.every(identity))) throw new Error();
        if (m.workId !== undefined && !identity(m.workId) || m.memoryIds !== undefined && (!Array.isArray(m.memoryIds) || m.memoryIds.length > ASSISTANT_LIMITS.promptPins + 6 || !m.memoryIds.every(identity))) throw new Error();
        return { id: m.id, role: m.role, content: m.content, status: m.status === 'streaming' ? 'stopped' : m.status, ...(typeof m.error === 'string' ? { error: m.error } : {}), ...(m.tools === undefined ? {} : { tools: restoreToolReceipts(m.tools) }), ...(m.fileIds === undefined ? {} : { fileIds: [...m.fileIds] }), ...(m.workId ? { workId: m.workId } : {}), ...(m.memoryIds ? { memoryIds: [...m.memoryIds] } : {}) };
      });
      return { id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, pinned: Boolean(c.pinned), messages, ...(typeof c.teammateId === 'string' ? { teammateId: c.teammateId } : {}), ...(typeof c.providerId === 'string' ? { providerId: c.providerId } : {}), ...(typeof c.model === 'string' ? { model: c.model } : {}) };
    });
    if (new Set(providers.map(p => p.id)).size !== providers.length || new Set(conversations.map(c => c.id)).size !== conversations.length) throw new Error();
    const teammates: Teammate[] = data.teammates === undefined ? defaults.teammates : data.teammates.map((m: Teammate) => {
      if (!m || ![m.id, m.name, m.description, m.instructions, m.model].every(v => typeof v === 'string') || !(m.providerId === null || typeof m.providerId === 'string')) throw new Error();
      return { id: m.id, name: m.name, description: m.description, instructions: m.instructions, model: m.model, providerId: m.providerId };
    });
    if (!teammates.some(m => m.id === CHIEF_ID) || new Set(teammates.map(m => m.id)).size !== teammates.length) throw new Error();
    const integrations = data.integrations || defaults.integrations;
    if (typeof integrations.enabled !== 'boolean' || typeof integrations.userId !== 'string' || !Array.isArray(integrations.toolkits) || !integrations.toolkits.every((v: unknown) => typeof v === 'string')) throw new Error();
    return { ...defaults, assistant: restoreAssistantState(data.assistant), teammates, activeTeammateId: teammates.some(m => m.id === data.activeTeammateId) ? data.activeTeammateId : CHIEF_ID, integrations: { enabled: integrations.enabled, userId: integrations.userId, toolkits: integrations.toolkits }, onboardingDone: data.onboardingDone, settings: { name: s.name, theme: s.theme, accent: s.accent, textSize: s.textSize, systemPrompt: s.systemPrompt }, providers, conversations, activeProviderId: providers.some(p => p.id === data.activeProviderId) ? data.activeProviderId : null };
  } catch { throw new Error('Your saved data could not be read. It has not been overwritten. Retry or explicitly reset local data.'); }
}
