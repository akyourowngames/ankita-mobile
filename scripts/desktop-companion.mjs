import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createCompanionServer } from '../server/companion.mjs';
import { createDesktopRuntime } from '../server/desktop-runtime.mjs';
import config from '../src/constants/companion.json' with { type: 'json' };

const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) { const key = args[i], value = args[i + 1]; if (!['--desktop-repo', '--workspace', '--config', '--host', '--port', '--cert', '--key', '--pairing-file'].includes(key) || !value) throw new Error('Use --desktop-repo PATH --workspace PATH [--host HOST --port PORT --cert PEM --key PEM].'); options[key.slice(2)] = value; }
const host = options.host || config.defaultHost, port = options.port === undefined ? config.defaultPort : Number(options.port);
if (!Number.isInteger(port) || port < 0 || port > config.maxPort) throw new Error('Port must be an integer from 0 through 65535.');
const loopback = ['127.0.0.1', '::1', 'localhost'].includes(host);
if ((!loopback || options.cert || options.key) && (!options.cert || !options.key)) throw new Error('A LAN listener requires --cert and --key for trusted HTTPS.');
const project = fileURLToPath(new URL('../', import.meta.url));
const pairingFile = path.resolve(options['pairing-file'] || path.join(project, config.pairingDirectory, config.pairingFile));
let token;
try { const saved = JSON.parse(await fs.readFile(pairingFile, 'utf8')); if (typeof saved.token !== 'string' || !new RegExp(`^[a-f\\d]{${config.tokenBytes * 2}}$`).test(saved.token)) throw new Error('Invalid pairing credential file.'); token = saved.token; }
catch (error) { if (error.code !== 'ENOENT') throw error; token = randomBytes(config.tokenBytes).toString('hex'); await fs.mkdir(path.dirname(pairingFile), { recursive: true }); await fs.writeFile(pairingFile, JSON.stringify({ version: config.version, token }), { flag: 'wx', mode: 0o600 }); }
const runtime = await createDesktopRuntime({ desktopRoot: options['desktop-repo'], workspace: options.workspace, configFile: options.config });
const tls = options.cert ? { cert: await fs.readFile(options.cert), key: await fs.readFile(options.key) } : undefined;
const server = createCompanionServer({ token, runtime, tls });
server.listen(port, host, () => { console.log(`Desktop companion listening on ${tls ? 'https' : 'http'}://${host}:${server.address().port}`); console.log(`Pairing credential is stored privately in ${pairingFile}. Copy its token into Assistant > Tools & permissions > Desktop connection.`); });
const close = () => { server.closeAllConnections(); server.close(); };
process.on('SIGINT', close); process.on('SIGTERM', close);
