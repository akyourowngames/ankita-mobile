import { editOutput, outputData, OUTPUT_LIMITS, type OutputArtifact, type OutputTable, type OutputChecklist, type OutputCalendar } from '../assistant/outputs.ts';
import { ToolFault } from '../assistant/schema.ts';

type DraftBase = { original: OutputArtifact; title: string };
export type OutputDraft = DraftBase & (
  { kind: 'document' | 'json'; text: string } |
  { kind: 'table'; data: OutputTable } |
  { kind: 'checklist'; data: OutputChecklist } |
  { kind: 'calendar'; data: OutputCalendar }
);
const fault = (message: string): never => { throw new ToolFault('invalid_arguments', message); };
export function createOutputDraft(artifact: OutputArtifact): OutputDraft {
  const base = { original: { ...artifact, source: artifact.source ? { ...artifact.source } : undefined }, title: artifact.title };
  if (artifact.kind === 'document' || artifact.kind === 'json') return { ...base, kind: artifact.kind, text: artifact.content };
  // A draft owns its nested arrays and fields; Cancel never mutates saved data.
  const data = JSON.parse(JSON.stringify(outputData(artifact)));
  return { ...base, kind: artifact.kind, data } as OutputDraft;
}
export function outputDraftContent(draft: OutputDraft): string { return 'text' in draft ? draft.text : JSON.stringify(draft.data); }
export function outputDraftChanged(draft: OutputDraft): boolean { return draft.title !== draft.original.title || outputDraftContent(draft) !== draft.original.content; }
export function outputSourceChanged(original: OutputArtifact, current: OutputArtifact): boolean {
  return original.id !== current.id || original.kind !== current.kind || original.title !== current.title || original.content !== current.content || original.updatedAt !== current.updatedAt || original.createdAt !== current.createdAt || JSON.stringify(original.source) !== JSON.stringify(current.source);
}
export function saveOutputDraft(artifacts: OutputArtifact[], draft: OutputDraft, clock: { id(): string; now(): number }) {
  const current = artifacts.find(item => item.id === draft.original.id);
  if (!current) throw new ToolFault('not_found', 'This output was deleted. Your draft has not been saved.');
  if (outputSourceChanged(draft.original, current)) throw new ToolFault('invalid_arguments', 'This output changed while you were editing. Cancel to review the latest version. Your draft has not been saved.');
  // Existing record validation remains the final authority, including total library size.
  return editOutput(artifacts, current.id, { title: draft.title, content: outputDraftContent(draft) }, clock);
}
export function resizeOutputTable(table: OutputTable, action: 'add-row' | 'remove-row' | 'add-column' | 'remove-column', index?: number): OutputTable {
  const columns = [...table.columns], rows = table.rows.map(row => [...row]);
  if (action === 'add-column') {
    if (columns.length >= OUTPUT_LIMITS.columns) return fault('The column limit has been reached.');
    columns.push(`Column ${columns.length + 1}`); rows.forEach(row => row.push(''));
  } else if (action === 'add-row') {
    if (rows.length >= OUTPUT_LIMITS.rows) return fault('The row limit has been reached.');
    rows.push(columns.map(() => ''));
  } else {
    const count = action === 'remove-column' ? columns.length : rows.length;
    if (index === undefined || !Number.isInteger(index) || index < 0 || index >= count) return fault('Choose an existing row or column.');
    if (action === 'remove-column') {
      if (columns.length === 1) return fault('Keep at least one column.');
      columns.splice(index, 1); rows.forEach(row => row.splice(index, 1));
    } else rows.splice(index, 1);
  }
  return { columns, rows };
}
export function changeOutputList<T>(items: T[], action: 'add', value: T, limit: number): T[];
export function changeOutputList<T>(items: T[], action: 'remove', value: number, limit: number): T[];
export function changeOutputList<T>(items: T[], action: 'add' | 'remove', value: T | number, limit: number): T[] {
  if (action === 'add') {
    if (items.length >= limit) return fault('The item limit has been reached.');
    return [...items, value as T];
  }
  if (items.length <= 1) return fault('Keep at least one item.');
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= items.length) return fault('Choose an existing item.');
  return items.filter((_item, index) => index !== value);
}
