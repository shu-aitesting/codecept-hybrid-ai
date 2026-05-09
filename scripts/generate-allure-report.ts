import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);
const resultsDir = path.resolve('output/reports/allure');
const reportDir = path.resolve('output/reports/allure-html');

async function main() {
  if (!fs.existsSync(resultsDir)) {
    console.log('No Allure results found. Run tests first.');
    process.exit(0);
  }

  console.log(`Generating Allure report from ${resultsDir}...`);
  try {
    await execAsync(`npx allure generate "${resultsDir}" -o "${reportDir}" --clean`);
    console.log(`✓ Report generated: ${reportDir}`);
    console.log('Opening report in browser...');
    await execAsync(`npx allure open "${reportDir}"`);
  } catch (err: any) {
    console.error('Failed to generate or open Allure report:', err.message);
    console.error('stderr:', err.stderr?.toString());
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Failed to generate Allure report:', err);
  process.exit(1);
});
