import config from '../constants/composio.json' with { type: 'json' };
import type { IntegrationConfig } from '../core/state.ts';
import { readJSON } from './readJSON.ts';
export type ToolDefinition = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type Toolkit = { slug: string; name: string; connected: boolean };
export class ComposioSession {
  public id: string;
  private key: string;
  private fetcher: typeof fetch;
  private signal: AbortSignal;
  constructor(id: string, key: string, fetcher: typeof fetch, signal: AbortSignal) {
    this.id = id; this.key = key; this.fetcher = fetcher; this.signal = signal;
  }
  static async create(settings: IntegrationConfig, key: string, fetcher: typeof fetch, signal: AbortSignal) {
    if (!key.trim()) throw new Error('Add your Composio key in Plugins. Browser keys are kept in this browser until you remove them.');
    const data = await this.request(config.sessionPath, key, fetcher, signal, { user_id: settings.userId, toolkits: { enable: settings.toolkits }, premium_usage: false, workbench: { enable: false }, manage_connections: { enable: true, enable_connection_removal: false } });
    if (typeof data.session_id !== 'string') throw new Error('Composio returned an invalid session.');
    return new ComposioSession(data.session_id, key, fetcher, signal);
  }
  private static async request(path: string, key: string, fetcher: typeof fetch, signal: AbortSignal, body?: unknown): Promise<any> {
    signal.throwIfAborted();
    const res = await fetcher(`${config.baseUrl}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal, redirect: 'error' });
    if (!res.ok) throw new Error(`Composio returned HTTP ${res.status}. Check your key, permissions and connection.`);
    return readJSON(res, signal, config.maxResponseBytes, 'Composio');
  }
  private request(operation: string, body?: unknown) { return ComposioSession.request(`${config.sessionPath}/${encodeURIComponent(this.id)}/${operation}`, this.key, this.fetcher, this.signal, body); }
  static async catalog(key: string, fetcher: typeof fetch, signal: AbortSignal, search = '', cursor = '') {
    const query = new URLSearchParams({ search, limit: String(config.pageSize), ...(cursor ? { cursor } : {}) });
    return this.request(`/toolkits?${query}`, key, fetcher, signal);
  }
  private async pages(operation: string, maxItems?: number): Promise<any[]> {
    const items: any[] = [], seen = new Set<string>(); let cursor = '';
    let pages = 0;
    do {
      if (++pages > config.maxPages) throw new Error('Composio returned too many pages. Narrow the enabled apps and retry.');
      const query = new URLSearchParams({ limit: String(config.pageSize), ...(cursor ? { cursor } : {}) });
      const result = await this.request(`${operation}?${query}`);
      if (!Array.isArray(result.items)) throw new Error('Composio returned an invalid tool list.');
      items.push(...result.items);
      cursor = typeof result.next_cursor === 'string' ? result.next_cursor : '';
      if (cursor && seen.has(cursor)) throw new Error('Composio returned a repeated page cursor.');
      seen.add(cursor);
    } while (cursor && (maxItems === undefined || items.length < maxItems));
    return maxItems === undefined ? items : items.slice(0, maxItems);
  }
  async tools(): Promise<ToolDefinition[]> {
    return (await this.pages('tools', config.maxTools)).map((item: any) => {
      if (typeof item.slug !== 'string' || !item.input_parameters || typeof item.input_parameters !== 'object') throw new Error('Composio returned an invalid tool schema.');
      const input = item.input_parameters;
      if (Array.isArray(input) || (input.type !== 'object' && Object.values(input).some(value => !value || typeof value !== 'object' || Array.isArray(value)))) throw new Error('Composio returned an invalid tool schema.');
      const parameters = input.type === 'object' ? input : { type: 'object', properties: Object.fromEntries(Object.entries(input).map(([name, value]) => { const { required, ...schema } = value as Record<string, unknown>; return [name, schema]; })), required: Object.entries(input).filter(([, value]) => (value as Record<string, unknown>).required === true).map(([name]) => name) };
      return { type: 'function', function: { name: item.slug, description: item.description || item.name || item.slug, parameters } };
    });
  }
  async toolkits(): Promise<Toolkit[]> {
    return (await this.pages('toolkits')).map((item: any) => {
      if (typeof item.slug !== 'string') throw new Error('Composio returned an invalid app list.');
      return { slug: item.slug, name: typeof item.name === 'string' ? item.name : item.slug, connected: item.connected_account?.status === 'ACTIVE' };
    });
  }
  async connect(toolkit: string): Promise<string> {
    const result = await this.request('link', { toolkit });
    const link = result.redirect_url || result.link;
    if (typeof link !== 'string' || new URL(link).protocol !== 'https:') throw new Error('Composio returned an invalid connection link.');
    return link;
  }
  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.request(name.startsWith('COMPOSIO_') ? 'execute_meta' : 'execute', { slug: name, arguments: args });
    return JSON.stringify(result).slice(0, config.maxResultChars);
  }
}
