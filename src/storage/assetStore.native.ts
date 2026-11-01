import { Directory, File, Paths } from 'expo-file-system';
import type { AssetPort } from './assets.ts';

// Document bytes live in the app's document directory, which survives restarts and
// is not evicted like the cache. They are stored as base64 text under the content ref.
const root = new Directory(Paths.document, 'chief-assets');
const target = (ref: string) => new File(root, `${ref}.b64`);
const ensure = () => { if (!root.exists) root.create({ intermediates: true, idempotent: true }); };

export const assetPort: AssetPort & { clear(): Promise<void> } = {
  async read(ref) {
    const file = target(ref);
    return file.exists ? await file.text() : null;
  },
  async write(ref, data) {
    ensure();
    const file = target(ref);
    if (!file.exists) file.create({ intermediates: true });
    file.write(data);
  },
  async remove(refs) {
    if (!root.exists) return;
    for (const ref of refs) { const file = target(ref); if (file.exists) file.delete(); }
  },
  async list() {
    if (!root.exists) return [];
    return root.list().filter((entry): entry is File => entry instanceof File).map(file => file.name.replace(/\.b64$/, ''));
  },
  async clear() { if (root.exists) root.delete(); },
};
