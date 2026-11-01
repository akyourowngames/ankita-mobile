import config from '../constants/work.json';
import { workerFetch } from '../api/transport';
import { readJSON } from '../api/readJSON';
import policy from './policy.cjs';
import type { WorkInput } from './records';

export class WorkConnectionError extends Error { constructor(public status: number, message: string) { super(message); } }
export function workClient(base: string, key: string, signal: AbortSignal, fetcher: typeof fetch = workerFetch) {
  const root = policy.workerURL(base);
  async function request(path: string, method = 'GET', body?: unknown) {
    if (!key) throw new WorkConnectionError(401, 'Add the worker pairing key in Settings → Work & recovery.');
    const controller = new AbortController(), cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
    const timer = setTimeout(cancel, config.requestMs);
    try {
      const response = await fetcher(`${root}${path}`, { method, signal: controller.signal, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), credentials: 'omit', redirect: 'error' });
      const value = await readJSON(response, controller.signal, config.maxResponseBytes, 'The work service');
      if (!response.ok) throw new WorkConnectionError(response.status, response.status === 401 ? 'Worker pairing expired or is incorrect. Reconnect in Settings.' : response.status === 404 ? 'Work was not found on this worker.' : response.status === 409 ? 'This work identity belongs to a different request. Start a new job.' : 'The worker could not save this operation. Check its storage and connection.');
      return value;
    } catch (error) { if (error instanceof WorkConnectionError) throw error; signal.throwIfAborted(); throw new WorkConnectionError(0, 'Worker is unreachable. Your saved request and completed steps are kept. Reconnect, then refresh.'); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
  }
  return {
    capabilities: () => request('/capabilities'),
    get: (id: string) => request(`/jobs/${id}`),
    submit: (input: WorkInput, providerKey: string, searchKey = '') => request('/jobs', 'POST', { ...input, key: providerKey, ...(input.search ? { search: { ...input.search, key: searchKey } } : {}) }),
    cancel: (id: string) => request(`/jobs/${id}/cancel`, 'POST', {}),
    resume: (id: string) => request(`/jobs/${id}/resume`, 'POST', {}),
    remove: (id: string) => request(`/jobs/${id}`, 'DELETE'),
    register: (id: string, token: string) => request(`/devices/${id}`, 'POST', { token }),
    unregister: (id: string) => request(`/devices/${id}`, 'DELETE'),
  };
}
