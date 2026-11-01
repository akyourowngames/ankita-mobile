import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import config from '../src/constants/companion.json' with { type: 'json' };

const [root, workspace, configFile, mode] = process.argv.slice(2);
const load = relative => import(pathToFileURL(path.join(root, relative)).href);
const send = value => { if (process.connected) process.send(value); };
const approvals = new Map(); let agent, cancelled = false;
process.on('message', async message => {
  if (message.type === 'cancel') { cancelled = true; agent?.cancel(); for (const resolve of approvals.values()) resolve(false); approvals.clear(); }
  if (message.type === 'approval') { approvals.get(message.id)?.(message.allow === true); approvals.delete(message.id); }
});
try {
  const registry = await load('tools/index.mjs');
  if (mode === 'capabilities') { send({ type: 'result', value: registry.names() }); }
  else {
    const [{ Agent }, { createSession }, { loadConfig }, { resolveGithubToken }, { configuredSecrets, redactText }, { isToolFailure }] = await Promise.all([
      load('src/core/agent.mjs'), load('src/core/bootstrap.mjs'), load('src/core/config.mjs'), load('src/core/auth.mjs'), load('src/core/redact.mjs'),
      load('src/core/verify.mjs'),
    ]);
    const settings = loadConfig(configFile || path.join(workspace, '.env'));
    // Companion requests are bounded foreground work and always retain the desktop approval gate.
    Object.assign(settings, { tools: true, autoApprove: false, backgroundJob: false, memoryConsolidation: false });
    if (!settings.apiBase && (!settings.provider || settings.provider === 'copilot') && !resolveGithubToken()) throw new Error('Sign in on the desktop first.');
    const session = await createSession({ config: settings });
    const secrets = configuredSecrets(process.env, settings);
    const safe = value => redactText(String(value ?? ''), { secrets }).slice(0, config.resultChars);
    agent = new Agent({ client: session.client, tool: session.tool, config: settings, workspacePath: workspace, deferTools: true, skillsEnabled: false, print: () => {}, write: () => {}, confirm: (name, detail) => {
      if (cancelled) return Promise.resolve(false);
      const id = randomUUID(); return new Promise(resolve => { approvals.set(id, resolve); send({ type: 'approval', id, name, detail: safe(detail) }); });
    } });
    agent.model = session.model;
    process.once('message', async message => {
      if (message.type !== 'run' || cancelled) { send({ type: 'failed' }); return; }
      try {
        const value = await agent.send(message.prompt, {
          onToolCall: call => send({ type: 'event', event: { type: 'tool_call', name: call.function.name, detail: safe(call.function.arguments) } }),
          onToolResult: (call, result) => send({ type: 'event', event: { type: 'tool_result', name: call.function.name, detail: safe(result), failed: isToolFailure(result) } }),
        });
        await registry.cleanupJobs(agent.state); send({ type: 'result', value: safe(value) });
      } catch { await registry.cleanupJobs(agent.state); send({ type: 'failed' }); }
    });
    send({ type: 'ready' });
  }
} catch { send({ type: 'failed' }); }
