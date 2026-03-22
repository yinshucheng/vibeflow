/**
 * Migrate dev account to production-ready credentials.
 *
 * Usage:
 *   npx tsx scripts/migrate-dev-account.ts --password <new-password> [--email <new-email>]
 *
 * - Finds the `dev@vibeflow.local` account
 * - Updates password (bcrypt hash) and optionally email
 * - Prints data integrity counts for verification
 * - Idempotent: re-running overwrites password only, never creates duplicates
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEV_EMAIL = 'dev@vibeflow.local';

function parseArgs(argv: string[]): { password: string; email?: string } {
  let password: string | undefined;
  let email: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--password' && argv[i + 1]) {
      password = argv[i + 1];
      i++;
    } else if (argv[i] === '--email' && argv[i + 1]) {
      email = argv[i + 1];
      i++;
    }
  }

  if (!password) {
    console.error('Usage: npx tsx scripts/migrate-dev-account.ts --password <new-password> [--email <new-email>]');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Error: password must be at least 8 characters');
    process.exit(1);
  }

  return { password, email };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // 1. Find existing dev account
  const user = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
  if (!user) {
    console.log(`Account ${DEV_EMAIL} not found, nothing to migrate.`);
    return;
  }

  console.log(`Found account: ${user.email} (id: ${user.id})`);

  // 2. Hash new password and update
  const hashedPassword = await bcrypt.hash(args.password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      ...(args.email ? { email: args.email } : {}),
    },
  });

  // 3. Verify
  const updated = await prisma.user.findUnique({ where: { id: user.id } });
  if (!updated) {
    console.error('Error: failed to verify updated account');
    process.exit(1);
  }
  console.log(`Migrated: ${DEV_EMAIL} → ${updated.email}, password set`);

  // 4. Data integrity check
  const counts = {
    projects: await prisma.project.count({ where: { userId: user.id } }),
    tasks: await prisma.task.count({ where: { userId: user.id } }),
    pomodoros: await prisma.pomodoro.count({ where: { userId: user.id } }),
    goals: await prisma.goal.count({ where: { userId: user.id } }),
    dailyStates: await prisma.dailyState.count({ where: { userId: user.id } }),
  };
  console.log('Data integrity check:', counts);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
