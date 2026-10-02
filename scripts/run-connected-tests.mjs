import { spawn } from 'node:child_process';
import { startTestBackend } from './test-backend.mjs';
import { testConnectedOperations } from './test-connected-operations.mjs';
import { serveExport } from './serve-export.mjs';

const backend = await startTestBackend();
const origin = 'http://127.0.0.1:3102';
let server;
let mobileServer;
const commands=new Set();
async function run(args, env = process.env) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env });
  commands.add(child);
  child.once('exit',()=>commands.delete(child));
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Command exited ${code}: ${args.join(' ')}`)),
    );
  });
}
async function cleanup() {
  for(const child of commands) child.kill('SIGTERM');
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  await mobileServer?.close();
  await backend.close();
}
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await cleanup();
    process.exit(130);
  });
try {
  const env = {
    ...process.env,
    ...backend.environment,
    APP_ORIGIN: origin,
    ALLOWED_CLIENT_ORIGINS: 'http://127.0.0.1:3112',
  };
  await run(['scripts/run.mjs', 'web', 'build'], env);
  await run(['scripts/run.mjs','mobile','export','--platform','web','--output-dir','dist-connected','--clear','--max-workers','2'], {
    ...env, EXPO_PUBLIC_SUPABASE_URL:backend.url, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:backend.publishableKey, EXPO_PUBLIC_API_URL:origin,
  });
  mobileServer=await serveExport('apps/mobile/dist-connected',3112);
  server = spawn(
    process.execPath,
    [
      'apps/web/node_modules/next/dist/bin/next',
      'start',
      'apps/web',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3102',
    ],
    { stdio: 'inherit', env },
  );
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Connected test server exited before readiness');
    try {
      if ((await fetch(`${origin}/api/v1/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('Connected test server did not become ready');
  await testConnectedOperations(backend,origin);
  await run(
    ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.connected.config.ts'],
    {
      ...env,
      TEST_APP_ORIGIN: origin,
      TEST_MOBILE_URL: "http://127.0.0.1:3112",
      TEST_AUTH_URL: backend.url,
      TEST_AUTH_KEY: backend.publishableKey,
      TEST_AUTH_PASSWORD: 'Synthetic-only-password1!',
      TEST_EMPLOYER_EMAIL: 'employer@example.invalid',
      TEST_CANDIDATE_EMAIL: 'candidate@example.invalid',
    },
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
}
