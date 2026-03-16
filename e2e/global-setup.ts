/**
 * Playwright Global Setup — ensures vibeflow_e2e database exists and schema is synced.
 * Runs once before all E2E test suites.
 */
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

export default function globalSetup() {
  const dbName = 'vibeflow_e2e';
  const dbUser = os.userInfo().username;
  const dbUrl = `postgresql://${dbUser}@localhost:5432/${dbName}?schema=public`;

  console.log(`\n[e2e-setup] Ensuring E2E database '${dbName}' exists...`);

  try {
    const scriptPath = path.resolve(__dirname, '../scripts/ensure-db.sh');
    execSync(`bash "${scriptPath}" "${dbName}"`, {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
  } catch (error) {
    console.error(`[e2e-setup] Failed to setup E2E database:`, error);
    throw error;
  }

  console.log(`[e2e-setup] E2E database '${dbName}' ready\n`);
}
