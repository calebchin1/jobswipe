import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const [target, ...args] = process.argv.slice(2);
const tools = {
  web: ['apps/web', 'node_modules/next/dist/bin/next'],
  mobile: ['apps/mobile', 'node_modules/expo/bin/cli'],
};
if (!Object.hasOwn(tools, target ?? '')) {
  console.error('Usage: node scripts/run.mjs <web|mobile> [arguments]');
  process.exit(1);
}
const [directory, binary] = tools[target];
const cwd = path.join(root, directory);
const child = spawn(process.execPath, [path.join(cwd, binary), ...args], {
  cwd,
  stdio: 'inherit',
  env: process.env,
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
