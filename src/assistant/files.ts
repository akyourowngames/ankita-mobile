import { ASSISTANT_LIMITS as L, ASSET_REF_PATTERN } from './config.ts';
import type { LibraryInput, LibraryAsset } from './types.ts';
import { object, text, keys } from './validation.ts';
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; // RFC 4648 alphabet, not an environment assumption.
const TEXT_EXTENSIONS = /\.(?:txt|md|markdown|json|csv|log)$/i;
const BINARY_MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const ENCODE_CHUNK_CHARS = 32_768; // Characters: avoid millions of one-character allocations on a phone.
// The external reference encodes the base64 length as base 36; a decoded file of
// N bytes always encodes to 4 * ceil(N / 3) characters.
const refMatchesBytes = (ref: string, bytes: number) => parseInt(ref.slice(1).split('-', 1)[0], 36) === Math.ceil(bytes / 3) * 4;
export function encodeBase64(bytes: Uint8Array) {
  const output: string[] = []; let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) { const n = bytes[i] << 16 | (bytes[i + 1] || 0) << 8 | (bytes[i + 2] || 0); chunk += BASE64[n >>> 18] + BASE64[n >>> 12 & 63] + (i + 1 < bytes.length ? BASE64[n >>> 6 & 63] : '=') + (i + 2 < bytes.length ? BASE64[n & 63] : '='); if (chunk.length >= ENCODE_CHUNK_CHARS) { output.push(chunk); chunk = ''; } }
  if (chunk) output.push(chunk);
  return output.join('');
}
function matches(bytes: Uint8Array, mime: string) {
  const prefix = new TextDecoder().decode(bytes.slice(0, 16)); // Bytes: signatures fit within the first sixteen bytes.
  if (mime === 'application/pdf') return prefix.startsWith('%PDF-');
  if (mime === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/webp') return prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP';
  return mime === 'image/gif' && /^(?:GIF87a|GIF89a)/.test(prefix);
}
export function validateAsset(value: unknown): asserts value is LibraryAsset {
  if (!object(value) || !keys(value, ['name', 'mimeType', 'data', 'bytes', 'ref']) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > L.titleChars || !BINARY_MIMES.includes(value.mimeType as string) || !Number.isInteger(value.bytes) || (value.bytes as number) <= 0 || (value.bytes as number) > L.fileBytes || typeof value.data !== 'string') throw new Error('Invalid document asset.');
  // A stored asset may carry only its external reference; inline bytes must still be exact.
  if (value.data === '') { if (value.ref === undefined || typeof value.ref !== 'string' || !ASSET_REF_PATTERN.test(value.ref) || !refMatchesBytes(value.ref, value.bytes as number)) throw new Error('Invalid document asset.'); return; }
  if (value.ref !== undefined && (typeof value.ref !== 'string' || !ASSET_REF_PATTERN.test(value.ref))) throw new Error('Invalid document asset.');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value.data) || value.data.length % 4 || value.data.length / 4 * 3 - (value.data.endsWith('==') ? 2 : value.data.endsWith('=') ? 1 : 0) !== value.bytes) throw new Error('Invalid document asset.');
}
export function importDocument(input: { name: string; mimeType?: string; bytes: Uint8Array }): LibraryInput {
  const title = text(input.name, L.titleChars, 'Document name');
  if (!input.bytes.byteLength || input.bytes.byteLength > L.fileBytes) throw new Error('The selected file exceeds the phone import limit or is empty.');
  const mime = input.mimeType?.toLowerCase() || '';
  if (BINARY_MIMES.includes(mime)) {
    if (!matches(input.bytes, mime)) throw new Error('The file bytes do not match its document type.');
    const asset: LibraryAsset = { name: title, mimeType: mime as LibraryAsset['mimeType'], data: encodeBase64(input.bytes), bytes: input.bytes.byteLength }; validateAsset(asset);
    return { title, content: '', kind: 'file', mimeType: mime, asset };
  }
  if (!TEXT_EXTENSIONS.test(title) && !mime.startsWith('text/') && !['application/json', 'application/csv'].includes(mime)) throw new Error('Choose a supported text, Markdown, JSON, CSV, image or PDF file.');
  const content = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes).replace(/^\uFEFF/, '');
  if (content.includes('\0') || content.length > L.documentChars) throw new Error('The document is not bounded UTF-8 text or exceeds the text import limit.');
  return { title, content, kind: 'file', mimeType: mime || 'text/plain' };
}
