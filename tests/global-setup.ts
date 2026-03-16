/**
 * Vitest Global Setup — ensures vibeflow_test database exists and schema is synced.
 * Runs once before all test suites.
 */
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

export default function globalSetup() {
  const dbName = 'vibeflow_test';
  const dbUser = os.userInfo().username;
  const dbUrl = `postgresql://${dbUser}@localhost:5432/${dbName}?schema=public`;

  // Set for all test processes (Prisma reads this at client init)
  process.env.DATABASE_URL = dbUrl;

  console.log(`\n[test-setup] Ensuring test database '${dbName}' exists...`);

  try {
    const scriptPath = path.resolve(__dirname, '../scripts/ensure-db.sh');
    execSync(`bash "${scriptPath}" "${dbName}"`, {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
  } catch (error) {
    console.error(`[test-setup] Failed to setup test database:`, error);
    throw error;
  }

  console.log(`[test-setup] Test database '${dbName}' ready (URL: ${dbUrl})\n`);
}
