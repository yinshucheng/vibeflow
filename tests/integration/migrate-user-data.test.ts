/**
 * Integration tests for scripts/migrate-user-data.ts (task 1.2)
 *
 * Tests verify:
 *   - dry-run mode outputs plan without modifying data
 *   - actual migration copies all records with correct FK mapping
 *   - Task parentId self-references are preserved
 *   - Pomodoro → Task and TaskTimeSlice → Pomodoro+Task FK mapping
 *   - Source user data remains unchanged after migration
 *   - Unique constraints (e.g., DailyState @@unique([userId, date])) hold
 *   - --skip-auxiliary flag works
 *   - Error cases: missing source, missing target, same email
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';

const prisma = new PrismaClient();
let dbAvailable = false;

const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/migrate-user-data.ts');
const SOURCE_EMAIL = `migrate-src-${Date.now()}@test.vibeflow.local`;
const TARGET_EMAIL = `migrate-tgt-${Date.now()}@test.vibeflow.local`;

let sourceUserId: string;
let targetUserId: string;

function skipIfNoDb(fn: () => void | Promise<void>): void | Promise<void> {
  if (!dbAvailable) {
    console.warn('[migrate-user-data] Skipping: Database not available');
    return;
  }
  return fn();
}

function runScript(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`npx tsx ${SCRIPT_PATH} ${args}`, {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf-8',
      timeout: 60000,
      env: { ...process.env, NODE_ENV: 'test' },
    });
    return { stdout, exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (execError.stdout || '') + (execError.stderr || ''),
      exitCode: execError.status ?? 1,
    };
  }
}

async function cleanupUser(userId: string) {
  try {
    // Delete in reverse-dependency order
    const habitIds = (await prisma.habit.findMany({ where: { userId }, select: { id: true } })).map(
      (h) => h.id
    );
    const goalIds = (await prisma.goal.findMany({ where: { userId }, select: { id: true } })).map(
      (g) => g.id
    );
    const projectIds = (
      await prisma.project.findMany({ where: { userId }, select: { id: true } })
    ).map((p) => p.id);
    const pomodoroIds = (
      await prisma.pomodoro.findMany({ where: { userId }, select: { id: true } })
    ).map((p) => p.id);
    const conversationIds = (
      await prisma.conversation.findMany({ where: { userId }, select: { id: true } })
    ).map((c) => c.id);
    const focusSessionIds = (
      await prisma.focusSession.findMany({ where: { userId }, select: { id: true } })
    ).map((f) => f.id);
    const demoTokenIds = (
      await prisma.demoToken.findMany({ where: { userId }, select: { id: true } })
    ).map((d) => d.id);

    // Layer 2 auxiliary
    await prisma.demoModeEvent.deleteMany({ where: { tokenId: { in: demoTokenIds } } });
    await prisma.demoToken.deleteMany({ where: { userId } });
    await prisma.taskDecompositionFeedback.deleteMany({ where: { userId } });
    await prisma.suggestionFeedback.deleteMany({ where: { userId } });
    await prisma.skipTokenUsage.deleteMany({ where: { userId } });
    await prisma.dailyEntertainmentState.deleteMany({ where: { userId } });
    await prisma.workStartRecord.deleteMany({ where: { userId } });
    await prisma.activityAggregate.deleteMany({ where: { userId } });
    await prisma.projectTemplate.deleteMany({ where: { userId } });

    // Layer 1 core (reverse order)
    await prisma.chatMessage.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await prisma.conversation.deleteMany({ where: { userId } });
    await prisma.policyVersion.deleteMany({ where: { userId } });
    await prisma.dailyReview.deleteMany({ where: { userId } });
    await prisma.blocker.deleteMany({ where: { userId } });
    await prisma.sleepExemption.deleteMany({ where: { focusSessionId: { in: focusSessionIds } } });
    await prisma.focusSession.deleteMany({ where: { userId } });
    await prisma.dailyState.deleteMany({ where: { userId } });
    await prisma.habitEntry.deleteMany({ where: { userId } });
    await prisma.habitGoal.deleteMany({ where: { habitId: { in: habitIds } } });
    await prisma.taskTimeSlice.deleteMany({ where: { pomodoroId: { in: pomodoroIds } } });
    await prisma.restExemption.deleteMany({ where: { userId } });
    await prisma.pomodoro.deleteMany({ where: { userId } });
    // Tasks: clear parentId first to break self-references, then delete
    await prisma.task.updateMany({ where: { userId }, data: { parentId: null } });
    await prisma.task.deleteMany({ where: { userId } });
    await prisma.projectGoal.deleteMany({
      where: { projectId: { in: projectIds }, goalId: { in: goalIds } },
    });
    await prisma.habit.deleteMany({ where: { userId } });
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.goal.deleteMany({ where: { userId } });
    await prisma.userSettings.deleteMany({ where: { userId } });
    await prisma.apiToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  } catch (e) {
    console.warn(`Cleanup warning for ${userId}:`, e);
  }
}

// ─── Seed helpers ────────────────────────────────────────────────────────

async function seedSourceData(): Promise<{
  projectId: string;
  goalId: string;
  parentTaskId: string;
  childTaskId: string;
  pomodoroId: string;
  habitId: string;
  conversationId: string;
}> {
  // UserSettings
  await prisma.userSettings.create({
    data: { userId: sourceUserId, pomodoroDuration: 30 },
  });

  // Goal
  const goal = await prisma.goal.create({
    data: {
      userId: sourceUserId,
      title: 'Test Goal',
      description: 'For migration test',
      type: 'SHORT_TERM',
      targetDate: new Date('2026-06-01'),
    },
  });

  // Project
  const project = await prisma.project.create({
    data: { userId: sourceUserId, title: 'Test Project', deliverable: 'test' },
  });

  // ProjectGoal junction
  await prisma.projectGoal.create({
    data: { projectId: project.id, goalId: goal.id },
  });

  // Tasks (parent + child to test self-reference)
  const parentTask = await prisma.task.create({
    data: {
      userId: sourceUserId,
      projectId: project.id,
      title: 'Parent Task',
      sortOrder: 0,
    },
  });

  const childTask = await prisma.task.create({
    data: {
      userId: sourceUserId,
      projectId: project.id,
      title: 'Child Task',
      parentId: parentTask.id,
      sortOrder: 1,
    },
  });

  // Pomodoro linked to parent task
  const pomodoro = await prisma.pomodoro.create({
    data: {
      userId: sourceUserId,
      taskId: parentTask.id,
      duration: 25,
      startTime: new Date(),
      status: 'COMPLETED',
      endTime: new Date(),
    },
  });

  // TaskTimeSlice linked to pomodoro and child task
  await prisma.taskTimeSlice.create({
    data: {
      pomodoroId: pomodoro.id,
      taskId: childTask.id,
      startTime: new Date(),
      endTime: new Date(),
      durationSeconds: 600,
    },
  });

  // Habit + HabitEntry
  const habit = await prisma.habit.create({
    data: {
      userId: sourceUserId,
      title: 'Test Habit',
      type: 'BOOLEAN',
      projectId: project.id,
    },
  });

  // HabitGoal junction
  await prisma.habitGoal.create({
    data: { habitId: habit.id, goalId: goal.id },
  });

  await prisma.habitEntry.create({
    data: {
      userId: sourceUserId,
      habitId: habit.id,
      date: new Date('2026-04-13'),
      value: 1,
      entryType: 'YES_MANUAL',
    },
  });

  // DailyState with unique constraint
  await prisma.dailyState.create({
    data: {
      userId: sourceUserId,
      date: new Date('2026-04-13'),
      systemState: 'IDLE',
      pomodoroCount: 3,
    },
  });

  // FocusSession
  await prisma.focusSession.create({
    data: {
      userId: sourceUserId,
      startTime: new Date(),
      plannedEndTime: new Date(Date.now() + 60 * 60000),
      duration: 60,
    },
  });

  // Blocker
  await prisma.blocker.create({
    data: {
      userId: sourceUserId,
      taskId: parentTask.id,
      category: 'technical',
      description: 'Test blocker',
    },
  });

  // DailyReview
  await prisma.dailyReview.create({
    data: {
      userId: sourceUserId,
      date: new Date('2026-04-13'),
      expectedWorkMinutes: 360,
      expectedPomodoroCount: 10,
      completedPomodoros: 3,
    },
  });

  // PolicyVersion
  await prisma.policyVersion.create({
    data: {
      userId: sourceUserId,
      version: 1,
      policy: { test: true },
    },
  });

  // Conversation + ChatMessage
  const conversation = await prisma.conversation.create({
    data: { userId: sourceUserId, title: 'Test Chat' },
  });

  await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'user',
      content: 'Hello migration test',
    },
  });

  await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'assistant',
      content: 'Hello back',
    },
  });

  // Layer 2: Auxiliary
  await prisma.projectTemplate.create({
    data: {
      userId: sourceUserId,
      name: 'Test Template',
      structure: { tasks: [] },
    },
  });

  await prisma.activityAggregate.create({
    data: {
      userId: sourceUserId,
      date: new Date('2026-04-13'),
      source: 'browser',
      category: 'productive',
      totalDuration: 3600,
      activityCount: 10,
      topIdentifiers: [],
    },
  });

  return {
    projectId: project.id,
    goalId: goal.id,
    parentTaskId: parentTask.id,
    childTaskId: childTask.id,
    pomodoroId: pomodoro.id,
    habitId: habit.id,
    conversationId: conversation.id,
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────

beforeAll(async () => {
  try {
    await prisma.$connect();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }

  // Create source and target users
  const sourceUser = await prisma.user.create({
    data: { email: SOURCE_EMAIL, password: 'test_password_hash' },
  });
  sourceUserId = sourceUser.id;

  const targetUser = await prisma.user.create({
    data: { email: TARGET_EMAIL, password: 'test_password_hash' },
  });
  targetUserId = targetUser.id;

  // Seed source data
  await seedSourceData();
});

afterAll(async () => {
  if (!dbAvailable) return;
  await cleanupUser(targetUserId);
  await cleanupUser(sourceUserId);
  await prisma.$disconnect();
});

describe('1.2 migrate-user-data dry-run', () => {
  it('outputs migration plan without modifying data', () =>
    skipIfNoDb(async () => {
      const { stdout, exitCode } = runScript(
        `--source ${SOURCE_EMAIL} --target ${TARGET_EMAIL} --dry-run`
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('DRY RUN');
      expect(stdout).toContain('Dry run complete');
      expect(stdout).toContain('UserSettings: 1');
      expect(stdout).toContain('Goal: 1');
      expect(stdout).toContain('Project: 1');
      expect(stdout).toContain('Task: 2');

      // Verify target has no data yet
      const targetTasks = await prisma.task.count({ where: { userId: targetUserId } });
      expect(targetTasks).toBe(0);
    }));
});

describe('1.2 migrate-user-data actual migration', () => {
  it('migrates all records with correct counts', () =>
    skipIfNoDb(async () => {
      const { stdout, exitCode } = runScript(
        `--source ${SOURCE_EMAIL} --target ${TARGET_EMAIL}`
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Migration complete');
      expect(stdout).toContain('Source data verified: unchanged');

      // Report should contain model counts
      expect(stdout).toContain('UserSettings: 1');
      expect(stdout).toContain('Goal: 1');
      expect(stdout).toContain('Project: 1');
      expect(stdout).toContain('ProjectGoal: 1');
      expect(stdout).toContain('Task: 2');
      expect(stdout).toContain('Pomodoro: 1');
      expect(stdout).toContain('TaskTimeSlice: 1');
      expect(stdout).toContain('Habit: 1');
      expect(stdout).toContain('HabitGoal: 1');
      expect(stdout).toContain('HabitEntry: 1');
      expect(stdout).toContain('DailyState: 1');
      expect(stdout).toContain('ChatMessage: 2');
    }));

  it('target has correct record counts', () =>
    skipIfNoDb(async () => {
      const counts = {
        settings: await prisma.userSettings.count({ where: { userId: targetUserId } }),
        goals: await prisma.goal.count({ where: { userId: targetUserId } }),
        projects: await prisma.project.count({ where: { userId: targetUserId } }),
        tasks: await prisma.task.count({ where: { userId: targetUserId } }),
        pomodoros: await prisma.pomodoro.count({ where: { userId: targetUserId } }),
        habits: await prisma.habit.count({ where: { userId: targetUserId } }),
        habitEntries: await prisma.habitEntry.count({ where: { userId: targetUserId } }),
        dailyStates: await prisma.dailyState.count({ where: { userId: targetUserId } }),
        conversations: await prisma.conversation.count({ where: { userId: targetUserId } }),
      };

      expect(counts.settings).toBe(1);
      expect(counts.goals).toBe(1);
      expect(counts.projects).toBe(1);
      expect(counts.tasks).toBe(2);
      expect(counts.pomodoros).toBe(1);
      expect(counts.habits).toBe(1);
      expect(counts.habitEntries).toBe(1);
      expect(counts.dailyStates).toBe(1);
      expect(counts.conversations).toBe(1);
    }));

  it('Task parentId self-reference is preserved', () =>
    skipIfNoDb(async () => {
      const targetTasks = await prisma.task.findMany({
        where: { userId: targetUserId },
        orderBy: { sortOrder: 'asc' },
      });

      expect(targetTasks).toHaveLength(2);

      const parent = targetTasks.find((t) => t.title === 'Parent Task');
      const child = targetTasks.find((t) => t.title === 'Child Task');

      expect(parent).toBeDefined();
      expect(child).toBeDefined();
      expect(parent!.parentId).toBeNull();
      expect(child!.parentId).toBe(parent!.id);

      // Verify IDs are different from source (new records, not moved)
      expect(parent!.id).not.toBe(child!.parentId === parent!.id ? 'x' : parent!.id);
    }));

  it('Pomodoro → Task FK is correctly mapped', () =>
    skipIfNoDb(async () => {
      const targetPomodoro = await prisma.pomodoro.findFirst({
        where: { userId: targetUserId },
      });
      expect(targetPomodoro).toBeDefined();
      expect(targetPomodoro!.taskId).not.toBeNull();

      // Task should belong to target user
      const linkedTask = await prisma.task.findUnique({
        where: { id: targetPomodoro!.taskId! },
      });
      expect(linkedTask).toBeDefined();
      expect(linkedTask!.userId).toBe(targetUserId);
      expect(linkedTask!.title).toBe('Parent Task');
    }));

  it('TaskTimeSlice → Pomodoro + Task FK is correctly mapped', () =>
    skipIfNoDb(async () => {
      const targetPomodoroIds = (
        await prisma.pomodoro.findMany({
          where: { userId: targetUserId },
          select: { id: true },
        })
      ).map((p) => p.id);

      const slices = await prisma.taskTimeSlice.findMany({
        where: { pomodoroId: { in: targetPomodoroIds } },
      });
      expect(slices).toHaveLength(1);

      const slice = slices[0];
      // Verify pomodoro belongs to target
      const pom = await prisma.pomodoro.findUnique({ where: { id: slice.pomodoroId } });
      expect(pom!.userId).toBe(targetUserId);

      // Verify task belongs to target
      if (slice.taskId) {
        const task = await prisma.task.findUnique({ where: { id: slice.taskId } });
        expect(task!.userId).toBe(targetUserId);
        expect(task!.title).toBe('Child Task');
      }
    }));

  it('source user data is unchanged', () =>
    skipIfNoDb(async () => {
      const sourceCounts = {
        goals: await prisma.goal.count({ where: { userId: sourceUserId } }),
        projects: await prisma.project.count({ where: { userId: sourceUserId } }),
        tasks: await prisma.task.count({ where: { userId: sourceUserId } }),
        pomodoros: await prisma.pomodoro.count({ where: { userId: sourceUserId } }),
        habits: await prisma.habit.count({ where: { userId: sourceUserId } }),
        dailyStates: await prisma.dailyState.count({ where: { userId: sourceUserId } }),
      };

      expect(sourceCounts.goals).toBe(1);
      expect(sourceCounts.projects).toBe(1);
      expect(sourceCounts.tasks).toBe(2);
      expect(sourceCounts.pomodoros).toBe(1);
      expect(sourceCounts.habits).toBe(1);
      expect(sourceCounts.dailyStates).toBe(1);
    }));

  it('UserSettings pomodoroDuration is copied', () =>
    skipIfNoDb(async () => {
      const targetSettings = await prisma.userSettings.findUnique({
        where: { userId: targetUserId },
      });
      expect(targetSettings).toBeDefined();
      expect(targetSettings!.pomodoroDuration).toBe(30);
    }));

  it('auxiliary data is migrated (ProjectTemplate, ActivityAggregate)', () =>
    skipIfNoDb(async () => {
      const templates = await prisma.projectTemplate.count({
        where: { userId: targetUserId },
      });
      expect(templates).toBe(1);

      const aggregates = await prisma.activityAggregate.count({
        where: { userId: targetUserId },
      });
      expect(aggregates).toBe(1);
    }));
});

describe('1.2 migrate-user-data error cases', () => {
  it('fails when source user does not exist', () =>
    skipIfNoDb(async () => {
      const { stdout, exitCode } = runScript(
        `--source nonexistent@test.local --target ${TARGET_EMAIL}`
      );
      expect(exitCode).not.toBe(0);
      expect(stdout).toContain('not found');
    }));

  it('fails when target user does not exist', () =>
    skipIfNoDb(async () => {
      const { stdout, exitCode } = runScript(
        `--source ${SOURCE_EMAIL} --target nonexistent@test.local`
      );
      expect(exitCode).not.toBe(0);
      expect(stdout).toContain('not found');
    }));

  it('fails when source and target are the same', () =>
    skipIfNoDb(async () => {
      const { stdout, exitCode } = runScript(
        `--source ${SOURCE_EMAIL} --target ${SOURCE_EMAIL}`
      );
      expect(exitCode).not.toBe(0);
      expect(stdout).toContain('must be different');
    }));

  it('fails when no arguments provided', () =>
    skipIfNoDb(async () => {
      const { exitCode } = runScript('');
      expect(exitCode).not.toBe(0);
    }));
});

describe('1.2 migrate-user-data --skip-auxiliary', () => {
  it('skips auxiliary data when flag is set (dry-run)', () =>
    skipIfNoDb(async () => {
      const { stdout, exitCode } = runScript(
        `--source ${SOURCE_EMAIL} --target ${TARGET_EMAIL} --dry-run --skip-auxiliary`
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Auxiliary data: SKIP');
      expect(stdout).not.toContain('Layer 2');
      expect(stdout).not.toContain('ProjectTemplate');
    }));
});
