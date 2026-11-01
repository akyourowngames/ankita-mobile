import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import config from '../constants/transport.json';
import { abortable } from './abortable';
import publicConfig from '../constants/assistantTransport.json';
import policy from '../assistant/webPolicy.cjs';
import companionConfig from '../constants/companion.json';
import companionPolicy from '../assistant/companionPolicy.cjs';
import workConfig from '../constants/work.json';
import workPolicy from '../work/policy.cjs';
let session: Promise<string | null> | null = null;
export const workerFetch: typeof fetch = async (input, options = {}) => {
  const target = workPolicy.workerTarget(String(input), options.method || 'GET');
  if (Platform.OS !== 'web') return expoFetch(target.href, { ...options, redirect: 'error', credentials: 'omit' }) as unknown as Promise<Response>;
  const token = await abortable(relaySession(), options.signal); options.signal?.throwIfAborted();
  if (!token) throw new Error('Work connection requires the local Ankita app server in this browser.');
  return fetch(workConfig.relayPath, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chief-session': token }, body: JSON.stringify({ url: target.href, method: options.method || 'GET', headers: Object.fromEntries(new Headers(options.headers).entries()), body: options.body }), signal: options.signal });
};
async function relaySession(): Promise<string | null> {
  if (!session) session = fetch(config.sessionPath, { cache: 'no-store', signal: AbortSignal.timeout(config.requestTimeoutMs) }).then(async res => { if (!res.ok) return null; const data = await res.json(); return typeof data.token === 'string' ? data.token : null; }).catch(() => null);
  return session;
}
export const providerFetch: typeof fetch = async (input, options = {}) => {
  if (Platform.OS !== 'web') return expoFetch(input as string, options) as unknown as Promise<Response>;
  const token = await abortable(relaySession(), options.signal); options.signal?.throwIfAborted();
  if (!token) return fetch(input, options);
  const headers = Object.fromEntries(new Headers(options.headers).entries());
  return fetch(config.proxyPath, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chief-session': token }, body: JSON.stringify({ url: String(input), method: options.method || 'GET', headers, body: options.body }), signal: options.signal });
};
// Public research never uses provider credentials, cookies or the provider relay.
// The local browser relay resolves and pins public DNS before connecting.
export const publicFetch: typeof fetch = async (input, options = {}) => {
  const url = policy.publicURL(String(input)).href;
  if (Platform.OS !== 'web') return expoFetch(url, { ...options, credentials: 'omit' }) as unknown as Promise<Response>;
  const token = await abortable(relaySession(), options.signal); options.signal?.throwIfAborted();
  if (!token) return fetch(url, { ...options, credentials: 'omit' });
  return fetch(publicConfig.webProxyPath, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chief-session': token }, body: JSON.stringify({ url, method: 'GET', headers: Object.fromEntries(new Headers(options.headers).entries()) }), signal: options.signal });
};
// A separate route accepts only authenticated versioned companion operations.
export const companionFetch: typeof fetch = async (input, options = {}) => {
  const target = companionPolicy.companionTarget(String(input), options.method || 'GET');
  if (Platform.OS !== 'web') return expoFetch(target.href, { ...options, redirect: 'error', credentials: 'omit' }) as unknown as Promise<Response>;
  const token = await abortable(relaySession(), options.signal); options.signal?.throwIfAborted();
  if (!token) throw new Error('The desktop connection needs the local Ankita web server.');
  return fetch(companionConfig.relayPath, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chief-session': token }, body: JSON.stringify({ url: target.href, method: options.method || 'GET', headers: Object.fromEntries(new Headers(options.headers).entries()), body: options.body }), signal: options.signal });
};
