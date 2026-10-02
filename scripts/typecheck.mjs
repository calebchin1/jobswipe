import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiler = path.join(root, 'node_modules/typescript/bin/tsc');
let failed = false;
for (const group of ['packages', 'apps']) {
  for (const name of readdirSync(path.join(root, group)).sort()) {
    const cwd = path.join(root, group, name);
    if (!existsSync(path.join(cwd, 'tsconfig.json'))) continue;
    console.log(`Typecheck ${group}/${name}`);
    const result = spawnSync(process.execPath, [compiler, '--noEmit'], { cwd, stdio: 'inherit' });
    if (result.status !== 0) failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
