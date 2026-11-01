import type { ToolDefinition } from '../api/composioProtocol.ts';
import { ToolFault } from './schema.ts';

export const OUTPUT_LIMITS = { records: 80, contentChars: 100_000, totalChars: 2_000_000, titleChars: 160, idChars: 160, columns: 30, rows: 500, checklist: 300, events: 100, cellChars: 8_000, jsonDepth: 12, jsonNodes: 6_000 } as const;
export const OUTPUT_KINDS = ['document', 'table', 'checklist', 'calendar', 'json'] as const;
export type OutputKind = typeof OUTPUT_KINDS[number];
export type OutputSource = { conversationId?: string; messageId?: string; workId?: string };
export type OutputInput = { id?: string; title: string; kind: OutputKind; content: string; source?: OutputSource };
export type OutputArtifact = OutputInput & { id: string; createdAt: number; updatedAt: number };
export type OutputTable = { columns: string[]; rows: string[][] };
export type OutputChecklist = { items: { text: string; checked: boolean }[] };
export type OutputCalendar = { events: { title: string; start: string; end?: string; description?: string; location?: string }[] };
type Clock = { id(): string; now(): number };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function fail(message: string): never { throw new ToolFault('invalid_arguments', message); }
function string(value: unknown, max: number, name: string, empty = false): string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0') || (!empty && !value.trim())) fail(`Output ${name} is empty, invalid or exceeds its limit.`);
  return value;
}
function identifier(value: unknown): string { const id = string(value, OUTPUT_LIMITS.idChars, 'ID'); if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) fail('Output ID contains unsupported characters.'); return id; }
function source(value: unknown): OutputSource | undefined {
  if (value === undefined) return undefined;
  if (!object(value)) fail('Output source is invalid.');
  const result: OutputSource = {};
  for (const key of ['conversationId', 'messageId', 'workId'] as const) if (value[key] !== undefined) result[key] = identifier(value[key]);
  return result;
}
function iso(value: unknown): string {
  const text = string(value, 40, 'event date'), match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d{1,3})?)?(?:Z|[+-](\d\d):(\d\d))$/.exec(text);
  if (!match || !Number.isFinite(Date.parse(text))) fail('Output calendar dates need valid ISO times with a timezone.');
  const [, year, month, day, hour, minute, second = '0', offsetHour = '0', offsetMinute = '0'] = match;
  const days = new Date(Date.UTC(Number(year) || 400, Number(month), 0)).getUTCDate();
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || Number(offsetHour) > 23 || Number(offsetMinute) > 59) fail('Output calendar date is invalid.');
  return text;
}
function jsonBounds(value: unknown) {
  let count = 0;
  function walk(item: unknown, depth: number) {
    if (++count > OUTPUT_LIMITS.jsonNodes || depth > OUTPUT_LIMITS.jsonDepth) fail('Output JSON exceeds its structure limit.');
    if (Array.isArray(item)) for (const entry of item) walk(entry, depth + 1);
    else if (object(item)) for (const [key, entry] of Object.entries(item)) { string(key, OUTPUT_LIMITS.cellChars, 'JSON key', true); walk(entry, depth + 1); }
    else if (typeof item === 'string') string(item, OUTPUT_LIMITS.contentChars, 'JSON text', true);
  }
  walk(value, 0);
}
/** Structured output is inert JSON. The UI never renders supplied HTML or a WebView. */
export function outputData(artifact: Pick<OutputArtifact, 'kind' | 'content'>): string | OutputTable | OutputChecklist | OutputCalendar | unknown {
  const content = string(artifact.content, OUTPUT_LIMITS.contentChars, 'content', true);
  if (artifact.kind === 'document') return content;
  let data: unknown; try { data = JSON.parse(content); } catch { return fail('Output content must be valid JSON for this kind.'); }
  jsonBounds(data);
  if (artifact.kind === 'json') return data;
  if (!object(data)) fail('Output structured content must be a JSON object.');
  if (artifact.kind === 'table') {
    if (!Array.isArray(data.columns) || !data.columns.length || data.columns.length > OUTPUT_LIMITS.columns || !Array.isArray(data.rows) || data.rows.length > OUTPUT_LIMITS.rows) fail('Output table exceeds its row or column limit.');
    data.columns.forEach(value => string(value, OUTPUT_LIMITS.cellChars, 'column'));
    for (const row of data.rows) { if (!Array.isArray(row) || row.length !== data.columns.length) fail('Output table rows must match the columns.'); row.forEach(value => string(value, OUTPUT_LIMITS.cellChars, 'cell', true)); }
    return { columns: data.columns, rows: data.rows } as OutputTable;
  }
  if (artifact.kind === 'checklist') {
    if (!Array.isArray(data.items) || !data.items.length || data.items.length > OUTPUT_LIMITS.checklist) fail('Output checklist exceeds its item limit.');
    return { items: data.items.map(item => { if (!object(item) || typeof item.checked !== 'boolean') return fail('Output checklist items need text and a checked boolean.'); return { text: string(item.text, OUTPUT_LIMITS.cellChars, 'checklist item'), checked: item.checked }; }) };
  }
  if (artifact.kind === 'calendar') {
    if (!Array.isArray(data.events) || !data.events.length || data.events.length > OUTPUT_LIMITS.events) fail('Output calendar exceeds its event limit.');
    return { events: data.events.map(item => {
      if (!object(item)) return fail('Output calendar event is invalid.');
      const event: OutputCalendar['events'][number] = { title: string(item.title, OUTPUT_LIMITS.titleChars, 'event title'), start: iso(item.start) };
      if (item.end !== undefined) { event.end = iso(item.end); if (Date.parse(event.end) <= Date.parse(event.start)) fail('Output event end must be after its start.'); }
      for (const key of ['description', 'location'] as const) if (item[key] !== undefined) event[key] = string(item[key], OUTPUT_LIMITS.cellChars, `event ${key}`, true);
      return event;
    }) };
  }
  return fail('Output kind is unsupported.');
}
function clean(input: OutputInput): OutputInput {
  if (!object(input) || !OUTPUT_KINDS.includes(input.kind)) return fail('Output kind is unsupported.');
  const title = string(input.title, OUTPUT_LIMITS.titleChars, 'title').trim();
  if (/[\r\n\u0001-\u001f\u007f]/.test(title)) fail('Output title must be a single line.');
  const result: OutputInput = { title, kind: input.kind, content: string(input.content, OUTPUT_LIMITS.contentChars, 'content', true) };
  if (input.id !== undefined) result.id = identifier(input.id);
  if (input.source !== undefined) result.source = source(input.source);
  const data = outputData(result);
  if (result.kind !== 'document') result.content = JSON.stringify(data);
  return result;
}
function bounds(artifacts: OutputArtifact[]) { if (artifacts.length > OUTPUT_LIMITS.records || artifacts.reduce((n, item) => n + item.content.length, 0) > OUTPUT_LIMITS.totalChars) fail('Output library limit reached. Delete an output to make room.'); }
export function createOutput(artifacts: OutputArtifact[], input: OutputInput, clock: Clock): { artifacts: OutputArtifact[]; record: OutputArtifact } {
  const valid = clean(input), existing = valid.id ? artifacts.find(item => item.id === valid.id) : undefined;
  // An explicit ID is a delivery identity: replay must never overwrite a user's edits.
  if (existing) return { artifacts, record: existing };
  const now = clock.now(); if (!Number.isFinite(now) || now < 0 || !Number.isFinite(new Date(now).getTime())) fail('Output timestamp is invalid.');
  const record: OutputArtifact = { ...valid, id: valid.id || identifier(clock.id()), createdAt: now, updatedAt: now };
  if (artifacts.some(item => item.id === record.id)) fail('Output ID already exists.');
  const next = [record, ...artifacts]; bounds(next); return { artifacts: next, record };
}
export function editOutput(artifacts: OutputArtifact[], id: string, patch: { title?: string; content?: string }, clock: Clock) {
  const existing = artifacts.find(item => item.id === id); if (!existing) throw new ToolFault('not_found', 'Output was not found.');
  const valid = clean({ ...existing, title: patch.title ?? existing.title, content: patch.content ?? existing.content });
  const now = clock.now(); if (!Number.isFinite(now) || now < existing.createdAt || !Number.isFinite(new Date(now).getTime())) fail('Output timestamp is invalid.');
  const record: OutputArtifact = { ...existing, ...valid, id: existing.id, updatedAt: now };
  const next = artifacts.map(item => item.id === id ? record : item); bounds(next); return { artifacts: next, record };
}
export function deleteOutput(artifacts: OutputArtifact[], id: string) { return artifacts.filter(item => item.id !== id); }
export function restoreOutputs(raw: unknown): OutputArtifact[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > OUTPUT_LIMITS.records) return fail('Output library is invalid or exceeds its limit.');
  const seen = new Set<string>();
  const artifacts = raw.map(value => {
    if (!object(value)) return fail('Output record is invalid.');
    const valid = clean(value as OutputInput), id = identifier(value.id);
    if (seen.has(id)) fail('Duplicate output ID in local storage.'); seen.add(id);
    if (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt) || value.createdAt < 0 || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt) || value.updatedAt < value.createdAt || !Number.isFinite(new Date(value.updatedAt).getTime())) fail('Output timestamp is invalid.');
    return { ...valid, id, createdAt: value.createdAt, updatedAt: value.updatedAt };
  });
  bounds(artifacts); return artifacts;
}

export const OUTPUT_TOOL_DEFINITION: ToolDefinition = { type: 'function', function: {
  name: 'output_create',
  description: 'Create a real editable output in Finished outputs. Use document for plain text/Markdown. For table content provide JSON {"columns":["Name"],"rows":[["Value"]]}; checklist {"items":[{"text":"Task","checked":false}]}; calendar {"events":[{"title":"Meet","start":"2026-10-26T09:00:00+05:30","end":"2026-10-26T10:00:00+05:30"}]} with optional description/location; json for bounded JSON data. The user can edit/download/share the real file. PDF is unavailable. Reuse an explicit stable ID to avoid duplicate delivery; existing IDs preserve user edits.',
  parameters: { type: 'object', properties: {
    id: { type: 'string', minLength: 1, maxLength: OUTPUT_LIMITS.idChars, description: 'Optional stable delivery ID: letters, numbers, dot, colon, underscore, dash; first character alphanumeric.' },
    title: { type: 'string', minLength: 1, maxLength: OUTPUT_LIMITS.titleChars },
    kind: { type: 'string', enum: [...OUTPUT_KINDS] },
    content: { type: 'string', maxLength: OUTPUT_LIMITS.contentChars, description: 'Actual output text or JSON structured as described, never just a filename or promise.' },
  }, required: ['title', 'kind', 'content'], additionalProperties: false },
} };
export function createOutputCapability<S extends { artifacts: OutputArtifact[] }>(options: { store: { get(): S; commit(update: (state: S) => S, signal: AbortSignal): Promise<void> }; clock: Clock; signal: AbortSignal; source?: OutputSource }) {
  return { definition: OUTPUT_TOOL_DEFINITION, title: 'Create a finished output', description: OUTPUT_TOOL_DEFINITION.function.description, changesData: true,
    run: async (args: Record<string, unknown>) => {
      options.signal.throwIfAborted(); let record!: OutputArtifact;
      await options.store.commit(state => { options.signal.throwIfAborted(); const result = createOutput(state.artifacts, { id: args.id as string | undefined, title: args.title as string, kind: args.kind as OutputKind, content: args.content as string, source: options.source }, options.clock); record = result.record; return { ...state, artifacts: result.artifacts }; }, options.signal);
      options.signal.throwIfAborted(); return { id: record.id, title: record.title, kind: record.kind, saved: true, location: 'Settings → Finished outputs' };
    },
  };
}
