import config from '../constants/companion.json' with { type: 'json' };
import policy from './companionPolicy.cjs';
import { readJSON } from '../api/readJSON.ts';
import { abortable } from '../api/abortable.ts';
import type { AssistantState } from './types.ts';
import type { ApprovalRequest } from './approvals.ts';
import { ToolFault } from './schema.ts';
export const companionURL = policy.companionURL;
export type DesktopEvent = { sequence: number; type: string; name?: string; detail: string; failed?: boolean };
export type DesktopCapabilities = {
  version: number; tools: string[]; approvals: boolean;
  device?: { id: string; name: string }; teammate?: { id: string; name: string } | null;
  app?: { name: string }; computer?: string; fingerprint?: string;
};
type Run = { id: string; status: string; reply: string; pending?: { id: string; name: string; detail: string }; events: DesktopEvent[] };
async function request(base: string, key: string, transport: typeof fetch, path: string, method: string, signal: AbortSignal, body?: unknown) {
  if (!key) throw new ToolFault('desktop_pairing', 'Add the desktop pairing key in Assistant settings.');
  const controller = new AbortController(), cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
  const timer = setTimeout(cancel, config.requestMs);
  try {
    const res = await transport(`${companionURL(base)}${path}`, { method, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal, redirect: 'error', credentials: 'omit' });
    if (!res.ok) throw new ToolFault('desktop_unavailable', `Desktop returned HTTP ${res.status}. Check pairing, connection and whether it is busy.`);
    return await readJSON(res, controller.signal, config.responseBytes, 'The desktop companion');
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
export async function discoverDesktop(connection: AssistantState['desktop'], key: string, transport: typeof fetch, signal: AbortSignal): Promise<DesktopCapabilities> {
  const data = await request(connection.baseUrl, key, transport, '/capabilities', 'GET', signal);
  if (data.version !== config.version || !Array.isArray(data.tools) || data.tools.some((name: unknown) => typeof name !== 'string') || data.approvals !== true) throw new ToolFault('desktop_version', 'The desktop companion version is incompatible. Update the companion.');
  const named = (value: unknown): value is { id: string; name: string } => Boolean(value) && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string' && typeof (value as { name?: unknown }).name === 'string';
  return {
    version: data.version, tools: data.tools, approvals: data.approvals,
    ...(named(data.device) ? { device: { id: data.device.id, name: data.device.name } } : {}),
    ...(named(data.teammate) ? { teammate: { id: data.teammate.id, name: data.teammate.name } } : {}),
    ...(typeof data.app?.name === 'string' ? { app: { name: data.app.name } } : {}),
    ...(typeof data.computer === 'string' ? { computer: data.computer } : {}),
    ...(typeof data.fingerprint === 'string' ? { fingerprint: data.fingerprint } : {}),
  };
}
export async function desktopRun(prompt: string, connection: AssistantState['desktop'], key: string, transport: typeof fetch, signal: AbortSignal, approve: (request: ApprovalRequest, signal: AbortSignal) => Promise<boolean>, event?: (event: DesktopEvent) => void): Promise<{ id: string; reply: string }> {
  if (!connection.enabled) throw new ToolFault('desktop_disabled', 'The optional desktop connection is switched off.');
  await discoverDesktop(connection, key, transport, signal); signal.throwIfAborted();
  const started = await request(connection.baseUrl, key, transport, '/runs', 'POST', signal, { version: config.version, prompt });
  if (typeof started.id !== 'string' || !/^[a-f\d-]+$/.test(started.id)) throw new ToolFault('desktop_response', 'The desktop returned an invalid run identifier.');
  const path = `/runs/${started.id}`; let cursor = 0, finished = false;
  try {
    while (true) {
      signal.throwIfAborted();
      const run = await request(connection.baseUrl, key, transport, `${path}?after=${cursor}`, 'GET', signal) as Run;
      if (run.id !== started.id || !Array.isArray(run.events) || typeof run.reply !== 'string') throw new ToolFault('desktop_response', 'The desktop returned an invalid run result.');
      for (const item of run.events) { if (!Number.isSafeInteger(item.sequence) || item.sequence <= cursor) continue; cursor = item.sequence; event?.(item); }
      if (run.status === 'completed') { finished = true; return { id: started.id, reply: run.reply }; }
      if (['failed', 'cancelled'].includes(run.status)) { finished = true; throw new ToolFault('desktop_failed', run.status === 'cancelled' ? 'The desktop request was cancelled or timed out.' : 'The desktop runtime failed. Check the companion on your computer.'); }
      if (run.pending) {
        const pending = run.pending;
        const allowed = await abortable(approve({ id: pending.id, name: pending.name, title: `Desktop · ${pending.name}`, description: 'This action runs on your computer. Review the actual desktop preview.', arguments: pending.detail, scope: 'action' }, signal), signal);
        signal.throwIfAborted();
        await request(connection.baseUrl, key, transport, `${path}/approvals/${pending.id}`, 'POST', signal, { allow: allowed });
      } else {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { await abortable(new Promise<void>(resolve => { timer = setTimeout(resolve, config.pollMs); }), signal); } finally { clearTimeout(timer); }
      }
    }
  } finally {
    if (!finished) await request(connection.baseUrl, key, transport, path, 'DELETE', new AbortController().signal).catch(() => {});
  }
}
