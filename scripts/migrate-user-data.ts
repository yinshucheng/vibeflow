/**
 * Migrate user data from one account to another.
 *
 * Copies all user-associated data from a source user to a target user,
 * preserving source data untouched. Uses Prisma interactive transaction
 * for atomicity — either all data migrates or nothing changes.
 *
 * Usage:
 *   npx tsx scripts/migrate-user-data.ts --source dev@vibeflow.local --target my@email.com --dry-run
 *   npx tsx scripts/migrate-user-data.ts --source dev@vibeflow.local --target my@email.com
 *   npx tsx scripts/migrate-user-data.ts --source dev@vibeflow.local --target my@email.com --skip-auxiliary
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Prisma's JsonValue (from findMany reads) is not directly assignable to InputJsonValue
// (for create writes). Since we copy data within the same schema, the cast is safe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createData<T extends Record<string, unknown>>(data: T, overrides: Record<string, unknown>): any {
  return { ...data, ...overrides };
}

// ─── Types ───────────────────────────────────────────────────────────────

interface MigrateOptions {
  sourceEmail: string;
  targetEmail: string;
  dryRun: boolean;
  skipAuxiliary: boolean;
}

interface MigrationReport {
  model: string;
  count: number;
}

// ─── Model Lists ─────────────────────────────────────────────────────────

// Layer 1: Core business data (must migrate, dependency order matters)
const MIGRATE_CORE = [
  'UserSettings',
  'Goal',
  'Project',
  'ProjectGoal',
  'Task',
  'Pomodoro',
  'TaskTimeSlice',
  'Habit',
  'HabitGoal',
  'HabitEntry',
  'DailyState',
  'FocusSession',
  'Blocker',
  'DailyReview',
  'PolicyVersion',
  'Conversation',
  'ChatMessage',
] as const;

// Layer 2: Auxiliary data (recommended, loss recoverable)
const MIGRATE_AUXILIARY = [
  'ProjectTemplate',
  'ActivityAggregate',
  'WorkStartRecord',
  'DailyEntertainmentState',
  'SkipTokenUsage',
  'SuggestionFeedback',
  'TaskDecompositionFeedback',
  'DemoToken',
] as const;

// Layer 3: Log/transient data (skip by default)
// ActivityLog, TimelineEvent, StateTransitionLog, SettingsModificationLog,
// MCPAuditLog, MCPEvent, MCPSubscription, DataAccessLog, ClientRegistry,
// ClientConnection, ClientOfflineEvent, CommandQueue, BypassAttempt,
// DemoModeEvent, LLMUsageLog, RestExemption, SleepExemption,
// ScreenTimeExemption, ApiToken

// ─── CLI Parsing ─────────────────────────────────────────────────────────

function parseArgs(argv: string[]): MigrateOptions {
  let sourceEmail: string | undefined;
  let targetEmail: string | undefined;
  let dryRun = false;
  let skipAuxiliary = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source' && argv[i + 1]) {
      sourceEmail = argv[i + 1];
      i++;
    } else if (argv[i] === '--target' && argv[i + 1]) {
      targetEmail = argv[i + 1];
      i++;
    } else if (argv[i] === '--dry-run') {
      dryRun = true;
    } else if (argv[i] === '--skip-auxiliary') {
      skipAuxiliary = true;
    }
  }

  if (!sourceEmail || !targetEmail) {
    console.error(
      'Usage: npx tsx scripts/migrate-user-data.ts --source <email> --target <email> [--dry-run] [--skip-auxiliary]'
    );
    process.exit(1);
  }

  if (sourceEmail === targetEmail) {
    console.error('Error: source and target emails must be different');
    process.exit(1);
  }

  return { sourceEmail, targetEmail, dryRun, skipAuxiliary };
}

// ─── Migration Logic ─────────────────────────────────────────────────────

async function migrate(options: MigrateOptions): Promise<void> {
  const { sourceEmail, targetEmail, dryRun, skipAuxiliary } = options;

  // 1. Resolve users
  const sourceUser = await prisma.user.findUnique({ where: { email: sourceEmail } });
  if (!sourceUser) {
    console.error(`Error: source user '${sourceEmail}' not found`);
    process.exit(1);
  }

  const targetUser = await prisma.user.findUnique({ where: { email: targetEmail } });
  if (!targetUser) {
    console.error(`Error: target user '${targetEmail}' not found. Please register first.`);
    process.exit(1);
  }

  console.log(`Source: ${sourceUser.email} (${sourceUser.id})`);
  console.log(`Target: ${targetUser.email} (${targetUser.id})`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Auxiliary data: ${skipAuxiliary ? 'SKIP' : 'INCLUDE'}`);
  console.log('');

  const sourceId = sourceUser.id;
  const targetId = targetUser.id;

  // 2. Count source data
  const coreCounts = await countCoreData(sourceId);
  const auxCounts = skipAuxiliary ? [] : await countAuxiliaryData(sourceId);

  console.log('=== Migration Plan ===');
  console.log('');
  console.log('Layer 1 — Core Data:');
  for (const { model, count } of coreCounts) {
    console.log(`  ${model}: ${count} records`);
  }
  if (!skipAuxiliary) {
    console.log('');
    console.log('Layer 2 — Auxiliary Data:');
    for (const { model, count } of auxCounts) {
      console.log(`  ${model}: ${count} records`);
    }
  }

  const totalCore = coreCounts.reduce((sum, r) => sum + r.count, 0);
  const totalAux = auxCounts.reduce((sum, r) => sum + r.count, 0);
  console.log('');
  console.log(`Total: ${totalCore + totalAux} records (core: ${totalCore}, auxiliary: ${totalAux})`);

  if (dryRun) {
    console.log('');
    console.log('Dry run complete. No data was modified.');
    return;
  }

  // 3. Execute migration in a transaction
  console.log('');
  console.log('Starting migration...');

  const report = await prisma.$transaction(
    async (tx) => {
      const idMap = new Map<string, string>(); // oldId -> newId
      const migrationReport: MigrationReport[] = [];

      // --- Layer 1: Core ---
      await migrateUserSettings(tx, sourceId, targetId, migrationReport);
      await migrateGoals(tx, sourceId, targetId, idMap, migrationReport);
      await migrateProjects(tx, sourceId, targetId, idMap, migrationReport);
      await migrateProjectGoals(tx, sourceId, idMap, migrationReport);
      await migrateTasks(tx, sourceId, targetId, idMap, migrationReport);
      await migratePomodoros(tx, sourceId, targetId, idMap, migrationReport);
      await migrateTaskTimeSlices(tx, sourceId, idMap, migrationReport);
      await migrateHabits(tx, sourceId, targetId, idMap, migrationReport);
      await migrateHabitGoals(tx, sourceId, idMap, migrationReport);
      await migrateHabitEntries(tx, sourceId, targetId, idMap, migrationReport);
      await migrateDailyStates(tx, sourceId, targetId, migrationReport);
      await migrateFocusSessions(tx, sourceId, targetId, idMap, migrationReport);
      await migrateBlockers(tx, sourceId, targetId, idMap, migrationReport);
      await migrateDailyReviews(tx, sourceId, targetId, migrationReport);
      await migratePolicyVersions(tx, sourceId, targetId, migrationReport);
      await migrateConversations(tx, sourceId, targetId, idMap, migrationReport);
      await migrateChatMessages(tx, sourceId, idMap, migrationReport);

      // --- Layer 2: Auxiliary (if not skipped) ---
      if (!skipAuxiliary) {
        await migrateProjectTemplates(tx, sourceId, targetId, migrationReport);
        await migrateActivityAggregates(tx, sourceId, targetId, migrationReport);
        await migrateWorkStartRecords(tx, sourceId, targetId, migrationReport);
        await migrateDailyEntertainmentStates(tx, sourceId, targetId, migrationReport);
        await migrateSkipTokenUsages(tx, sourceId, targetId, migrationReport);
        await migrateSuggestionFeedbacks(tx, sourceId, targetId, migrationReport);
        await migrateTaskDecompositionFeedbacks(tx, sourceId, targetId, idMap, migrationReport);
        await migrateDemoTokens(tx, sourceId, targetId, migrationReport);
      }

      return migrationReport;
    },
    { timeout: 120000 }
  );

  // 4. Print report
  console.log('');
  console.log('=== Migration Report ===');
  for (const { model, count } of report) {
    console.log(`  ${model}: ${count} records migrated`);
  }
  const totalMigrated = report.reduce((sum, r) => sum + r.count, 0);
  console.log(`  Total: ${totalMigrated} records migrated`);

  // 5. Verify source data unchanged
  console.log('');
  console.log('Verifying source data unchanged...');
  const postCoreCounts = await countCoreData(sourceId);
  let sourceOk = true;
  for (let i = 0; i < coreCounts.length; i++) {
    if (coreCounts[i].count !== postCoreCounts[i].count) {
      console.error(
        `  WARNING: ${coreCounts[i].model} changed: ${coreCounts[i].count} → ${postCoreCounts[i].count}`
      );
      sourceOk = false;
    }
  }
  if (sourceOk) {
    console.log('  Source data verified: unchanged.');
  }

  console.log('');
  console.log('Migration complete!');
}

// ─── Counting ────────────────────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function countCoreData(userId: string): Promise<MigrationReport[]> {
  const [
    userSettings,
    goals,
    projects,
    tasks,
    pomodoros,
    habits,
    habitEntries,
    dailyStates,
    focusSessions,
    blockers,
    dailyReviews,
    policyVersions,
    conversations,
  ] = await Promise.all([
    prisma.userSettings.count({ where: { userId } }),
    prisma.goal.count({ where: { userId } }),
    prisma.project.count({ where: { userId } }),
    prisma.task.count({ where: { userId } }),
    prisma.pomodoro.count({ where: { userId } }),
    prisma.habit.count({ where: { userId } }),
    prisma.habitEntry.count({ where: { userId } }),
    prisma.dailyState.count({ where: { userId } }),
    prisma.focusSession.count({ where: { userId } }),
    prisma.blocker.count({ where: { userId } }),
    prisma.dailyReview.count({ where: { userId } }),
    prisma.policyVersion.count({ where: { userId } }),
    prisma.conversation.count({ where: { userId } }),
  ]);

  // Junction/child tables counted via parent
  const projectIds = (await prisma.project.findMany({ where: { userId }, select: { id: true } })).map(
    (p) => p.id
  );
  const goalIds = (await prisma.goal.findMany({ where: { userId }, select: { id: true } })).map(
    (g) => g.id
  );
  const pomodoroIds = (
    await prisma.pomodoro.findMany({ where: { userId }, select: { id: true } })
  ).map((p) => p.id);
  const habitIds = (await prisma.habit.findMany({ where: { userId }, select: { id: true } })).map(
    (h) => h.id
  );
  const conversationIds = (
    await prisma.conversation.findMany({ where: { userId }, select: { id: true } })
  ).map((c) => c.id);

  const [projectGoals, taskTimeSlices, habitGoals, chatMessages] = await Promise.all([
    prisma.projectGoal.count({
      where: { projectId: { in: projectIds }, goalId: { in: goalIds } },
    }),
    prisma.taskTimeSlice.count({ where: { pomodoroId: { in: pomodoroIds } } }),
    prisma.habitGoal.count({ where: { habitId: { in: habitIds }, goalId: { in: goalIds } } }),
    prisma.chatMessage.count({ where: { conversationId: { in: conversationIds } } }),
  ]);

  return [
    { model: 'UserSettings', count: userSettings },
    { model: 'Goal', count: goals },
    { model: 'Project', count: projects },
    { model: 'ProjectGoal', count: projectGoals },
    { model: 'Task', count: tasks },
    { model: 'Pomodoro', count: pomodoros },
    { model: 'TaskTimeSlice', count: taskTimeSlices },
    { model: 'Habit', count: habits },
    { model: 'HabitGoal', count: habitGoals },
    { model: 'HabitEntry', count: habitEntries },
    { model: 'DailyState', count: dailyStates },
    { model: 'FocusSession', count: focusSessions },
    { model: 'Blocker', count: blockers },
    { model: 'DailyReview', count: dailyReviews },
    { model: 'PolicyVersion', count: policyVersions },
    { model: 'Conversation', count: conversations },
    { model: 'ChatMessage', count: chatMessages },
  ];
}

async function countAuxiliaryData(userId: string): Promise<MigrationReport[]> {
  const [
    projectTemplates,
    activityAggregates,
    workStartRecords,
    dailyEntertainmentStates,
    skipTokenUsages,
    suggestionFeedbacks,
    taskDecompositionFeedbacks,
    demoTokens,
  ] = await Promise.all([
    prisma.projectTemplate.count({ where: { userId } }),
    prisma.activityAggregate.count({ where: { userId } }),
    prisma.workStartRecord.count({ where: { userId } }),
    prisma.dailyEntertainmentState.count({ where: { userId } }),
    prisma.skipTokenUsage.count({ where: { userId } }),
    prisma.suggestionFeedback.count({ where: { userId } }),
    prisma.taskDecompositionFeedback.count({ where: { userId } }),
    prisma.demoToken.count({ where: { userId } }),
  ]);

  return [
    { model: 'ProjectTemplate', count: projectTemplates },
    { model: 'ActivityAggregate', count: activityAggregates },
    { model: 'WorkStartRecord', count: workStartRecords },
    { model: 'DailyEntertainmentState', count: dailyEntertainmentStates },
    { model: 'SkipTokenUsage', count: skipTokenUsages },
    { model: 'SuggestionFeedback', count: suggestionFeedbacks },
    { model: 'TaskDecompositionFeedback', count: taskDecompositionFeedbacks },
    { model: 'DemoToken', count: demoTokens },
  ];
}

// ─── Migration Functions (Layer 1 — Core) ────────────────────────────────

async function migrateUserSettings(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  report: MigrationReport[]
): Promise<void> {
  const settings = await tx.userSettings.findUnique({ where: { userId: sourceId } });
  if (!settings) {
    report.push({ model: 'UserSettings', count: 0 });
    return;
  }

  // Delete target's existing settings (created on user registration) to avoid conflict
  await tx.userSettings.deleteMany({ where: { userId: targetId } });

  const { id: _id, userId: _userId, ...data } = settings;
  await tx.userSettings.create({
    data: createData(data, { userId: targetId }),
  });
  report.push({ model: 'UserSettings', count: 1 });
  console.log('  UserSettings: 1');
}

async function migrateGoals(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  idMap: Map<string, string>,
  report: MigrationReport[]
): Promise<void> {
  const goals = await tx.goal.findMany({ where: { userId: sourceId } });
  for (const goal of goals) {
    const { id: oldId, userId: _userId, ...data } = goal;
    const newGoal = await tx.goal.create({
      data: createData(data, { userId: targetId }),
    });
    idMap.set(oldId, newGoal.id);
  }
  report.push({ model: 'Goal', count: goals.length });
  console.log(`  Goal: ${goals.length}`);
}

async function migrateProjects(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  idMap: Map<string, string>,
  report: MigrationReport[]
): Promise<void> {
  const projects = await tx.project.findMany({ where: { userId: sourceId } });
  for (const project of projects) {
    const { id: oldId, userId: _userId, ...data } = project;
    const newProject = await tx.project.create({
      data: createData(data, { userId: targetId }),
    });
    idMap.set(oldId, newProject.id);
  }
  report.push({ model: 'Project', count: projects.length });
  console.log(`  Project: ${projects.length}`);
}

async function migrateProjectGoals(
  tx: TxClient,
  sourceId: string,
  idMap: Map<string, string>,
  report: MigrationReport[]
): Promise<void> {
  // Get source user's project & goal IDs
  const sourceProjectIds = (
    await tx.project.findMany({ where: { userId: sourceId }, select: { id: true } })
  ).map((p) => p.id);
  const sourceGoalIds = (
    await tx.goal.findMany({ where: { userId: sourceId }, select: { id: true } })
  ).map((g) => g.id);

  const projectGoals = await tx.projectGoal.findMany({
    where: { projectId: { in: sourceProjectIds }, goalId: { in: sourceGoalIds } },
  });

  for (const pg of projectGoals) {
    const newProjectId = idMap.get(pg.projectId);
    const newGoalId = idMap.get(pg.goalId);
    if (!newProjectId || !newGoalId) continue;
    await tx.projectGoal.create({
      data: { projectId: newProjectId, goalId: newGoalId },
    });
  }
  report.push({ model: 'ProjectGoal', count: projectGoals.length });
  console.log(`  ProjectGoal: ${projectGoals.length}`);
}

async function migrateTasks(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  idMap: Map<string, string>,
  report: MigrationReport[]
): Promise<void> {
  const tasks = await tx.task.findMany({ where: { userId: sourceId } });

  // Phase 1: Insert all tasks with parentId = null
  for (const task of tasks) {
    const { id: oldId, userId: _userId, parentId: _parentId, projectId, ...data } = task;
    const newProjectId = idMap.get(projectId);
    if (!newProjectId) {
      throw new Error(`Task '${task.title}' references unmapped project ${projectId}`);
    }
    const newTask = await tx.task.create({
      data: createData(data, { projectId: newProjectId, parentId: null, userId: targetId }),
    });
    idMap.set(oldId, newTask.id);
  }

  // Phase 2: Update parentId for tasks that had one
  const tasksWithParent = tasks.filter((t) => t.parentId !== null);
  for (const task of tasksWithParent) {
    const newTaskId = idMap.get(task.id);
    const newParentId = idMap.get(task.parentId!);
    if (newTaskId && newParentId) {
      await tx.task.update({
        where: { id: newTaskId },
        data: { parentId: newParentId },
      });
    }
  }

  report.push({ model: 'Task', count: tasks.length });
  console.log(`  Task: ${tasks.length} (${tasksWithParent.length} with parent)`);
}

async function migratePomodoros(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  idMap: Map<string, string>,
  report: MigrationReport[]
): Promise<void> {
  const pomodoros = await tx.pomodoro.findMany({ where: { userId: sourceId } });
  for (const pom of pomodoros) {
    const { id: oldId, userId: _userId, taskId, ...data } = pom;
    const newTaskId = taskId ? idMap.get(taskId) ?? null : null;
    const newPom = await tx.pomodoro.create({
      data: createData(data, { taskId: newTaskId, userId: targetId }),
    });
    idMap.set(oldId, newPom.id);
  }
  report.push({ model: 'Pomodoro', count: pomodoros.length });
  console.log(`  Pomodoro: ${pomodoros.length}`);
}

async function migrateTaskTimeSlices(
  tx: TxClient,
  sourceId: string,
  idMap: Map<string, string>,
  report: MigrationReport[]
): Promise<void> {
  // Get source pomodoro IDs
  const sourcePomodoroIds = (
    await tx.pomodoro.findMany({ where: { userId: sourceId }, select: { id: true } })
  ).map((p) => p.id);

  const slices = await tx.taskTimeSlice.findMany({
    where: { pomodoroId: { in: sourcePomodoroIds } },
  });

  for (const slice of slices) {
    const { id: _id, pomodoroId, taskId, ...data } = slice;
    const newPomodoroId = idMap.get(pomodoroId);
    if (!newPomodoroId) continue;
    const newTaskId = taskId ? idMap.get(taskId) ?? null : null;
    await tx.taskTimeSlice.create({
      data: createData(data, { pomodoroId: newPomodoroId, taskId: newTaskId }),
    });
  }
  report.push({ model: 'TaskTimeSlice', count: slices.length });
  console.log(`  TaskTimeSlice: ${slices.length}`);
}

async function migrateHabits(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  idMap: Map<string, string>,
  report: MigrationReport[]
): Promise<void> {
  const habits = await tx.habit.findMany({ where: { userId: sourceId } });
  for (const habit of habits) {
    const { id: oldId, userId: _userId, projectId, ...data } = habit;
    const newProjectId = projectId ? idMap.get(projectId) ?? null : null;
    const newHabit = await tx.habit.create({
      data: createData(data, { projectId: newProjectId, userId: targetId }),
    });
    idMap.set(oldId, newHabit.id);
  }
  report.push({ model: 'Habit', count: habits.length });
  console.log(`  Habit: ${habits.length}`);
}

async function migrateHabitGoals(
  tx: TxClient,
  sourceId: string,
  idMap: Map<string, string>,
  report: MigrationReport[]
): Promise<void> {
  const sourceHabitIds = (
    await tx.habit.findMany({ where: { userId: sourceId }, select: { id: true } })
  ).map((h) => h.id);
  const sourceGoalIds = (
    await tx.goal.findMany({ where: { userId: sourceId }, select: { id: true } })
  ).map((g) => g.id);

  const habitGoals = await tx.habitGoal.findMany({
    where: { habitId: { in: sourceHabitIds }, goalId: { in: sourceGoalIds } },
  });

  for (const hg of habitGoals) {
    const newHabitId = idMap.get(hg.habitId);
    const newGoalId = idMap.get(hg.goalId);
    if (!newHabitId || !newGoalId) continue;
    await tx.habitGoal.create({
      data: { habitId: newHabitId, goalId: newGoalId },
    });
  }
  report.push({ model: 'HabitGoal', count: habitGoals.length });
  console.log(`  HabitGoal: ${habitGoals.length}`);
}

async function migrateHabitEntries(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  idMap: Map<string, string>,
  report: MigrationReport[]
): Promise<void> {
  const entries = await tx.habitEntry.findMany({ where: { userId: sourceId } });
  for (const entry of entries) {
    const { id: _id, userId: _userId, habitId, ...data } = entry;
    const newHabitId = idMap.get(habitId);
    if (!newHabitId) continue;
    await tx.habitEntry.create({
      data: createData(data, { habitId: newHabitId, userId: targetId }),
    });
  }
  report.push({ model: 'HabitEntry', count: entries.length });
  console.log(`  HabitEntry: ${entries.length}`);
}

async function migrateDailyStates(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  report: MigrationReport[]
): Promise<void> {
  const states = await tx.dailyState.findMany({ where: { userId: sourceId } });
  for (const state of states) {
    const { id: _id, userId: _userId, ...data } = state;
    await tx.dailyState.create({
      data: createData(data, { userId: targetId }),
    });
  }
  report.push({ model: 'DailyState', count: states.length });
  console.log(`  DailyState: ${states.length}`);
}

async function migrateFocusSessions(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  idMap: Map<string, string>,
  report: MigrationReport[]
): Promise<void> {
  const sessions = await tx.focusSession.findMany({ where: { userId: sourceId } });
  for (const session of sessions) {
    const { id: oldId, userId: _userId, ...data } = session;
    const newSession = await tx.focusSession.create({
      data: createData(data, { userId: targetId }),
    });
    idMap.set(oldId, newSession.id);
  }
  report.push({ model: 'FocusSession', count: sessions.length });
  console.log(`  FocusSession: ${sessions.length}`);
}

async function migrateBlockers(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  idMap: Map<string, string>,
  report: MigrationReport[]
): Promise<void> {
  const blockers = await tx.blocker.findMany({ where: { userId: sourceId } });
  for (const blocker of blockers) {
    const { id: _id, userId: _userId, taskId, ...data } = blocker;
    const newTaskId = idMap.get(taskId);
    if (!newTaskId) continue;
    await tx.blocker.create({
      data: createData(data, { taskId: newTaskId, userId: targetId }),
    });
  }
  report.push({ model: 'Blocker', count: blockers.length });
  console.log(`  Blocker: ${blockers.length}`);
}

async function migrateDailyReviews(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  report: MigrationReport[]
): Promise<void> {
  const reviews = await tx.dailyReview.findMany({ where: { userId: sourceId } });
  for (const review of reviews) {
    const { id: _id, userId: _userId, ...data } = review;
    await tx.dailyReview.create({
      data: createData(data, { userId: targetId }),
    });
  }
  report.push({ model: 'DailyReview', count: reviews.length });
  console.log(`  DailyReview: ${reviews.length}`);
}

async function migratePolicyVersions(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  report: MigrationReport[]
): Promise<void> {
  const versions = await tx.policyVersion.findMany({ where: { userId: sourceId } });
  for (const ver of versions) {
    const { id: _id, userId: _userId, ...data } = ver;
    await tx.policyVersion.create({
      data: createData(data, { userId: targetId }),
    });
  }
  report.push({ model: 'PolicyVersion', count: versions.length });
  console.log(`  PolicyVersion: ${versions.length}`);
}

async function migrateConversations(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  idMap: Map<string, string>,
  report: MigrationReport[]
): Promise<void> {
  const conversations = await tx.conversation.findMany({ where: { userId: sourceId } });
  for (const conv of conversations) {
    const { id: oldId, userId: _userId, ...data } = conv;
    const newConv = await tx.conversation.create({
      data: createData(data, { userId: targetId }),
    });
    idMap.set(oldId, newConv.id);
  }
  report.push({ model: 'Conversation', count: conversations.length });
  console.log(`  Conversation: ${conversations.length}`);
}

async function migrateChatMessages(
  tx: TxClient,
  sourceId: string,
  idMap: Map<string, string>,
  report: MigrationReport[]
): Promise<void> {
  // Get source conversation IDs directly
  const sourceConvIds = (
    await tx.conversation.findMany({ where: { userId: sourceId }, select: { id: true } })
  ).map((c) => c.id);

  const messages = await tx.chatMessage.findMany({
    where: { conversationId: { in: sourceConvIds } },
    orderBy: { createdAt: 'asc' },
  });

  for (const msg of messages) {
    const { id: _id, conversationId, ...data } = msg;
    const newConversationId = idMap.get(conversationId);
    if (!newConversationId) continue;
    await tx.chatMessage.create({
      data: createData(data, { conversationId: newConversationId }),
    });
  }
  report.push({ model: 'ChatMessage', count: messages.length });
  console.log(`  ChatMessage: ${messages.length}`);
}

// ─── Migration Functions (Layer 2 — Auxiliary) ───────────────────────────

async function migrateProjectTemplates(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  report: MigrationReport[]
): Promise<void> {
  // Only migrate user-owned templates (userId is not null)
  const templates = await tx.projectTemplate.findMany({ where: { userId: sourceId } });
  for (const tmpl of templates) {
    const { id: _id, userId: _userId, ...data } = tmpl;
    await tx.projectTemplate.create({
      data: createData(data, { userId: targetId }),
    });
  }
  report.push({ model: 'ProjectTemplate', count: templates.length });
  console.log(`  ProjectTemplate: ${templates.length}`);
}

async function migrateActivityAggregates(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  report: MigrationReport[]
): Promise<void> {
  const aggregates = await tx.activityAggregate.findMany({ where: { userId: sourceId } });
  for (const agg of aggregates) {
    const { id: _id, userId: _userId, ...data } = agg;
    await tx.activityAggregate.create({
      data: createData(data, { userId: targetId }),
    });
  }
  report.push({ model: 'ActivityAggregate', count: aggregates.length });
  console.log(`  ActivityAggregate: ${aggregates.length}`);
}

async function migrateWorkStartRecords(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  report: MigrationReport[]
): Promise<void> {
  const records = await tx.workStartRecord.findMany({ where: { userId: sourceId } });
  for (const rec of records) {
    const { id: _id, userId: _userId, ...data } = rec;
    await tx.workStartRecord.create({
      data: createData(data, { userId: targetId }),
    });
  }
  report.push({ model: 'WorkStartRecord', count: records.length });
  console.log(`  WorkStartRecord: ${records.length}`);
}

async function migrateDailyEntertainmentStates(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  report: MigrationReport[]
): Promise<void> {
  const states = await tx.dailyEntertainmentState.findMany({ where: { userId: sourceId } });
  for (const state of states) {
    const { id: _id, userId: _userId, ...data } = state;
    await tx.dailyEntertainmentState.create({
      data: createData(data, { userId: targetId }),
    });
  }
  report.push({ model: 'DailyEntertainmentState', count: states.length });
  console.log(`  DailyEntertainmentState: ${states.length}`);
}

async function migrateSkipTokenUsages(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  report: MigrationReport[]
): Promise<void> {
  const usages = await tx.skipTokenUsage.findMany({ where: { userId: sourceId } });
  for (const usage of usages) {
    const { id: _id, userId: _userId, ...data } = usage;
    await tx.skipTokenUsage.create({
      data: createData(data, { userId: targetId }),
    });
  }
  report.push({ model: 'SkipTokenUsage', count: usages.length });
  console.log(`  SkipTokenUsage: ${usages.length}`);
}

async function migrateSuggestionFeedbacks(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  report: MigrationReport[]
): Promise<void> {
  const feedbacks = await tx.suggestionFeedback.findMany({ where: { userId: sourceId } });
  for (const fb of feedbacks) {
    const { id: _id, userId: _userId, ...data } = fb;
    await tx.suggestionFeedback.create({
      data: createData(data, { userId: targetId }),
    });
  }
  report.push({ model: 'SuggestionFeedback', count: feedbacks.length });
  console.log(`  SuggestionFeedback: ${feedbacks.length}`);
}

async function migrateTaskDecompositionFeedbacks(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  idMap: Map<string, string>,
  report: MigrationReport[]
): Promise<void> {
  const feedbacks = await tx.taskDecompositionFeedback.findMany({ where: { userId: sourceId } });
  let migrated = 0;
  for (const fb of feedbacks) {
    const { id: _id, userId: _userId, taskId, ...data } = fb;
    const newTaskId = idMap.get(taskId);
    if (!newTaskId) continue;
    await tx.taskDecompositionFeedback.create({
      data: createData(data, { taskId: newTaskId, userId: targetId }),
    });
    migrated++;
  }
  report.push({ model: 'TaskDecompositionFeedback', count: migrated });
  console.log(`  TaskDecompositionFeedback: ${migrated}`);
}

async function migrateDemoTokens(
  tx: TxClient,
  sourceId: string,
  targetId: string,
  report: MigrationReport[]
): Promise<void> {
  const tokens = await tx.demoToken.findMany({ where: { userId: sourceId } });
  for (const token of tokens) {
    const { id: _id, userId: _userId, ...data } = token;
    await tx.demoToken.create({
      data: createData(data, { userId: targetId }),
    });
  }
  report.push({ model: 'DemoToken', count: tokens.length });
  console.log(`  DemoToken: ${tokens.length}`);
}

// ─── Main ────────────────────────────────────────────────────────────────

const options = parseArgs(process.argv.slice(2));
migrate(options)
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
