import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, '.build-tools', 'native-stage', 'android'), destination = path.join(root, 'android');
await fs.cp(source, destination, { recursive: true, force: true });
const tools = JSON.parse(await fs.readFile(path.join(root, '.build-tools', 'environment.json'), 'utf8'));
await fs.writeFile(path.join(destination, 'local.properties'), `sdk.dir=${tools.sdk.replaceAll('\\', '/')}\n`);
console.log('Generated Android configuration synchronized; existing build caches retained.');
