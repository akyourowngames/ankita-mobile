import type { AssistantState } from './types.ts';
import { redact } from './receipts.ts';
// Stable export format and filename are separate from package/storage identity.
export const ASSISTANT_EXPORT = { format: 'ankita.assistant.records', version: 1, filename: 'ankita-assistant-data.json', mime: 'application/json' } as const;
export function exportAssistantRecords(state: AssistantState, secrets: string[], now: number) {
  return JSON.stringify({ format: ASSISTANT_EXPORT.format, version: ASSISTANT_EXPORT.version, exportedAt: new Date(now).toISOString(), records: redact({ memories: state.memories, tasks: state.tasks, library: state.library, proposals: state.proposals, artifacts: state.artifacts }, secrets) }, null, 2);
}
