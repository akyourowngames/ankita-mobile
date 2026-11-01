import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const stage = path.join(root, '.build-tools', 'native-stage');
await fs.mkdir(stage, { recursive: true });
const config = JSON.parse(await fs.readFile(path.join(root, 'app.json'), 'utf8'));
config.expo.plugins = config.expo.plugins.map(plugin => typeof plugin === 'string' && plugin.startsWith('./') ? path.resolve(root, plugin) : plugin);
await fs.writeFile(path.join(stage, 'app.json'), JSON.stringify(config, null, 2));
await fs.copyFile(path.join(root, 'package.json'), path.join(stage, 'package.json'));
try { await fs.symlink(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), 'junction'); } catch (error) { if (error.code !== 'EEXIST') throw error; }
console.log('Native staging prepared without clearing existing Android build caches.');
