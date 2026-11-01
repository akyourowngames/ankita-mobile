import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { SECRET_PREFIX, STORAGE_KEY } from '../constants/appConfig';
import { initialState, restoreState, type AppState } from '../core/state';
import { restoreIncomingInbox, type IncomingInbox } from '../sharing/inbox';
import { createTabKeyStore } from './tabKeys';
import { assetPort } from './assetStore';
import { collectAssetRefs, createAssetCodec } from './assets';

const INBOX_KEY = 'chief.mobile.incoming-shares.v1';
// Browser credentials are durable across restarts; the second tier migrates values
// that an earlier release left in this tab's session storage.
const tabKeys = createTabKeyStore(
  () => typeof window === 'undefined' ? undefined : window.localStorage,
  () => typeof window === 'undefined' ? undefined : window.sessionStorage,
);
const assets = createAssetCodec(assetPort);
let writeTail: Promise<void> = Promise.resolve();
// Saved metadata omits document bytes; they live in the asset store and are read
// back on load. Keeping them apart protects the bounded metadata database.
async function readInbox(): Promise<IncomingInbox | null> {
  try { return restoreIncomingInbox(await AsyncStorage.getItem(INBOX_KEY)); } catch { return null; }
}
export async function loadState(): Promise<AppState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return initialState();
  const state = await assets.hydrateState(restoreState(raw));
  // Reclaim any bytes left by an interrupted save without touching live references.
  void readInbox().then(inbox => assets.prune(collectAssetRefs(state, inbox))).catch(() => {});
  return state;
}
export function saveState(state: AppState): Promise<void> {
  writeTail = writeTail.catch(() => {}).then(async () => {
    const stored = await assets.externalizeState(state);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  });
  return writeTail;
}
export async function clearAssetStore(): Promise<void> {
  if (typeof assetPort.clear === 'function') await assetPort.clear();
}
export async function getKey(id: string): Promise<string> {
  if (Platform.OS === 'web') return tabKeys.get(id);
  return await SecureStore.getItemAsync(`${SECRET_PREFIX}${id}`) || '';
}
export async function putKey(id: string, key: string): Promise<void> {
  if (Platform.OS === 'web') { tabKeys.put(id, key); return; }
  if (key) await SecureStore.setItemAsync(`${SECRET_PREFIX}${id}`, key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  else await SecureStore.deleteItemAsync(`${SECRET_PREFIX}${id}`);
}
export async function deleteKeys(ids: string[]): Promise<void> { for (const id of ids) await putKey(id, ''); }
