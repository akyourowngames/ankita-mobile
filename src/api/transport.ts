import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import config from '../constants/transport.json';
import { createBrowserRelay } from './browserRelay';
import { ConnectionError } from './connectionErrors';
import publicConfig from '../constants/assistantTransport.json';
import policy from '../assistant/webPolicy.cjs';
import companionConfig from '../constants/companion.json';
import companionPolicy from '../assistant/companionPolicy.cjs';
import workConfig from '../constants/work.json';
import workPolicy from '../work/policy.cjs';
const browserRelay = createBrowserRelay((input, options) => fetch(input, options));
export const workerFetch: typeof fetch = async (input, options = {}) => {
  const target = workPolicy.workerTarget(String(input), options.method || 'GET');
  if (Platform.OS !== 'web') return expoFetch(target.href, { ...options, redirect: 'error', credentials: 'omit' }) as unknown as Promise<Response>;
  return browserRelay(workConfig.relayPath, { url: target.href, method: options.method || 'GET', headers: Object.fromEntries(new Headers(options.headers).entries()), body: options.body }, options.signal);
};
export const providerFetch: typeof fetch = async (input, options = {}) => {
  if (Platform.OS !== 'web') {
    try { return await expoFetch(input as string, options) as unknown as Response; }
    catch { options.signal?.throwIfAborted(); throw new ConnectionError('network'); }
  }
  const headers = Object.fromEntries(new Headers(options.headers).entries());
  return browserRelay(config.proxyPath, { url: String(input), method: options.method || 'GET', headers, body: options.body }, options.signal);
};
// Public research never uses provider credentials, cookies or the provider relay.
// The local browser relay resolves and pins public DNS before connecting.
export const publicFetch: typeof fetch = async (input, options = {}) => {
  const url = policy.publicURL(String(input)).href;
  if (Platform.OS !== 'web') return expoFetch(url, { ...options, credentials: 'omit' }) as unknown as Promise<Response>;
  return browserRelay(publicConfig.webProxyPath, { url, method: 'GET', headers: Object.fromEntries(new Headers(options.headers).entries()) }, options.signal);
};
// A separate route accepts only authenticated versioned companion operations.
export const companionFetch: typeof fetch = async (input, options = {}) => {
  const target = companionPolicy.companionTarget(String(input), options.method || 'GET');
  if (Platform.OS !== 'web') return expoFetch(target.href, { ...options, redirect: 'error', credentials: 'omit' }) as unknown as Promise<Response>;
  return browserRelay(companionConfig.relayPath, { url: target.href, method: options.method || 'GET', headers: Object.fromEntries(new Headers(options.headers).entries()), body: options.body }, options.signal);
};
