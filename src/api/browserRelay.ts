import config from '../constants/transport.json' with { type: 'json' };
import { abortable } from './abortable.ts';
import { readJSON } from './readJSON.ts';
import { ConnectionError } from './connectionErrors.ts';

type RelayRequest = { url: string; method: string; headers?: Record<string, string>; body?: BodyInit | null };

/** Browser credentials travel only through the app's same-origin relay. */
export function createBrowserRelay(fetcher: typeof fetch) {
  let session: Promise<string> | null = null;

  async function loadSession(): Promise<string> {
    const controller = new AbortController();
    // Milliseconds for a local handshake, separate from the longer provider generation deadline.
    const timer = setTimeout(() => controller.abort(), config.handshakeTimeoutMs);
    try {
      const response = await fetcher(config.sessionPath, { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new ConnectionError('relay_unavailable');
      const data = await readJSON(response, controller.signal, config.maxSessionBytes, 'The app connection');
      if (typeof data.token !== 'string' || !data.token.trim()) throw new ConnectionError('relay_unavailable');
      return data.token;
    } catch {
      throw new ConnectionError(controller.signal.aborted ? 'relay_timeout' : 'relay_unavailable');
    } finally { clearTimeout(timer); }
  }

  function currentSession() {
    if (!session) {
      const pending = loadSession();
      session = pending;
      void pending.catch(() => { if (session === pending) session = null; });
    }
    return session;
  }

  async function send(route: string, request: RelayRequest, token: string, signal?: AbortSignal | null) {
    signal?.throwIfAborted();
    try {
      return await fetcher(route, { method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'content-type': 'application/json', 'x-chief-session': token },
        body: JSON.stringify(request), signal });
    } catch {
      signal?.throwIfAborted();
      throw new ConnectionError('relay_unavailable');
    }
  }

  return async (route: string, request: RelayRequest, signal?: AbortSignal | null): Promise<Response> => {
    signal?.throwIfAborted();
    const pending = currentSession();
    let response = await send(route, request, await abortable(pending, signal), signal);
    if (response.status !== 403 || response.headers.get(config.relayErrorHeader) !== config.sessionInvalidCode) return response;
    // This relay rejection happens before forwarding. Provider responses and
    // uncertain network failures never replay a potentially completed action.
    await response.body?.cancel();
    if (session === pending) session = null;
    const refreshed = currentSession();
    response = await send(route, request, await abortable(refreshed, signal), signal);
    if (response.status === 403 && response.headers.get(config.relayErrorHeader) === config.sessionInvalidCode) {
      await response.body?.cancel();
      if (session === refreshed) session = null;
      throw new ConnectionError('relay_session');
    }
    return response;
  };
}
