// One shared browser/native/relay endpoint policy. No credentials in URLs.
function isLocalHost(host) {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '[::1]') return true;
  if (/^\[(fc|fd|fe80:)/i.test(host)) return true; // IPv6 local/unique-local prefixes.
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  return parts[0] === 127 || parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}
function normalizeEndpoint(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter the full provider URL, including https:// or http:// for your local server.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTP(S) endpoint without embedded credentials, query parameters or fragments.');
  if (url.protocol === 'http:' && !isLocalHost(url.hostname)) throw new Error('Use HTTPS for remote providers. HTTP is allowed only for your local network.');
  return url.href.replace(/\/+$/, '');
}
module.exports = { normalizeEndpoint };
