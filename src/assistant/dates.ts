// ISO local datetime fields omit the timezone; persisted tasks store epoch ms.
const pad = (value: number) => String(value).padStart(2, '0');
export function localDateField(value: number | null): string {
  if (value === null) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function localDateInstant(value: string): number | null {
  if (!value) return null;
  const instant = new Date(value).getTime();
  if (!Number.isFinite(instant) || localDateField(instant) !== value) throw new Error('Choose a valid local date and time.');
  return instant;
}
