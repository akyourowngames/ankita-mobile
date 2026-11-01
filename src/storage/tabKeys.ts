// Credentials live outside the saved app state and exports. The browser tier keeps
// them in durable origin storage so they survive a restart, migrating any value a
// previous release left in this tab's session storage.
const KEY_PREFIX = 'chief.tab-secret.'; // Browser-only credential namespace.
type CredentialStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function createTabKeyStore(durable: () => CredentialStorage | undefined, legacy: () => CredentialStorage | undefined = () => undefined) {
  const memory = new Map<string, string>();
  const put = (id: string, key: string): void => {
    // Keep empty tombstones too, so a blocked remove never revives a stale credential in this runtime.
    memory.set(id, key);
    try { const storage = durable(); if (key) storage?.setItem(KEY_PREFIX + id, key); else storage?.removeItem(KEY_PREFIX + id); } catch { /* Private/blocked storage retains the memory-only fallback. */ }
  };
  return {
    get(id: string): string {
      if (memory.has(id)) return memory.get(id)!;
      const name = KEY_PREFIX + id;
      try { const saved = durable()?.getItem(name); if (saved) return saved; } catch { /* blocked storage falls through to the legacy tier */ }
      try {
        const previous = legacy()?.getItem(name);
        if (previous) { put(id, previous); legacy()?.removeItem(name); return previous; }
      } catch { /* ignore unavailable legacy storage */ }
      return '';
    },
    put,
  };
}
