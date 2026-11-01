import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TOOLS = path.join(ROOT, '.build-tools'); // Workspace-local tools; no global PATH/registry changes.
const GOOGLE_REPOSITORY = 'https://dl.google.com/android/repository/'; // Official Android SDK archive metadata/root.
const ADOPTIUM_API = 'https://api.adoptium.net/v3/assets/latest/21/hotspot'; // Stable Temurin Java 21 LTS; compatible with current Gradle.
const DOWNLOAD_PROGRESS_BYTES = 32 * 1024 * 1024; // Bytes between bounded progress reports.
const LICENSE_RESPONSES = 32; // Bound SDK manager's interactive package license prompts.
const SDK_MAIN = 'com.android.sdklib.tool.sdkmanager.SdkManagerCli'; // Official command-line tool entry point, avoids shell quoting.
const exists = async p => !!await fs.stat(p).catch(() => null);

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, windowsHide: true, stdio: ['pipe', 'inherit', 'inherit'], ...options });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited ${code}`)));
    child.stdin.on('error', () => {}); child.stdin.end(options.input || '');
  });
}
async function hashFile(file, algorithm) { const hash = createHash(algorithm); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }
async function download(url, destination, checksum, algorithm) {
  if (await exists(destination) && await hashFile(destination, algorithm) === checksum) { console.log('ARCHIVE_CACHED', path.basename(destination)); return; }
  const res = await fetch(url); if (!res.ok) throw new Error(`Official archive download returned ${res.status}`);
  let bytes = 0, logged = 0;
  const stream = Readable.fromWeb(res.body); stream.on('data', chunk => { bytes += chunk.length; if (bytes - logged >= DOWNLOAD_PROGRESS_BYTES) { logged = bytes; console.log('DOWNLOADING', path.basename(destination), Math.round(bytes / (1024 * 1024)), 'MiB'); } });
  await pipeline(stream, createWriteStream(destination));
  if (await hashFile(destination, algorithm) !== checksum) throw new Error('Official archive checksum mismatch; nothing was extracted.');
  console.log('CHECKSUM_OK', path.basename(destination), algorithm);
}
async function extract(archive, destination) { await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./extract-archive.ps1', import.meta.url)), '-ArchivePath', archive, '-DestinationPath', destination]); }
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This bootstrap is for the detected Windows x64 build host. On other hosts use an existing Android SDK/JDK.');
await fs.mkdir(TOOLS, { recursive: true });
const sdk = path.join(TOOLS, 'android-sdk'), jdkParent = path.join(TOOLS, 'jdk');
const [javaMetadata, xml] = await Promise.all([
  fetch(`${ADOPTIUM_API}?architecture=x64&image_type=jdk&os=windows&vendor=eclipse`).then(r => { if (!r.ok) throw new Error('JDK metadata failed'); return r.json(); }),
  fetch(`${GOOGLE_REPOSITORY}repository2-3.xml`).then(r => { if (!r.ok) throw new Error('SDK metadata failed'); return r.text(); }),
]);
const pkg = javaMetadata[0]?.binary?.package;
if (!pkg?.link || !pkg?.checksum) throw new Error('Official JDK package metadata is incomplete');
const section = xml.match(/<remotePackage path="cmdline-tools;latest"[\s\S]*?<\/remotePackage>/)?.[0];
const archive = [...(section || '').matchAll(/<archive>[\s\S]*?<\/archive>/g)].map(m => m[0]).find(a => /<host-os>windows<\/host-os>/.test(a));
const sdkFile = archive?.match(/<url>([^<]+)<\/url>/)?.[1], sdkHash = archive?.match(/<checksum[^>]*>([^<]+)<\/checksum>/)?.[1];
if (!sdkFile || !sdkHash || !/^[\w.-]+\.zip$/.test(sdkFile)) throw new Error('Official Windows SDK archive metadata is incomplete');
console.log('OFFICIAL_BUILD_METADATA', pkg.name, sdkFile);
const jdkZip = path.join(TOOLS, path.basename(pkg.name)), sdkZip = path.join(TOOLS, sdkFile);
await Promise.all([download(pkg.link, jdkZip, pkg.checksum, 'sha256'), download(`${GOOGLE_REPOSITORY}${sdkFile}`, sdkZip, sdkHash, 'sha1')]);
if (!await exists(jdkParent)) await extract(jdkZip, jdkParent);
const javaFolders = await fs.readdir(jdkParent, { withFileTypes: true }), javaHome = path.join(jdkParent, javaFolders.find(p => p.isDirectory())?.name || '');
const java = path.join(javaHome, 'bin', 'java.exe'); if (!await exists(java)) throw new Error('Extracted Java executable not found');
const cmdline = path.join(sdk, 'cmdline-tools', 'latest');
if (!await exists(path.join(cmdline, 'bin', 'sdkmanager.bat'))) { const extracted = path.join(TOOLS, 'sdk-unpacked'); if (!await exists(extracted)) await extract(sdkZip, extracted); await fs.mkdir(path.dirname(cmdline), { recursive: true }); const source = path.resolve(extracted, 'cmdline-tools'); if (!source.startsWith(`${TOOLS}${path.sep}`) || !cmdline.startsWith(`${TOOLS}${path.sep}`)) throw new Error('SDK paths escaped the workspace'); await fs.cp(source, cmdline, { recursive: true, force: false }); }
const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
const managerArgs = ['-Dcom.android.sdklib.toolsdir=' + cmdline, '-cp', path.join(cmdline, 'lib', '*'), SDK_MAIN, '--sdk_root=' + sdk];
await run(java, [...managerArgs, '--licenses'], { env, input: 'y\n'.repeat(LICENSE_RESPONSES) });
// SDK packages match the checked Expo 57 compatibility table. Gradle installs exact NDK/CMake revisions from its own configuration.
const versions = await fs.readFile(path.join(ROOT, 'node_modules', 'react-native', 'gradle', 'libs.versions.toml'), 'utf8');
const compileSdk = versions.match(/^compileSdk\s*=\s*"([\d]+)"/m)?.[1], buildTools = versions.match(/^buildTools\s*=\s*"([\d.]+)"/m)?.[1];
if (!compileSdk || !buildTools) throw new Error('React Native Android SDK versions could not be discovered.');
const packages = ['platform-tools', `platforms;android-${compileSdk}`, `build-tools;${buildTools}`];
await run(java, [...managerArgs, ...packages], { env, input: 'y\n'.repeat(LICENSE_RESPONSES) });
await fs.writeFile(path.join(ROOT, 'android', 'local.properties'), `sdk.dir=${sdk.replaceAll('\\', '/')}\n`);
await fs.writeFile(path.join(TOOLS, 'environment.json'), JSON.stringify({ javaHome, sdk }, null, 2));
console.log('ANDROID_BUILD_TOOLS_READY', javaHome, sdk);
