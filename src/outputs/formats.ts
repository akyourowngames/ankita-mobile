import { outputData, restoreOutputs, type OutputArtifact, type OutputTable, type OutputChecklist, type OutputCalendar } from '../assistant/outputs.ts';
export type OutputFormat = 'md' | 'txt' | 'html' | 'csv' | 'json' | 'ics';
export type OutputFile = { filename: string; mimeType: string; content: string; extension: OutputFormat };
const MIMES: Record<OutputFormat, string> = { md: 'text/markdown', txt: 'text/plain', html: 'text/html', csv: 'text/csv', json: 'application/json', ics: 'text/calendar' };
export function outputFormats(artifact: OutputArtifact): OutputFormat[] {
  return artifact.kind === 'table' ? ['csv', 'json', 'html', 'txt'] : artifact.kind === 'calendar' ? ['ics', 'json', 'txt', 'html'] : artifact.kind === 'json' ? ['json', 'txt', 'html'] : ['md', 'txt', 'html', ...(artifact.kind === 'checklist' ? ['json' as const] : [])];
}
export function safeOutputFilename(title: string, extension: OutputFormat) {
  let name = title.normalize('NFKC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/g, '-').replace(/\.[A-Za-z0-9]{1,12}$/g, '').replace(/^[.\s-]+|[.\s-]+$/g, '').slice(0, 80).trim();
  if (!name || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) name = 'output';
  return `${name}.${extension}`;
}
const htmlEscape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const csvCell = (value: string) => `"${(/^[\s\u0000-\u001f\u007f\uFEFF]*[=+\-@]/u.test(value) ? "'" + value : value).replace(/"/g, '""')}"`;
const icsEscape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
const utc = (value: string | number) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
function fold(line: string) {
  const encoder = new TextEncoder(); let result = '', used = 0;
  for (const char of line) { const size = encoder.encode(char).length; if (used + size > 75) { result += '\r\n '; used = 1; } result += char; used += size; }
  return result;
}
export function outputPlainText(artifact: OutputArtifact): string {
  const data = outputData(artifact);
  if (artifact.kind === 'document') return artifact.content;
  if (artifact.kind === 'table') { const table = data as OutputTable; return [table.columns, ...table.rows].map(row => row.join('\t')).join('\n'); }
  if (artifact.kind === 'checklist') return (data as OutputChecklist).items.map(item => `- [${item.checked ? 'x' : ' '}] ${item.text}`).join('\n');
  if (artifact.kind === 'calendar') return (data as OutputCalendar).events.map(event => [event.title, `${event.start}${event.end ? ` → ${event.end}` : ''}`, event.location, event.description].filter(Boolean).join('\n')).join('\n\n');
  return JSON.stringify(data, null, 2);
}
export function exportOutput(input: OutputArtifact, format: OutputFormat): OutputFile {
  const artifact = restoreOutputs([input])[0];
  if (!outputFormats(artifact).includes(format)) throw new Error('This export format is unavailable for this output.');
  const data = outputData(artifact); let content: string;
  if (format === 'json') content = JSON.stringify(data, null, 2);
  else if (format === 'csv') { const table = data as OutputTable; content = [table.columns, ...table.rows].map(row => row.map(csvCell).join(',')).join('\r\n'); }
  else if (format === 'ics') {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ANKITA//Finished outputs//EN', 'CALSCALE:GREGORIAN'];
    (data as OutputCalendar).events.forEach((event, index) => lines.push('BEGIN:VEVENT', `UID:${encodeURIComponent(artifact.id)}-${index}@ankita.local`, `DTSTAMP:${utc(artifact.updatedAt)}`, `DTSTART:${utc(event.start)}`, ...(event.end ? [`DTEND:${utc(event.end)}`] : []), `SUMMARY:${icsEscape(event.title)}`, ...(event.description ? [`DESCRIPTION:${icsEscape(event.description)}`] : []), ...(event.location ? [`LOCATION:${icsEscape(event.location)}`] : []), 'END:VEVENT'));
    lines.push('END:VCALENDAR'); content = lines.map(fold).join('\r\n') + '\r\n';
  } else if (format === 'html') {
    const body = artifact.kind === 'table' ? `<table><thead><tr>${(data as OutputTable).columns.map(cell => `<th>${htmlEscape(cell)}</th>`).join('')}</tr></thead><tbody>${(data as OutputTable).rows.map(row => `<tr>${row.map(cell => `<td>${htmlEscape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<pre>${htmlEscape(outputPlainText(artifact))}</pre>`;
    content = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${htmlEscape(artifact.title)}</title></head><body><h1>${htmlEscape(artifact.title)}</h1>${body}</body></html>`;
  } else content = outputPlainText(artifact);
  return { filename: safeOutputFilename(artifact.title, format), mimeType: MIMES[format], extension: format, content };
}
