import config from '../constants/work.json' with { type: 'json' };
import type { Provider } from '../core/state.ts';
import type { WireMessage } from '../api/protocol.ts';
import type { OutputArtifact } from '../assistant/outputs.ts';
import { restoreOutputs } from '../assistant/outputs.ts';
import { validateAsset } from '../assistant/files.ts';

export type WorkStatus = 'queued' | 'running' | 'interrupted' | 'completed' | 'failed' | 'cancelled';
export type WorkInput = { id: string; deviceId: string; title: string; prompt: string; system: string; messages: WireMessage[]; provider: Provider; search?: { kind: 'brave' | 'searxng'; baseUrl: string } };
export type WorkResult = { id: string; title: string; status: WorkStatus; progress: string; reply: string; error: string; artifacts: OutputArtifact[]; createdAt: number; updatedAt: number; notification?: string; round?: number };
export type LocalWork = WorkResult & { request: WorkInput; conversationId: string; messageId: string; teammateId: string; submitted: boolean; delivered: boolean; lastConnectionError?: string; cancelRequested?: boolean };
export type WorkNotice = { id: string; workId: string; title: string; createdAt: number; read: boolean; delivery: 'pending' | 'sending' | 'unknown' | 'scheduled' | 'push' | 'disabled' | 'failed'; error?: string };
export type WorkState = { deviceId: string; connection: { baseUrl: string; enabled: boolean }; notifications: { enabled: boolean; projectId: string; registered: boolean; revokePending?: boolean }; jobs: LocalWork[]; notices: WorkNotice[] };
const statuses: WorkStatus[] = ['queued', 'running', 'interrupted', 'completed', 'failed', 'cancelled'];
export const isWorkTerminal = (status: WorkStatus) => ['completed', 'failed', 'cancelled'].includes(status);
const id = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,120}$/.test(value);
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const text = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length <= limit;
const only = (value: object, fields: string[]) => Object.keys(value).every(key => fields.includes(key));
export function emptyWorkState(): WorkState { return { deviceId: `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, connection: { baseUrl: '', enabled: false }, notifications: { enabled: false, projectId: '', registered: false }, jobs: [], notices: [] }; }
export function readWorkResult(value: unknown): WorkResult {
  const raw = value as WorkResult;
  if (!raw || !id(raw.id) || !text(raw.title, 160) || !statuses.includes(raw.status) || !text(raw.progress, 500) || !text(raw.reply, config.historyChars) || !text(raw.error, 2000) || !timestamp(raw.createdAt) || !timestamp(raw.updatedAt)) throw new Error('The worker returned an invalid work record.');
  return { id: raw.id, title: raw.title, status: raw.status, progress: raw.progress, reply: raw.reply, error: raw.error, artifacts: restoreOutputs(raw.artifacts), createdAt: raw.createdAt, updatedAt: raw.updatedAt, ...(text(raw.notification, 80) ? { notification: raw.notification } : {}), ...(typeof raw.round === 'number' ? { round: raw.round } : {}) };
}
export function restoreWorkState(value: unknown): WorkState {
  if (value === undefined) return emptyWorkState();
  try {
    const state = value as WorkState;
    if (!state || !id(state.deviceId) || !state.connection || !text(state.connection.baseUrl, 2000) || typeof state.connection.enabled !== 'boolean' || !state.notifications || typeof state.notifications.enabled !== 'boolean' || typeof state.notifications.registered !== 'boolean' || !text(state.notifications.projectId, 120) || !Array.isArray(state.jobs) || state.jobs.length > config.maxJobs || !Array.isArray(state.notices) || state.notices.length > config.maxNotices) throw new Error();
    if (!only(state.connection, ['baseUrl', 'enabled']) || !only(state.notifications, ['enabled', 'registered', 'projectId', 'revokePending']) || state.notifications.revokePending !== undefined && typeof state.notifications.revokePending !== 'boolean') throw new Error();
    if (new Set(state.jobs.map(job => job.id)).size !== state.jobs.length || new Set(state.notices.map(notice => notice.id)).size !== state.notices.length) throw new Error();
    const jobs = state.jobs.map(job => {
      const result = readWorkResult(job), request = job.request;
      if (!request || request.id !== job.id || request.deviceId !== state.deviceId || !text(request.prompt, config.promptChars) || !text(request.system, config.systemChars) || !Array.isArray(request.messages) || !request.provider || !['openai', 'anthropic'].includes(request.provider.kind) || !id(job.conversationId) || !id(job.messageId) || !id(job.teammateId) || typeof job.delivered !== 'boolean' || typeof job.submitted !== 'boolean') throw new Error();
      // Requests store context, never credentials. Unknown private fields in saved
      // metadata indicate corruption rather than an excuse to retain a secret.
      if (Object.keys(request).some(key => !['id', 'deviceId', 'title', 'prompt', 'system', 'messages', 'provider', 'search'].includes(key)) || Object.keys(request.provider).some(key => /key|token|secret|password/i.test(key) && key !== 'keyRequired')) throw new Error();
      if (!text(request.title, 160) || !only(request.provider, ['id', 'name', 'kind', 'baseUrl', 'model', 'keyRequired']) || !text(request.provider.id, 120) || !text(request.provider.name, 120) || !text(request.provider.baseUrl, 2000) || !text(request.provider.model, 240) || typeof request.provider.keyRequired !== 'boolean' || request.messages.length > 100) throw new Error();
      for (const message of request.messages) { if (!message || !only(message, ['role', 'content', 'attachments']) || !['user', 'assistant'].includes(message.role) || !text(message.content, config.historyChars) || message.attachments && (!Array.isArray(message.attachments) || message.attachments.length > 4)) throw new Error(); message.attachments?.forEach(validateAsset); }
      if (request.messages.reduce((size, message) => size + message.content.length, 0) > config.historyChars || request.search && (!only(request.search, ['kind', 'baseUrl']) || !['brave', 'searxng'].includes(request.search.kind) || !text(request.search.baseUrl, 2000))) throw new Error();
      return { ...result, request, conversationId: job.conversationId, messageId: job.messageId, teammateId: job.teammateId, submitted: job.submitted, delivered: job.delivered, ...(text(job.lastConnectionError, 1000) ? { lastConnectionError: job.lastConnectionError } : {}), ...(job.cancelRequested === true ? { cancelRequested: true } : {}) };
    });
    for (const notice of state.notices) if (typeof notice.id !== 'string' || !/^[\w-]{1,160}$/.test(notice.id) || !id(notice.workId) || !text(notice.title, 160) || !timestamp(notice.createdAt) || typeof notice.read !== 'boolean' || !['pending', 'sending', 'unknown', 'scheduled', 'push', 'disabled', 'failed'].includes(notice.delivery) || !only(notice, ['id', 'workId', 'title', 'createdAt', 'read', 'delivery', 'error']) || notice.error !== undefined && !text(notice.error, 1000)) throw new Error();
    return JSON.parse(JSON.stringify({ deviceId: state.deviceId, connection: state.connection, notifications: state.notifications, jobs, notices: state.notices }));
  } catch { throw new Error('Your saved work could not be read. It has not been overwritten.'); }
}
