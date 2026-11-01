import net from 'node:net';
import { spawn } from 'node:child_process';
import { VERIFY_TIMEOUTS } from './verification-config.mjs';
const PROBE_MS = 1000, START_TIMEOUT_MS = VERIFY_TIMEOUTS.developmentMs; // Milliseconds: readiness poll and cold Metro compilation deadline.
const host = '127.0.0.1'; // Loopback: isolated verifier only, never a provider default.
const reserve = net.createServer();
await new Promise(resolve => reserve.listen(0, host, resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const origin = `http://${host}:${port}`;
const child = spawn(process.execPath, ['node_modules/expo/bin/cli', 'start', '--web', '--port', String(port)], { env: { ...process.env, CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', data => process.stdout.write(data));
child.stderr.on('data', data => process.stderr.write(data));
try {
  const start = Date.now();
  while (true) {
    if (child.exitCode !== null) throw new Error('Expo exited before readiness');
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(PROBE_MS) })).ok) break; } catch {}
    if (Date.now() - start > START_TIMEOUT_MS) throw new Error('Expo readiness deadline exceeded');
    await new Promise(resolve => setTimeout(resolve, PROBE_MS));
  }
  for (const script of ['scripts/verify-mobile.mjs', 'scripts/verify-assistant.mjs']) {
    const verify = spawn(process.execPath, [script], { env: { ...process.env, CHIEF_VERIFY_URL: origin }, stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { verify.on('exit', resolve); verify.on('error', reject); });
    if (code !== 0) throw new Error(`Development UI verification failed: ${script}`);
  }
} finally {
  if (process.platform === 'win32' && child.pid) {
    // Terminate only the process tree this verifier spawned, including Metro workers.
    const stop = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    await new Promise(resolve => stop.on('exit', resolve));
  } else child.kill();
  child.stdout.destroy(); child.stderr.destroy(); child.unref();
}
