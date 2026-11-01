import type { OutputArtifact } from '../assistant/outputs.ts';
import { exportOutput, type OutputFormat, type OutputFile } from './formats.ts';
export type OutputFilePort = { write(file: OutputFile): Promise<string>; share?(uri: string, file: OutputFile): Promise<void> };
/** Resolve only after the file exists (and the platform share API resolves, when requested). */
export async function writeOutput(artifact: OutputArtifact, format: OutputFormat, port: OutputFilePort, share = false) {
  const file = exportOutput(artifact, format);
  if (share && !port.share) throw new Error('File sharing is unavailable on this device.');
  const uri = await port.write(file);
  if (!uri) throw new Error('The output file could not be created.');
  if (share) await port.share!(uri, file);
  return { uri, filename: file.filename, shared: share };
}
