import { ASSISTANT_LIMITS, MEMORY_CATEGORIES, TOOL_STATUSES } from './config.ts';
import type { MemoryInput, ToolReceipt } from './types.ts';

export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function text(value: unknown, limit: number, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new Error(`${label} is required.`);
  if (value.length > limit) throw new Error(`${label} exceeds the mobile limit.`);
  return value.trim();
}
export function timestamp(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
export function keys(value: Record<string, unknown>, allowed: string[]): boolean { return Object.keys(value).every(key => allowed.includes(key)); }
export function identity(value: unknown): value is string { return typeof value === 'string' && !!value.trim() && value.length <= ASSISTANT_LIMITS.titleChars; }
export function validateMemory(input: MemoryInput) {
  text(input.text, ASSISTANT_LIMITS.memoryChars, 'Memory');
  if (!MEMORY_CATEGORIES.includes(input.category) || typeof input.pinned !== 'boolean') throw new Error('Invalid memory category or pin.');
  const source = input.source;
  if (!object(source) || !keys(source, ['kind', 'conversationId', 'messageId', 'quote']) || !['user', 'manual'].includes(source.kind as string) || typeof source.conversationId !== 'string' || typeof source.messageId !== 'string') throw new Error('Memory needs source evidence.');
  if (source.kind === 'user' && (!source.conversationId || !source.messageId)) throw new Error('Memory needs source evidence.');
  text(source.quote, ASSISTANT_LIMITS.evidenceChars, 'Memory source evidence');
}
export function restoreToolReceipts(value: unknown): ToolReceipt[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > ASSISTANT_LIMITS.toolReceipts) throw new Error('Invalid assistant tool receipts.');
  const seen = new Set();
  return value.map(raw => {
    if (!object(raw) || !identity(raw.id) || seen.has(raw.id) || !identity(raw.name) || !identity(raw.title) || !TOOL_STATUSES.includes(raw.status as ToolReceipt['status']) || !timestamp(raw.startedAt) || (raw.finishedAt !== undefined && !timestamp(raw.finishedAt))) throw new Error('Invalid assistant tool receipts.');
    seen.add(raw.id);
    text(raw.arguments, ASSISTANT_LIMITS.receiptChars, 'Tool arguments', true); text(raw.result, ASSISTANT_LIMITS.receiptChars, 'Tool result', true);
    return { id: raw.id, name: raw.name, title: raw.title, status: ['waiting', 'running'].includes(raw.status as string) ? 'cancelled' : raw.status as ToolReceipt['status'], arguments: raw.arguments as string, result: raw.result as string, startedAt: raw.startedAt, ...(raw.finishedAt === undefined ? {} : { finishedAt: raw.finishedAt as number }) };
  });
}
