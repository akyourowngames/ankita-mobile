import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openWorkStore } from '../server/work-store.mjs';
import { createWorkRuntime } from '../server/work-runtime.mjs';
import { createWorkServer, createWorkHandler } from '../server/work-server.mjs';
import { createPushDelivery } from '../server/work-push.mjs';
import { acquireWorkLease } from '../server/work-lease.mjs';
import config from '../src/constants/work.json' with { type: 'json' };

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) { if (!process.argv[i].startsWith('--') || !process.argv[i + 1]) throw new Error('Use --host, --port, --data-dir, --cert and --key with explicit values.'); args.set(process.argv[i].slice(2), process.argv[i + 1]); }
const host = args.get('host') || config.loopbackHost, port = Number(args.get('port') || config.defaultPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Choose a valid worker port.');
const tls = args.has('cert') && args.has('key');
if (!['127.0.0.1', '::1', 'localhost'].includes(host) && !tls) throw new Error('A phone or remote worker connection requires an HTTPS certificate and private key.');
const root = path.resolve(args.get('data-dir') || fileURLToPath(new URL('../.build-tools/work/', import.meta.url)));
await fs.mkdir(root, { recursive: true, mode: 0o700 });
const release = await acquireWorkLease(root); process.once('exit', release);
const pairingFile = path.join(root, 'pairing.json');
let pairing;
try { pairing = JSON.parse(await fs.readFile(pairingFile, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw new Error('Pairing data could not be read. Preserve it and check the worker folder.'); pairing = { token: randomBytes(32).toString('hex') }; await fs.writeFile(pairingFile, JSON.stringify(pairing), { flag: 'wx', mode: 0o600 }); }
if (!/^[a-f\d]{64}$/.test(pairing.token)) throw new Error('Pairing data is invalid.');
const store = await openWorkStore(root), runtime = createWorkRuntime({ store }), push = createPushDelivery({ store });
await runtime.ready;
const options = { runtime, token: pairing.token };
const server = tls ? https.createServer({ cert: await fs.readFile(args.get('cert')), key: await fs.readFile(args.get('key')) }, (req, res) => void createWorkHandler(options)(req, res)) : createWorkServer(options);
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
console.log(`Ankita work service: ${tls ? 'https' : 'http'}://${host}:${port}`);
console.log(`Private pairing file: ${pairingFile}`);
console.log('Keep this service running for queued work and push delivery. Provider credentials are encrypted at rest.');
const timer = setInterval(() => void push.tick().catch(() => {}), config.pollMs);
async function close() { clearInterval(timer); await runtime.close(); server.closeAllConnections(); server.close(() => process.exit(0)); }
process.once('SIGINT', close); process.once('SIGTERM', close);
