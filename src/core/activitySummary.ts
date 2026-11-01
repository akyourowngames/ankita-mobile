import type { ToolReceipt } from '../assistant/types';

export const TOOL_STATUS_COPY: Record<ToolReceipt['status'], string> = { waiting: 'Waiting for approval', running: 'In progress', succeeded: 'Completed', failed: 'Could not complete', denied: 'Declined', cancelled: 'Stopped' };

/** Receipts count actions, not sources. Keep unresolved work and earlier failures visible. */
export function summarizeActivity(receipts: readonly ToolReceipt[]) {
  const latest = [...receipts].reverse().find(item => item.status === 'waiting' || item.status === 'running') || receipts.at(-1);
  if (!latest) return null;
  const waiting = receipts.filter(item => item.status === 'waiting').length;
  const failed = receipts.filter(item => item.status === 'failed').length;
  const count = receipts.length;
  let label = receipts.every(item => item.status === 'succeeded')
    ? `${count} ${count === 1 ? 'action' : 'actions'} completed`
    : `${count > 1 ? `${count} actions · ` : ''}${TOOL_STATUS_COPY[latest.status]}: ${latest.title}`;
  if (waiting && latest.status !== 'waiting') label += ` · ${waiting} waiting for approval`;
  if (failed && latest.status !== 'failed') label += ` · ${failed} could not complete`;
  return { latest, count, label, attention: waiting > 0 || failed > 0 };
}
