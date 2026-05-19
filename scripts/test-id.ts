import { spawn } from 'node:child_process';
import * as path from 'node:path';

import chalk from 'chalk';

import { TestIdRegistry } from '../src/ai/codegen/shared/TestIdRegistry';

const args = process.argv.slice(2);
const id = (args[0] ?? '').toUpperCase().trim();

if (!id || id === '--LIST' || id === '-L') {
  if (id === '--LIST' || id === '-L') {
    const all = TestIdRegistry.all();
    if (all.length === 0) {
      console.log(chalk.dim('Registry is empty. Run `npm run gen:swagger` first.'));
      process.exit(0);
    }
    for (const e of all.sort((a, b) => a.displayId.localeCompare(b.displayId))) {
      const qase = e.qaseId ? chalk.cyan(` qase=${e.qaseId}`) : '';
      console.log(
        `${chalk.green(e.displayId)}  ${chalk.dim(e.kind.padEnd(22))}  ${e.operationId}${qase}`,
      );
    }
    process.exit(0);
  }
  console.error(chalk.red('Usage:  npm run t -- <TEST-ID> [extra codecept args]'));
  console.error(chalk.dim('       npm run t -- --list             # list all IDs'));
  console.error(chalk.dim('       npm run t -- PET-001'));
  console.error(chalk.dim('       npm run t -- PET-001 --verbose'));
  process.exit(1);
}

const entry = TestIdRegistry.lookup(id);
if (!entry) {
  console.error(chalk.red(`Test ID "${id}" not found in registry.`));
  console.error(
    chalk.dim('Run `npm run t -- --list` to see all registered IDs, or regenerate tests:'),
  );
  console.error(chalk.dim('   npm run gen:swagger -- --input <spec> --group <Name>'));
  process.exit(1);
}

const relFile = entry.file.replace(/\\/g, '/');
const codeceptArgs = [
  'codeceptjs',
  'run',
  relFile,
  '--grep',
  `@${entry.displayId}`,
  '--steps',
  ...args.slice(1),
];

console.log(
  chalk.dim(
    `▶ ${chalk.green(entry.displayId)} (${entry.operationId} / ${entry.kind}) — ${relFile}`,
  ),
);

const child = spawn('npx', codeceptArgs, {
  stdio: 'inherit',
  shell: true,
  cwd: path.resolve(__dirname, '..'),
});

child.on('exit', (code) => process.exit(code ?? 0));
