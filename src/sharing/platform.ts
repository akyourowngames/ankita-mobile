import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { File, FileMode } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ASSISTANT_LIMITS as L } from '../assistant/config';
import { restoreIncomingInbox, createIncomingInbox, readBoundedShareBytes, receiveNativeShares, webSharePayloads, type IncomingPayload } from './inbox';
import { assetPort } from '../storage/assetStore';
import { createAssetCodec } from '../storage/assets';
const STORAGE_KEY = 'chief.mobile.incoming-shares.v1';
const EXTENSIONS: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'text/plain': 'txt', 'text/markdown': 'md', 'application/json': 'json', 'text/csv': 'csv', 'application/csv': 'csv' };
export async function readIncomingFile(payload: IncomingPayload) {
  // Never fetch a URL or resolve a web page as an incidental side effect of receiving a share.
  if (!/^(?:file|content):\/\//i.test(payload.value)) throw new Error('The shared file is not a local file. Share a downloaded copy from its original app.');
  const file = new File(payload.value), size = file.size;
  if (!Number.isFinite(size) || size <= 0 || size > L.fileBytes) throw new Error('The selected file exceeds the phone import limit or its size is unavailable. Share a file up to 1 MiB.');
  const mimeType = payload.mimeType?.toLowerCase().split(';', 1)[0] || file.type?.toLowerCase() || '';
  let name = file.name || 'Shared document';
  try { name = decodeURIComponent(name); } catch { /* Keep the provided local filename. */ }
  name = name.replace(/[\u0000-\u001f\\/]/g, '_').slice(0, L.titleChars);
  if (!/\.[a-z0-9]{1,10}$/i.test(name) && EXTENSIONS[mimeType]) name = `${name.slice(0, L.titleChars - 6)}.${EXTENSIONS[mimeType]}`;
  return { name, mimeType, bytes: readBoundedShareBytes(file.open(FileMode.ReadOnly)) };
}
// Share bytes follow the same external-store rule as the library so a queued PDF
// cannot overflow the metadata database before it is reviewed.
const shareAssets = createAssetCodec(assetPort);
export const incomingShares = createIncomingInbox({
  storage: {
    async get() {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      return raw === null ? null : JSON.stringify(await shareAssets.hydrateInbox(restoreIncomingInbox(raw)));
    },
    async set(value) {
      const inbox = restoreIncomingInbox(value), stored = await shareAssets.externalizeInbox(inbox);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    },
  },
  readFile: readIncomingFile,
});
export async function refreshIncomingShares() {
  await incomingShares.load();
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    const payloads = webSharePayloads(window.location.href);
    if (!payloads.length) return;
    await incomingShares.capture(payloads);
    const url = new URL(window.location.href);
    for (const key of ['share_text', 'share_url', 'share_title']) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return;
  }
  // The installed convenience hook resolves remote URLs automatically; use only the raw APIs.
  await receiveNativeShares({ get: Sharing.getSharedPayloads, clear: Sharing.clearSharedPayloads }, incomingShares);
}
export async function clearIncomingShares() {
  await incomingShares.clear();
  dismissPendingIncomingShare();
}
// Explicit discard of an OS batch that could not fit the inbox; approved/persisted entries stay intact.
export function dismissPendingIncomingShare() {
  if (Platform.OS !== 'web') {
    // Clearing is an explicit privacy/reset operation; unavailable Expo Go APIs may safely be absent.
    try { Sharing.clearSharedPayloads(); } catch { /* Native extension needs a development or release build. */ }
  } else if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    for (const key of ['share_text', 'share_url', 'share_title']) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
}
