import type { AppState } from '../core/state.ts';
import type { IncomingInbox } from '../sharing/inbox.ts';
import type { LibraryAsset } from '../assistant/types.ts';
import { ASSET_REF_PATTERN } from '../assistant/config.ts';

// Large document/PDF/image bytes are kept out of the app-state JSON so a big
// library cannot overflow the metadata store. In memory an asset carries base64
// `data`; on disk it carries only a content-addressed `ref`.
export type AssetPort = { read(ref: string): Promise<string | null>; write(ref: string, data: string): Promise<void>; remove(refs: string[]): Promise<void>; list(): Promise<string[]> };

export function assetDigest(data: string): string {
  // Length plus two independent 32-bit hashes give a stable, compact content identity.
  let first = 2166136261, second = 5381;
  for (let index = 0; index < data.length; index++) { const code = data.charCodeAt(index); first = Math.imul(first ^ code, 16777619); second = Math.imul(second, 33) ^ code; }
  return `a${data.length.toString(36)}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}
function decodedBytes(data: string): number {
  if (!data || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return -1;
  return data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
}
export function collectAssetRefs(state: AppState | null, inbox?: IncomingInbox | null): string[] {
  const refs = new Set<string>();
  const add = (asset: LibraryAsset | undefined) => { if (asset?.ref && ASSET_REF_PATTERN.test(asset.ref)) refs.add(asset.ref); };
  (state?.assistant?.library || []).forEach(item => add(item.asset));
  (state?.work?.jobs || []).forEach(job => (job.request?.messages || []).forEach(message => (message.attachments || []).forEach(add)));
  (inbox?.entries || []).forEach(entry => add(entry.input?.asset));
  return [...refs];
}
export function createAssetCodec(port: AssetPort) {
  const externalize = async (asset: LibraryAsset): Promise<LibraryAsset> => {
    if (!asset.data) return asset;
    const ref = asset.ref && ASSET_REF_PATTERN.test(asset.ref) ? asset.ref : assetDigest(asset.data);
    try { await port.write(ref, asset.data); } catch { return asset; } // Keep bytes inline rather than losing the document when storage is unavailable.
    return { ...asset, data: '', ref };
  };
  const hydrate = async (asset: LibraryAsset): Promise<LibraryAsset | null> => {
    if (asset.data) return asset;
    if (!asset.ref || !ASSET_REF_PATTERN.test(asset.ref)) return null;
    try { const data = await port.read(asset.ref); return data && decodedBytes(data) === asset.bytes ? { ...asset, data } : null; } catch { return null; }
  };
  const mapLibrary = async (state: AppState, map: (asset: LibraryAsset) => Promise<LibraryAsset | null>): Promise<AppState> => {
    const library = await Promise.all((state.assistant?.library || []).map(async item => {
      if (!item.asset) return item;
      const asset = await map(item.asset);
      if (asset) return { ...item, asset };
      const { asset: _missing, ...rest } = item;
      return rest;
    }));
    const jobs = await Promise.all((state.work?.jobs || []).map(async job => {
      if (!job.request?.messages?.some(message => message.attachments?.length)) return job;
      const messages = await Promise.all(job.request.messages.map(async message => {
        if (!message.attachments?.length) return message;
        const attachments = (await Promise.all(message.attachments.map(map))).filter((item): item is LibraryAsset => !!item);
        return { ...message, attachments };
      }));
      return { ...job, request: { ...job.request, messages } };
    }));
    return { ...state, assistant: { ...state.assistant, library }, work: { ...state.work, jobs } };
  };
  const mapInbox = async (inbox: IncomingInbox, map: (asset: LibraryAsset) => Promise<LibraryAsset | null>): Promise<IncomingInbox> => {
    const entries = await Promise.all(inbox.entries.map(async entry => {
      if (!entry.input?.asset) return entry;
      const asset = await map(entry.input.asset);
      if (asset) return { ...entry, input: { ...entry.input, asset } };
      const { asset: _missing, ...input } = entry.input;
      return { ...entry, input };
    }));
    return { ...inbox, entries };
  };
  return {
    externalizeState: (state: AppState) => mapLibrary(state, externalize),
    hydrateState: (state: AppState) => mapLibrary(state, hydrate),
    externalizeInbox: (inbox: IncomingInbox) => mapInbox(inbox, externalize),
    hydrateInbox: (inbox: IncomingInbox) => mapInbox(inbox, hydrate),
    prune: async (keep: string[]) => {
      const wanted = new Set(keep);
      try { const orphans = (await port.list()).filter(ref => !wanted.has(ref)); if (orphans.length) await port.remove(orphans); } catch { /* best-effort cleanup */ }
    },
  };
}
