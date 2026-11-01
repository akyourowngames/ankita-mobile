const config = require('../constants/assistantTransport.json');
const URL_ERROR = 'Use a public HTTPS URL without credentials, local names or private addresses.';
// IPv4 first-octet/CIDR exclusions: local, documentation, multicast and reserved ranges.
function publicAddress(address) {
  const normalized = address.replace(/^\[|\]$/g, '').toLowerCase();
  if (normalized.includes(':')) {
    const words = normalized.split(':');
    const first = parseInt(words[0] || '0', 16), second = parseInt(words[1] || '0', 16);
    // Only global-unicast 2000::/3; exclude documentation and transition tunnels.
    return first >= 0x2000 && first <= 0x3fff && first !== 0x2002 && !(first === 0x2001 && [0, 0xdb8].includes(second));
  }
  const parts = normalized.split('.');
  if (parts.length !== 4 || !parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return false;
  const [a, b, c] = parts.map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
function publicURL(value) {
  let url;
  try { if (typeof value !== 'string' || value.length > config.urlChars) throw new Error(); url = new URL(value); } catch { throw new Error(URL_ERROR); }
  const host = url.hostname.toLowerCase(), ip = host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || (ip ? !publicAddress(host) : !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid)$/.test(host))) throw new Error(URL_ERROR);
  url.hash = ''; return url;
}
module.exports = { publicAddress, publicURL, URL_ERROR };
