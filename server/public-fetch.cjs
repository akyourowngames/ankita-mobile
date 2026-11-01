const dns = require('node:dns/promises');
const https = require('node:https');
const { Readable } = require('node:stream');
const policy = require('../src/assistant/webPolicy.cjs');
async function resolvePublicTarget(value, lookup = dns.lookup) {
  const url = policy.publicURL(String(value));
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !policy.publicAddress(item.address))) throw new Error('The webpage did not resolve exclusively to a public address.');
  const chosen = addresses.find(item => item.family === 4) || addresses[0];
  return { url, address: chosen.address, family: chosen.family };
}
async function fetchPublic(value, { headers = {}, signal } = {}) {
  const target = await resolvePublicTarget(value); signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const request = https.request(target.url, { method: 'GET', headers, signal, lookup: (_host, options, callback) => options?.all ? callback(null, [{ address: target.address, family: target.family }]) : callback(null, target.address, target.family) }, response => {
      const status = response.statusCode;
      if (!status) { response.destroy(); reject(new Error('Invalid webpage response')); return; }
      const headers = new Headers(); for (const [name, value] of Object.entries(response.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      resolve(new Response([204, 304].includes(status) ? null : Readable.toWeb(response), { status, headers }));
    });
    request.on('error', reject); request.end();
  });
}
module.exports = { resolvePublicTarget, fetchPublic };
