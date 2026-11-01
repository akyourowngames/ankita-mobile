import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { OutputArtifact } from '../assistant/outputs';
import type { OutputFormat } from './formats';
import { writeOutput } from './fileAdapter';

export const outputDeliveryLabel = 'Save / share file';
export async function deliverOutput(artifact: OutputArtifact, format: OutputFormat, _share = false): Promise<string> {
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device. Your output remains saved in Finished outputs.');
  const result = await writeOutput(artifact, format, {
    async write(file) {
      // Export copies are temporary. The editable record remains the source of truth.
      // Distinct copies also prevent two cards with the same title sharing each other's bytes.
      const directory = new Directory(Paths.cache, 'finished-outputs', `${Date.now()}-${Math.random().toString(36).slice(2)}`); directory.create({ intermediates: true, idempotent: true });
      const target = new File(directory, file.filename); target.create({ overwrite: true }); target.write(file.content);
      return target.uri;
    },
    async share(uri, file) { await Sharing.shareAsync(uri, { mimeType: file.mimeType, dialogTitle: `Save or share ${file.filename}` }); },
  }, true);
  return `Opened save / share for ${result.filename}. Choose an app or Files to keep a copy.`;
}
