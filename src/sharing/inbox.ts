import { ASSISTANT_LIMITS as L } from '../assistant/config.ts';
import { importDocument, validateAsset } from '../assistant/files.ts';
import type { AssistantState, LibraryInput, RecordClock } from '../assistant/types.ts';
import { saveLibraryItem } from '../assistant/records.ts';

// Counts/bytes: keep transient OS shares bounded independently of the approved library.
export const INBOX_LIMITS = { entries: 20, seen: 256, binaryBytes: L.libraryBinaryBytes, textChars: 200_000, uriChars: 8192 } as const;
export type IncomingPayload = { value: string; shareType: 'text' | 'url' | 'image' | 'file' | 'audio' | 'video'; mimeType?: string };
export type IncomingEntry = { id: string; payload: IncomingPayload; receivedAt: number; input?: LibraryInput; error?: string };
export type IncomingInbox = { version: 1; entries: IncomingEntry[]; seen: string[] };
export type ShareReader = (payload: IncomingPayload) => Promise<{ name: string; mimeType?: string; bytes: Uint8Array }>;
const empty = (): IncomingInbox => ({ version: 1, entries: [], seen: [] });
const TYPES = ['text', 'url', 'image', 'file', 'audio', 'video'];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function validatePayload(value: unknown): asserts value is IncomingPayload {
  if (!object(value) || typeof value.value !== 'string' || !value.value.trim() || !TYPES.includes(value.shareType as string) || (value.mimeType !== undefined && (typeof value.mimeType !== 'string' || value.mimeType.length > 128))) throw new Error('The shared item has invalid metadata. Share it again from the original app.');
  const limit = value.shareType === 'text' ? L.documentChars : INBOX_LIMITS.uriChars;
  if (value.value.length > limit) throw new Error('The shared item exceeds the phone import limit. Share a smaller selection.');
}
function identity(payload: IncomingPayload) {
  const source = JSON.stringify([payload.shareType, payload.mimeType || '', payload.value]);
  // Two independent 32-bit hashes keep a stable, compact local replay identity.
  let first = 2166136261, second = 5381;
  for (let i = 0; i < source.length; i++) { first = Math.imul(first ^ source.charCodeAt(i), 16777619); second = Math.imul(second, 33) ^ source.charCodeAt(i); }
  return `share-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}
function bounded(state: IncomingInbox) {
  if (state.entries.length > INBOX_LIMITS.entries) throw new Error('The share inbox is full. Review or dismiss an item, then retry.');
  if (state.entries.reduce((sum, entry) => sum + (entry.input?.asset?.bytes || 0), 0) > INBOX_LIMITS.binaryBytes || state.entries.reduce((sum, entry) => sum + (entry.input?.content.length || 0) + entry.payload.value.length, 0) > INBOX_LIMITS.textChars) throw new Error('The share inbox storage limit is reached. Review or dismiss an item, then retry.');
}
export function sharedTextInput(payload: IncomingPayload): LibraryInput {
  validatePayload(payload);
  const content = payload.value.trim();
  if (payload.shareType === 'url') {
    let url: URL; try { url = new URL(content); } catch { throw new Error('Share a complete HTTP or HTTPS URL.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Share an HTTP or HTTPS URL without credentials.');
    return { title: url.hostname.slice(0, L.titleChars), content, kind: 'web', sourceUrl: content, mimeType: 'text/plain' };
  }
  if (payload.shareType !== 'text') throw new Error('This shared item needs a supported document import.');
  if (content.includes('\0')) throw new Error('The shared text is not supported. Share a UTF-8 text file instead.');
  return { title: content.split(/\r?\n/, 1)[0].slice(0, L.titleChars), content, kind: 'note', mimeType: 'text/plain' };
}
export function restoreIncomingInbox(raw: string | null): IncomingInbox {
  if (raw === null) return empty();
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value) || value.version !== 1 || !Array.isArray(value.entries) || !Array.isArray(value.seen) || value.seen.length > INBOX_LIMITS.seen || value.seen.some(id => typeof id !== 'string' || !/^share-[a-z0-9]+-[a-z0-9]+$/.test(id))) throw new Error();
    for (const entry of value.entries) {
      if (!object(entry) || typeof entry.id !== 'string' || !/^share-[a-z0-9]+-[a-z0-9]+$/.test(entry.id) || !Number.isSafeInteger(entry.receivedAt) || (entry.receivedAt as number) < 0 || (entry.error !== undefined && (typeof entry.error !== 'string' || entry.error.length > 500))) throw new Error();
      validatePayload(entry.payload);
      if (entry.input !== undefined) {
        const input = entry.input;
        if (!object(input) || typeof input.title !== 'string' || !input.title.trim() || input.title.length > L.titleChars || typeof input.content !== 'string' || input.content.length > L.documentChars || !['note', 'web', 'file'].includes(input.kind as string) || (input.mimeType !== undefined && typeof input.mimeType !== 'string') || (input.sourceUrl !== undefined && typeof input.sourceUrl !== 'string')) throw new Error();
        if (input.asset !== undefined) validateAsset(input.asset);
        if (input.kind === 'web') sharedTextInput(entry.payload);
      }
    }
    if (new Set(value.entries.map(entry => entry.id)).size !== value.entries.length) throw new Error();
    bounded(value as unknown as IncomingInbox);
    return value as unknown as IncomingInbox;
  } catch { throw new Error('Your share inbox could not be read. It has not been overwritten.'); }
}
function importError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /^(The selected|The file bytes|The document|Document|Choose a supported|Share a|This shared|The shared)/.test(message) ? message.slice(0, 350) : 'Could not read this shared file. Retry, or share it again from the original app and check available storage.';
}
export function createIncomingInbox(options: { storage: { get: () => Promise<string | null>; set: (value: string) => Promise<void> }; readFile: ShareReader; now?: () => number }) {
  let current = empty(), loaded = false, tail: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = () => { for (const listener of listeners) listener(); };
  const serial = <T,>(work: () => Promise<T>): Promise<T> => { const next = tail.catch(() => {}).then(work); tail = next; return next; };
  const load = async () => { if (!loaded) { current = restoreIncomingInbox(await options.storage.get()); loaded = true; publish(); } };
  const persist = async (next: IncomingInbox) => { bounded(next); await options.storage.set(JSON.stringify(next)); current = next; publish(); };
  const prepare = async (entry: IncomingEntry): Promise<IncomingEntry> => {
    try {
      if (['audio', 'video'].includes(entry.payload.shareType)) throw new Error('Choose a supported text, Markdown, JSON, CSV, image or PDF file.');
      // SDK57's Android parser labels text/* streams as "text", but leaves their content:// URI as value.
      const filePayload = !['text', 'url'].includes(entry.payload.shareType) || (entry.payload.shareType === 'text' && /^content:\/\//i.test(entry.payload.value));
      const input = filePayload ? importDocument(await options.readFile(entry.payload)) : sharedTextInput(entry.payload);
      return { id: entry.id, payload: entry.payload, receivedAt: entry.receivedAt, input };
    } catch (error) { return { id: entry.id, payload: entry.payload, receivedAt: entry.receivedAt, error: importError(error) }; }
  };
  return {
    snapshot: () => current,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load: () => serial(load),
    capture: (payloads: IncomingPayload[]) => serial(async () => {
      await load();
      if (!Array.isArray(payloads) || payloads.length > INBOX_LIMITS.entries) throw new Error('The share inbox is full. Share at most 20 items at once.');
      payloads.forEach(validatePayload);
      const next: IncomingInbox = { ...current, entries: [...current.entries] };
      for (const payload of payloads) {
        const id = identity(payload);
        if (next.entries.some(entry => entry.id === id) || next.seen.includes(id)) continue;
        if (next.entries.length >= INBOX_LIMITS.entries) throw new Error('The share inbox is full. Review or dismiss an item, then retry.');
        next.entries.push(await prepare({ id, payload: { ...payload }, receivedAt: (options.now || Date.now)() }));
        bounded(next);
      }
      await persist(next);
      // A failed file read retains its OS permission/payload until an explicit retry/dismiss.
      return payloads.every(payload => next.seen.includes(identity(payload)) || !!next.entries.find(entry => entry.id === identity(payload))?.input);
    }),
    retry: (id: string) => serial(async () => { await load(); const entry = current.entries.find(entry => entry.id === id); if (!entry) return; const replacement = await prepare(entry); await persist({ ...current, entries: current.entries.map(entry => entry.id === id ? replacement : entry) }); }),
    dismiss: (id: string) => serial(async () => { await load(); if (!current.entries.some(entry => entry.id === id)) return; await persist({ ...current, entries: current.entries.filter(entry => entry.id !== id), seen: [...current.seen.filter(value => value !== id), id].slice(-INBOX_LIMITS.seen) }); }),
    clear: () => serial(async () => { await options.storage.set(JSON.stringify(empty())); current = empty(); loaded = true; publish(); }),
  };
}
export function webSharePayloads(location: string): IncomingPayload[] {
  const params = new URL(location).searchParams, payloads: IncomingPayload[] = [];
  const text = params.get('share_text'), title = params.get('share_title'), url = params.get('share_url');
  if (text || title) payloads.push({ shareType: 'text', value: [title, text].filter(Boolean).join('\n\n'), mimeType: 'text/plain' });
  if (url) payloads.push({ shareType: 'url', value: url, mimeType: 'text/uri-list' });
  return payloads;
}
export function mergeDraftAttachment(current: string[], id: string) {
  const merged = [...new Set([...current, id])];
  if (merged.length > L.messageFiles) throw new Error('Remove a composer attachment before adding this share. Your draft is unchanged.');
  return merged;
}
export function saveIncomingEntry(state: AssistantState, entry: IncomingEntry, clock: RecordClock) {
  if (!entry.input) throw new Error('Retry this import before saving or attaching it.');
  const id = `incoming-${entry.id}`, existing = state.library.find(item => item.id === id);
  if (existing) return { state, record: existing };
  return saveLibraryItem(state, { ...entry.input, id: undefined }, { id: () => id, now: clock.now });
}
export async function receiveNativeShares(port: { get: () => IncomingPayload[]; clear: () => void }, inbox: Pick<ReturnType<typeof createIncomingInbox>, 'capture'>) {
  const payloads = port.get();
  if (!payloads.length) return true;
  if (!await inbox.capture(payloads)) return false;
  // Another share can arrive while reading bytes or committing storage. Only acknowledge our snapshot.
  const key = (items: IncomingPayload[]) => items.map(identity).sort().join('|');
  if (key(port.get()) !== key(payloads)) return false;
  port.clear();
  return true;
}
export function readBoundedShareBytes(handle: { readBytes: (length: number) => Uint8Array; close: () => void }, limit = L.fileBytes): Uint8Array {
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (total <= limit) {
      const chunk = handle.readBytes(Math.min(65_536, limit + 1 - total));
      if (!chunk.length) break;
      total += chunk.length;
      if (total > limit) throw new Error('The selected file exceeds the phone import limit. Share a file up to 1 MiB.');
      chunks.push(chunk);
    }
    const result = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  } finally { handle.close(); }
}
