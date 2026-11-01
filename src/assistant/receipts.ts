import { ASSISTANT_LIMITS as L } from './config.ts';
import { object } from './validation.ts';
const PRIVATE_FIELD = /api[_-]?key|authorization|password|secret|credential|token/i;
const REDACTED = '[redacted]';
const JSON_ESCAPE_WIDTH = 6, RESULT_OVERHEAD = 160; // Characters: worst-case JSON escaping and wrapper reserve.
export function redact(value: unknown, secrets: string[] = [], depth = 0): unknown {
  if (depth > L.schemaDepth) return '[omitted]';
  if (typeof value === 'string') return secrets.filter(Boolean).reduce((text, secret) => text.split(secret).join(REDACTED), value);
  if (Array.isArray(value)) return value.map(item => redact(item, secrets, depth + 1));
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, PRIVATE_FIELD.test(key) ? REDACTED : redact(item, secrets, depth + 1)]));
  return value;
}
export function boundedToolResult(value: unknown): string {
  const result = JSON.stringify(value);
  return result.length <= L.toolResultChars ? result : JSON.stringify({ ok: true, truncated: true, preview: result.slice(0, Math.floor((L.toolResultChars - RESULT_OVERHEAD) / JSON_ESCAPE_WIDTH)) });
}
export function receiptPreview(value: unknown, secrets: string[] = []): string { return JSON.stringify(redact(value, secrets), null, 2).slice(0, L.receiptChars); }
