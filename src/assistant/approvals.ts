import { ASSISTANT_TIMING } from './config.ts';

// `tool` requests name a phone capability that can be allowed for the future;
// desktop requests are single-action reviews and never persist a policy.
export type ApprovalRequest = { id: string; name: string; title: string; description: string; arguments: string; scope?: 'tool' | 'action' };
type Pending = { request: ApprovalRequest; finish: (approved: boolean, cancelled?: boolean) => void };
export class ApprovalQueue {
  private requests = new Map<string, Pending>();
  private listeners = new Set<(requests: ApprovalRequest[]) => void>();
  pending() { return [...this.requests.values()].map(item => ({ ...item.request })); }
  subscribe(listener: (requests: ApprovalRequest[]) => void) { this.listeners.add(listener); listener(this.pending()); return () => { this.listeners.delete(listener); }; }
  private publish() { for (const listener of this.listeners) listener(this.pending()); }
  request(request: ApprovalRequest, signal: AbortSignal): Promise<boolean> {
    signal.throwIfAborted(); if (this.requests.has(request.id)) throw new Error('An approval with this identity is already pending.');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(false), ASSISTANT_TIMING.approvalMs);
      const abort = () => finish(false, true);
      const finish = (approved: boolean, cancelled = false) => {
        clearTimeout(timer); signal.removeEventListener('abort', abort); this.requests.delete(request.id); this.publish();
        if (cancelled) reject(signal.reason || Object.assign(new Error('Cancelled'), { name: 'AbortError' })); else resolve(approved);
      };
      this.requests.set(request.id, { request: { ...request }, finish }); signal.addEventListener('abort', abort, { once: true }); this.publish();
    });
  }
  resolve(id: string, approved: boolean) { const pending = this.requests.get(id); if (!pending) return false; pending.finish(approved); return true; }
  cancelAll() { for (const pending of [...this.requests.values()]) pending.finish(false, true); }
}
