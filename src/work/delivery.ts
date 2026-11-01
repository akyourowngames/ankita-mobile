import type { AppState } from '../core/state.ts';
import { createOutput } from '../assistant/outputs.ts';
import { readWorkResult, isWorkTerminal } from './records.ts';
import config from '../constants/work.json' with { type: 'json' };

/** One transaction delivers reply, outputs and notice before acknowledging work. */
export function applyWorkResult(state: AppState, id: string, value: unknown): AppState {
  const saved = state.work.jobs.find(job => job.id === id), result = readWorkResult(value);
  if (!saved || result.id !== id || saved.status === 'cancelled' || saved.status === 'completed' && result.status !== 'completed') return state;
  const complete = result.status === 'completed', attention = result.status === 'failed';
  let artifacts = state.assistant.artifacts;
  if (complete && !saved.delivered) for (const artifact of result.artifacts) artifacts = createOutput(artifacts, { ...artifact, source: { ...artifact.source, workId: id, conversationId: saved.conversationId, messageId: saved.messageId } }, { id: () => artifact.id, now: () => artifact.createdAt }).artifacts;
  const noticeId = `work-${id}-${result.status}`;
  const notices = (complete || attention) && !state.work.notices.some(notice => notice.id === noticeId) ? [{ id: noticeId, workId: id, title: saved.title, createdAt: result.updatedAt, read: false, delivery: 'pending' as const }, ...state.work.notices].slice(0, config.maxNotices) : state.work.notices;
  return { ...state, assistant: { ...state.assistant, artifacts }, work: { ...state.work, jobs: state.work.jobs.map(job => job.id === id ? { ...job, ...result, submitted: true, delivered: complete || job.delivered, cancelRequested: isWorkTerminal(result.status) ? false : job.cancelRequested, lastConnectionError: '' } : job), notices }, conversations: complete && !saved.delivered ? state.conversations.map(chat => chat.id !== saved.conversationId ? chat : { ...chat, updatedAt: result.updatedAt, messages: chat.messages.map(message => message.id !== saved.messageId ? message : { ...message, content: result.reply, status: 'complete' as const }) }) : state.conversations };
}
