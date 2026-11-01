import { ASSISTANT_LIMITS as L, MEMORY_PROMPT_HEADER, TASK_STATUSES, LIBRARY_KINDS, TOOL_POLICIES } from './config.ts';
import type { AssistantState, Memory, MemoryInput, Task, TaskInput, LibraryItem, LibraryInput, RecordClock, RecordChange } from './types.ts';
import { object, text, timestamp, keys, identity, validateMemory } from './validation.ts';
import { FINGERPRINT_PATTERN } from './pairingProtocol.ts';
import { validateAsset } from './files.ts';
import { restoreOutputs } from './outputs.ts';
import { retrieveMemories } from './retrieval.ts';
export type { AssistantState, Memory, Task, LibraryItem } from './types.ts';

export function emptyAssistantState(): AssistantState {
  return { memories: [], tasks: [], library: [], proposals: [], artifacts: [], preferences: { toolsEnabled: true, suggestMemories: true }, toolPolicies: {}, webSearch: { kind: 'none', baseUrl: '' }, desktop: { enabled: false, baseUrl: '' } };
}
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
function checkPins(memories: Memory[]) { if (memories.filter(memory => memory.pinned).length > L.promptPins) throw new Error('Memory pin limit reached. Unpin another fact first.'); }
export function rememberMemory(state: AssistantState, input: MemoryInput, clock: RecordClock): RecordChange<Memory> {
  validateMemory(input);
  const existing = state.memories.find(memory => normalize(memory.text) === normalize(input.text));
  if (!existing && state.memories.length >= L.memories) throw new Error('Memory record limit reached. Forget an old fact first.');
  const record: Memory = { ...input, text: input.text.trim().replace(/\s+/g, ' '), source: { ...input.source }, pinned: existing?.pinned || input.pinned, id: existing?.id || clock.id(), createdAt: existing?.createdAt ?? clock.now(), updatedAt: clock.now() };
  const memories = existing ? state.memories.map(memory => memory.id === existing.id ? record : memory) : [...state.memories, record];
  checkPins(memories); return { state: { ...state, memories }, record };
}
export function updateMemory(state: AssistantState, id: string, patch: Partial<Pick<MemoryInput, 'text' | 'category' | 'pinned' | 'source'>>, clock: RecordClock): RecordChange<Memory> {
  const existing = state.memories.find(memory => memory.id === id);
  if (!existing) throw new Error('Memory was not found.');
  const record = { ...existing, ...patch, updatedAt: clock.now() }; validateMemory(record);
  if (state.memories.some(memory => memory.id !== id && normalize(memory.text) === normalize(record.text))) throw new Error('That memory already exists.');
  const memories = state.memories.map(memory => memory.id === id ? record : memory); checkPins(memories);
  return { state: { ...state, memories }, record };
}
export function forgetMemory(state: AssistantState, id: string): AssistantState {
  if (!state.memories.some(memory => memory.id === id)) throw new Error('Memory was not found.');
  return { ...state, memories: state.memories.filter(memory => memory.id !== id) };
}
export function searchMemory(state: AssistantState, query: string): Memory[] {
  return retrieveMemories(state.memories, text(query, L.queryChars, 'Search query', true)).map(hit => hit.memory);
}
export function memoryPrompt(state: AssistantState): string {
  const pins = state.memories.filter(memory => memory.pinned).slice(0, L.promptPins);
  return pins.length ? [MEMORY_PROMPT_HEADER, ...pins.map(memory => `- ${memory.text.replace(/\s+/g, ' ').slice(0, L.pinChars)}`)].join('\n').slice(0, L.promptChars) : '';
}
export function saveTask(state: AssistantState, input: TaskInput, clock: RecordClock): RecordChange<Task> {
  const title = text(input.title, L.titleChars, 'Task title'), notes = text(input.notes, L.taskNotesChars, 'Task notes', true);
  if (!TASK_STATUSES.includes(input.status) || (input.dueAt !== null && !timestamp(input.dueAt))) throw new Error('Invalid task status or date.');
  const existing = input.id ? state.tasks.find(task => task.id === input.id) : undefined;
  if (input.id && !existing) throw new Error('Task was not found.');
  if (!existing && state.tasks.length >= L.tasks) throw new Error('Task record limit reached. Remove a completed task first.');
  const notificationId = input.notificationId === undefined ? existing?.notificationId || null : input.notificationId;
  if (notificationId !== null && !identity(notificationId)) throw new Error('Invalid task reminder identity.');
  const record: Task = { id: existing?.id || clock.id(), title, notes, status: input.status, dueAt: input.dueAt, notificationId, createdAt: existing?.createdAt ?? clock.now(), updatedAt: clock.now() };
  return { state: { ...state, tasks: existing ? state.tasks.map(task => task.id === record.id ? record : task) : [...state.tasks, record] }, record };
}
export function deleteTask(state: AssistantState, id: string): AssistantState {
  if (!state.tasks.some(task => task.id === id)) throw new Error('Task was not found.');
  return { ...state, tasks: state.tasks.filter(task => task.id !== id) };
}
export function saveLibraryItem(state: AssistantState, input: LibraryInput, clock: RecordClock): RecordChange<LibraryItem> {
  const title = text(input.title, L.titleChars, 'Note title'), content = text(input.content, L.documentChars, 'Document content', true);
  if (!LIBRARY_KINDS.includes(input.kind) || (input.sourceUrl !== undefined && typeof input.sourceUrl !== 'string') || (input.mimeType !== undefined && typeof input.mimeType !== 'string')) throw new Error('Invalid document metadata.');
  const existing = input.id ? state.library.find(item => item.id === input.id) : undefined;
  if (input.id && !existing) throw new Error('Document was not found.');
  if (!existing && state.library.length >= L.library) throw new Error('Document record limit reached. Remove an old document first.');
  if (state.library.filter(item => item.id !== existing?.id).reduce((sum, item) => sum + item.content.length, content.length) > L.libraryChars) throw new Error('Document storage limit reached. Remove an old document first.');
  if (input.asset) validateAsset(input.asset);
  if (state.library.filter(item => item.id !== existing?.id).reduce((sum, item) => sum + (item.asset?.bytes || 0), input.asset?.bytes || 0) > L.libraryBinaryBytes) throw new Error('Document asset storage limit reached. Remove an old file first.');
  const record: LibraryItem = { id: existing?.id || clock.id(), title, content, kind: input.kind, ...(input.sourceUrl === undefined ? {} : { sourceUrl: input.sourceUrl }), ...(input.mimeType === undefined ? {} : { mimeType: input.mimeType }), ...(input.asset ? { asset: { ...input.asset } } : {}), createdAt: existing?.createdAt ?? clock.now(), updatedAt: clock.now() };
  return { state: { ...state, library: existing ? state.library.map(item => item.id === record.id ? record : item) : [...state.library, record] }, record };
}
export function deleteLibraryItem(state: AssistantState, id: string): AssistantState {
  if (!state.library.some(item => item.id === id)) throw new Error('Document was not found.');
  return { ...state, library: state.library.filter(item => item.id !== id) };
}
export function restoreAssistantState(value: unknown): AssistantState {
  if (value === undefined) return emptyAssistantState();
  try {
    if (!object(value) || !keys(value, Object.keys(emptyAssistantState()))) throw new Error();
    for (const [key, limit] of [['memories', L.memories], ['tasks', L.tasks], ['library', L.library], ['proposals', L.proposals]] as const) {
      const items = value[key]; if (!Array.isArray(items) || items.length > limit || new Set(items.map(item => object(item) ? item.id : undefined)).size !== items.length) throw new Error();
      for (const item of items) if (!object(item) || !identity(item.id) || !timestamp(item.createdAt) || (key !== 'proposals' && !timestamp(item.updatedAt))) throw new Error();
    }
    const state = { ...value, artifacts: restoreOutputs(value.artifacts) } as unknown as AssistantState;
    for (const memory of state.memories) { if (!keys(memory, ['id', 'text', 'category', 'source', 'pinned', 'createdAt', 'updatedAt'])) throw new Error(); validateMemory(memory); }
    checkPins(state.memories);
    for (const proposal of state.proposals) { if (!keys(proposal, ['id', 'text', 'category', 'source', 'createdAt'])) throw new Error(); validateMemory({ ...proposal, pinned: false }); }
    for (const task of state.tasks) {
      if (!keys(task, ['id', 'title', 'notes', 'status', 'dueAt', 'notificationId', 'createdAt', 'updatedAt']) || !TASK_STATUSES.includes(task.status) || (task.dueAt !== null && !timestamp(task.dueAt)) || (task.notificationId !== null && !identity(task.notificationId))) throw new Error();
      text(task.title, L.titleChars, 'Task title'); text(task.notes, L.taskNotesChars, 'Task notes', true);
    }
    for (const item of state.library) {
      if (!keys(item, ['id', 'title', 'content', 'kind', 'sourceUrl', 'mimeType', 'asset', 'createdAt', 'updatedAt']) || !LIBRARY_KINDS.includes(item.kind) || (item.sourceUrl !== undefined && typeof item.sourceUrl !== 'string') || (item.mimeType !== undefined && typeof item.mimeType !== 'string')) throw new Error();
      if (item.asset !== undefined) validateAsset(item.asset);
      text(item.title, L.titleChars, 'Document title'); text(item.content, L.documentChars, 'Document content', true);
    }
    if (state.library.reduce((sum, item) => sum + item.content.length, 0) > L.libraryChars) throw new Error();
    if (state.library.reduce((sum, item) => sum + (item.asset?.bytes || 0), 0) > L.libraryBinaryBytes) throw new Error();
    if (!object(state.preferences) || !keys(state.preferences, ['toolsEnabled', 'suggestMemories']) || typeof state.preferences.toolsEnabled !== 'boolean' || typeof state.preferences.suggestMemories !== 'boolean' || !object(state.toolPolicies) || Object.entries(state.toolPolicies).some(([name, policy]) => !identity(name) || !TOOL_POLICIES.includes(policy))) throw new Error();
    if (!object(state.webSearch) || !keys(state.webSearch, ['kind', 'baseUrl']) || !['none', 'brave', 'searxng'].includes(state.webSearch.kind) || typeof state.webSearch.baseUrl !== 'string') throw new Error();
    if (!object(state.desktop) || !keys(state.desktop, ['enabled', 'baseUrl', 'name', 'deviceId', 'deviceName', 'teammateName', 'fingerprint', 'pairedAt']) || typeof state.desktop.enabled !== 'boolean' || typeof state.desktop.baseUrl !== 'string') throw new Error();
    for (const field of ['name', 'deviceName', 'teammateName'] as const) {
      const label = state.desktop[field];
      if (label !== undefined && (typeof label !== 'string' || label.length > L.desktopLabelChars)) throw new Error();
    }
    if (state.desktop.deviceId !== undefined && !identity(state.desktop.deviceId)) throw new Error();
    if (state.desktop.fingerprint !== undefined && !FINGERPRINT_PATTERN.test(state.desktop.fingerprint)) throw new Error();
    if (state.desktop.pairedAt !== undefined && !timestamp(state.desktop.pairedAt)) throw new Error();
    // The validated store contains only JSON data; do not assume structuredClone
    // exists in every native JS engine supported by the phone bundle.
    return JSON.parse(JSON.stringify(state)) as AssistantState;
  } catch { throw new Error('Your assistant data could not be read. It has not been overwritten.'); }
}
