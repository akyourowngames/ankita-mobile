import type { AssetPort } from './assets.ts';

// IndexedDB is not subject to the ~5 MB localStorage quota, so document bytes stay
// durable across browser restarts without crowding the saved app state.
const DB_NAME = 'chief-assets';
const STORE = 'bytes';
const VERSION = 1;

let database: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser has no IndexedDB.')); return; }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Asset storage is unavailable.'));
  });
  database.catch(() => { database = null; });
  return database;
}
function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode), request = work(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Asset storage failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Asset storage was aborted.'));
  }));
}

export const assetPort: AssetPort & { clear(): Promise<void> } = {
  read: ref => run<string | undefined>('readonly', store => store.get(ref)).then(value => value ?? null),
  write: (ref, data) => run('readwrite', store => store.put(data, ref)).then(() => undefined),
  remove: refs => open().then(db => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite'), store = transaction.objectStore(STORE);
    refs.forEach(ref => store.delete(ref));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Asset cleanup failed.'));
  })),
  list: () => run<IDBValidKey[]>('readonly', store => store.getAllKeys()).then(keys => keys.filter((key): key is string => typeof key === 'string')),
  clear: () => run('readwrite', store => store.clear()).then(() => undefined),
};
