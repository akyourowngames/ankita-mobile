import type { OutputArtifact } from '../assistant/outputs';
import { exportOutput, type OutputFormat } from './formats.ts';
export const outputDeliveryLabel = 'Download file';
export async function deliverOutput(artifact: OutputArtifact, format: OutputFormat, share = false): Promise<string> {
  const file = exportOutput(artifact, format), blob = new Blob([file.content], { type: `${file.mimeType};charset=utf-8` });
  if (share) {
    const nativeFile = new File([blob], file.filename, { type: file.mimeType });
    if (!navigator.canShare?.({ files: [nativeFile] }) || !navigator.share) throw new Error('This browser cannot share files. Use Download file to keep a copy.');
    await navigator.share({ title: artifact.title, files: [nativeFile] }); return `Share sheet opened for ${file.filename}.`;
  }
  const uri = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = uri; anchor.download = file.filename; anchor.rel = 'noopener'; document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(uri), 1_000); }
  return `Download started: ${file.filename}`;
}
