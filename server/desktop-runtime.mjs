import fs from 'node:fs/promises';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import config from '../src/constants/companion.json' with { type: 'json' };

const WORKER = fileURLToPath(new URL('./desktop-worker.mjs', import.meta.url));
// Paths are the current desktop runtime contract, resolved against explicit user configuration.
const REQUIRED_MODULES = ['src/core/agent.mjs', 'src/core/bootstrap.mjs', 'src/core/config.mjs', 'tools/index.mjs'];
export async function createDesktopRuntime({ desktopRoot, workspace, configFile, environment = process.env }) {
  if (!desktopRoot || !workspace) throw new Error('Specify --desktop-repo and --workspace.');
  const root = await fs.realpath(desktopRoot), cwd = await fs.realpath(workspace);
  for (const module of REQUIRED_MODULES) await fs.access(path.join(root, module));
  if (!(await fs.stat(cwd)).isDirectory()) throw new Error('Workspace must be a directory.');
  const execute = (mode, prompt, hooks) => new Promise((resolve, reject) => {
    const child = fork(WORKER, [root, cwd, configFile || '', mode], { cwd, env: environment, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    let settled = false, ready = false, stopTimer;
    const cancel = () => {
      if (settled) return;
      if (!ready) return finish(new Error('Desktop startup cancelled.'));
      if (child.connected) child.send({ type: 'cancel' }, () => {});
      stopTimer ||= setTimeout(() => finish(new Error('Desktop request cancelled.')), config.stopGraceMs);
    };
    const timer = setTimeout(cancel, config.runMs);
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(stopTimer); hooks?.signal.removeEventListener('abort', cancel); if (child.connected) child.disconnect(); child.kill(); error ? reject(error) : resolve(value); };
    hooks?.signal.addEventListener('abort', cancel, { once: true });
    child.on('error', () => finish(new Error('Desktop runtime could not start.')));
    child.on('exit', () => { if (!settled) finish(new Error('Desktop runtime exited before completing the request.')); });
    child.on('message', async message => {
      if (settled) return;
      if (message.type === 'ready') { ready = true; if (hooks?.signal.aborted) cancel(); else child.send({ type: 'run', prompt }); }
      if (message.type === 'event') hooks?.event(message.event);
      if (message.type === 'approval') {
        let allow = false;
        try { allow = await hooks.approve(message.name, message.detail); } catch {}
        if (!settled && child.connected) child.send({ type: 'approval', id: message.id, allow: allow === true && !hooks.signal.aborted }, () => {});
      }
      if (message.type === 'result') finish(null, message.value);
      if (message.type === 'failed') finish(new Error('The desktop runtime failed. Check its provider configuration.'));
    });
  });
  const tools = await execute('capabilities');
  return { capabilities: async () => tools, run: (prompt, hooks) => execute('run', prompt, hooks) };
}
