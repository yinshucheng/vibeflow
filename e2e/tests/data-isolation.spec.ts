import { test, expect } from '../fixtures';

/**
 * Cross-user data isolation E2E tests
 *
 * Verifies that users cannot access each other's data through the tRPC API.
 * Uses direct HTTP calls to tRPC endpoints with X-Dev-User-Email header auth.
 *
 * Requirements: 3.2 (data-isolation-audit)
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3200';

// --- tRPC HTTP helpers ---

interface TrpcResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

async function trpcQuery(
  path: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<TrpcResponse> {
  const encoded = encodeURIComponent(
    JSON.stringify({ json: input ?? null })
  );
  const url = `${BASE_URL}/api/trpc/${path}?input=${encoded}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function trpcMutation(
  path: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<TrpcResponse> {
  const url = `${BASE_URL}/api/trpc/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ json: input }),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function authHeader(email: string): Record<string, string> {
  return { 'x-dev-user-email': email };
}

/** Extract data from tRPC success response: {result: {data: {json: <data>}}} */
function getData(resp: TrpcResponse): unknown {
  return resp.body?.result?.data?.json ?? null;
}

/** Check if tRPC response is an error */
function isError(resp: TrpcResponse): boolean {
  return resp.body?.error != null;
}

test.describe('Cross-User Data Isolation', () => {
  // ──────────────────────────────────────────────
  // 3.2.1 Task isolation
  // ──────────────────────────────────────────────
  test.describe('Task Isolation (3.2.1)', () => {
    test('user B cannot list user A tasks', async ({
      testUser,
      userFactory,
      projectFactory,
      taskFactory,
    }) => {
      // Setup: userA has a project with a task
      const projectA = await projectFactory.create(testUser.id, {
        title: 'UserA Project',
      });
      const taskA = await taskFactory.create(projectA.id, testUser.id, {
        title: 'UserA Secret Task',
        planDate: new Date(),
      });

      // Create userB
      const userB = await userFactory.create();

      // UserB lists tasks by project → should error (not their project)
      const byProject = await trpcQuery(
        'task.getByProject',
        { projectId: projectA.id },
        authHeader(userB.email)
      );
      const byProjectData = getData(byProject);
      if (Array.isArray(byProjectData)) {
        const taskIds = byProjectData.map((t: { id: string }) => t.id);
        expect(taskIds).not.toContain(taskA.id);
      } else {
        // Expected: error or null (project not found for this user)
        expect(isError(byProject) || byProjectData === null).toBeTruthy();
      }

      // UserB tries to get today's tasks → should not contain userA's task
      const todayTasks = await trpcQuery(
        'task.getTodayTasks',
        undefined,
        authHeader(userB.email)
      );
      const todayData = getData(todayTasks);
      if (Array.isArray(todayData)) {
        const taskIds = todayData.map((t: { id: string }) => t.id);
        expect(taskIds).not.toContain(taskA.id);
      }

      // UserB tries to get userA's task by ID → should fail (NOT_FOUND)
      const getById = await trpcQuery(
        'task.getById',
        { id: taskA.id },
        authHeader(userB.email)
      );
      expect(isError(getById) || getData(getById) === null).toBeTruthy();
    });

    test('user B cannot modify user A tasks', async ({
      testUser,
      userFactory,
      projectFactory,
      taskFactory,
    }) => {
      const projectA = await projectFactory.create(testUser.id);
      const taskA = await taskFactory.create(projectA.id, testUser.id, {
        title: 'UserA Task To Protect',
      });

      const userB = await userFactory.create();

      // UserB tries to update userA's task → should fail
      const updateResult = await trpcMutation(
        'task.update',
        { id: taskA.id, data: { title: 'Hacked by UserB' } },
        authHeader(userB.email)
      );
      expect(isError(updateResult)).toBeTruthy();

      // UserB tries to delete userA's task → should fail
      const deleteResult = await trpcMutation(
        'task.delete',
        { id: taskA.id },
        authHeader(userB.email)
      );
      expect(isError(deleteResult)).toBeTruthy();

      // Verify task still exists and is unmodified (as userA)
      const verify = await trpcQuery(
        'task.getById',
        { id: taskA.id },
        authHeader(testUser.email)
      );
      const verifyData = getData(verify) as { id: string; title: string } | null;
      expect(verifyData).toBeTruthy();
      expect(verifyData!.title).toBe('UserA Task To Protect');
    });
  });

  // ──────────────────────────────────────────────
  // 3.2.2 Project isolation
  // ──────────────────────────────────────────────
  test.describe('Project Isolation (3.2.2)', () => {
    test('user B cannot see user A projects', async ({
      testUser,
      userFactory,
      projectFactory,
    }) => {
      // UserA creates a project
      const projectA = await projectFactory.create(testUser.id, {
        title: 'UserA Private Project',
      });

      // Create userB
      const userB = await userFactory.create();

      // UserB lists projects → should not contain userA's project
      const listResult = await trpcQuery(
        'project.list',
        undefined,
        authHeader(userB.email)
      );
      const listData = getData(listResult);
      expect(Array.isArray(listData)).toBeTruthy();
      const projectIds = (listData as Array<{ id: string }>).map(p => p.id);
      expect(projectIds).not.toContain(projectA.id);

      // UserB tries to get userA's project by ID → should fail
      const getById = await trpcQuery(
        'project.getById',
        { id: projectA.id },
        authHeader(userB.email)
      );
      expect(isError(getById)).toBeTruthy();
    });

    test('user B cannot modify user A projects', async ({
      testUser,
      userFactory,
      projectFactory,
    }) => {
      const projectA = await projectFactory.create(testUser.id, {
        title: 'UserA Project To Protect',
      });

      const userB = await userFactory.create();

      // UserB tries to update userA's project → should fail
      const updateResult = await trpcMutation(
        'project.update',
        { id: projectA.id, data: { title: 'Hacked by UserB' } },
        authHeader(userB.email)
      );
      expect(isError(updateResult)).toBeTruthy();

      // UserB tries to archive userA's project → should fail
      const archiveResult = await trpcMutation(
        'project.archive',
        { id: projectA.id },
        authHeader(userB.email)
      );
      expect(isError(archiveResult)).toBeTruthy();

      // Verify project is unmodified (as userA)
      const verify = await trpcQuery(
        'project.getById',
        { id: projectA.id },
        authHeader(testUser.email)
      );
      const verifyData = getData(verify) as { id: string; title: string; status: string } | null;
      expect(verifyData).toBeTruthy();
      expect(verifyData!.title).toBe('UserA Project To Protect');
      expect(verifyData!.status).toBe('ACTIVE');
    });
  });

  // ──────────────────────────────────────────────
  // 3.2.3 Goal isolation
  // ──────────────────────────────────────────────
  test.describe('Goal Isolation (3.2.3)', () => {
    test('user B cannot see user A goals', async ({
      testUser,
      userFactory,
      goalFactory,
    }) => {
      // UserA creates a goal
      const goalA = await goalFactory.create(testUser.id, {
        title: 'UserA Private Goal',
      });

      // Create userB
      const userB = await userFactory.create();

      // UserB lists goals → should not contain userA's goal
      const listResult = await trpcQuery(
        'goal.list',
        undefined,
        authHeader(userB.email)
      );
      const listData = getData(listResult);
      expect(Array.isArray(listData)).toBeTruthy();
      const goalIds = (listData as Array<{ id: string }>).map(g => g.id);
      expect(goalIds).not.toContain(goalA.id);

      // UserB tries to get userA's goal progress → should fail
      const getProgress = await trpcQuery(
        'goal.getProgress',
        { id: goalA.id },
        authHeader(userB.email)
      );
      expect(isError(getProgress)).toBeTruthy();
    });

    test('user B cannot modify user A goals', async ({
      testUser,
      userFactory,
      goalFactory,
    }) => {
      const goalA = await goalFactory.create(testUser.id, {
        title: 'UserA Goal To Protect',
      });

      const userB = await userFactory.create();

      // UserB tries to update userA's goal → should fail
      const updateResult = await trpcMutation(
        'goal.update',
        { id: goalA.id, data: { title: 'Hacked by UserB' } },
        authHeader(userB.email)
      );
      expect(isError(updateResult)).toBeTruthy();

      // UserB tries to archive userA's goal → should fail
      const archiveResult = await trpcMutation(
        'goal.archive',
        { id: goalA.id },
        authHeader(userB.email)
      );
      expect(isError(archiveResult)).toBeTruthy();

      // Verify goal is unmodified (as userA)
      const verify = await trpcQuery(
        'goal.list',
        undefined,
        authHeader(testUser.email)
      );
      const verifyData = getData(verify) as Array<{ id: string; title: string; status: string }>;
      expect(verifyData).toBeTruthy();
      const goalAData = verifyData.find(g => g.id === goalA.id);
      expect(goalAData).toBeTruthy();
      expect(goalAData!.title).toBe('UserA Goal To Protect');
      expect(goalAData!.status).toBe('ACTIVE');
    });
  });

  // ──────────────────────────────────────────────
  // 3.2.4 Pomodoro isolation
  // ──────────────────────────────────────────────
  test.describe('Pomodoro Isolation (3.2.4)', () => {
    test('user B cannot see user A pomodoros', async ({
      testUser,
      userFactory,
      projectFactory,
      taskFactory,
      prisma,
      tracker,
    }) => {
      // UserA has a completed pomodoro
      const projectA = await projectFactory.create(testUser.id);
      const taskA = await taskFactory.create(projectA.id, testUser.id, {
        title: 'UserA Focus Task',
        planDate: new Date(),
      });

      // Create a completed pomodoro directly via Prisma
      const pomodoroA = await prisma.pomodoro.create({
        data: {
          userId: testUser.id,
          taskId: taskA.id,
          duration: 25,
          status: 'COMPLETED',
          startTime: new Date(Date.now() - 25 * 60 * 1000),
          endTime: new Date(),
        },
      });
      tracker.trackPomodoro(pomodoroA.id);

      // Create userB
      const userB = await userFactory.create();

      // UserB tries to get pomodoro by userA's task → should be empty or error
      const byTask = await trpcQuery(
        'pomodoro.getByTask',
        { taskId: taskA.id },
        authHeader(userB.email)
      );
      const byTaskData = getData(byTask);
      if (Array.isArray(byTaskData)) {
        const pomodoroIds = byTaskData.map((p: { id: string }) => p.id);
        expect(pomodoroIds).not.toContain(pomodoroA.id);
      }

      // UserB tries to get pomodoro summary → should fail
      const summary = await trpcQuery(
        'pomodoro.getSummary',
        { id: pomodoroA.id },
        authHeader(userB.email)
      );
      expect(isError(summary) || getData(summary) === null).toBeTruthy();

      // UserB gets today count → should be 0 (no pomodoros for userB)
      const todayCount = await trpcQuery(
        'pomodoro.getTodayCount',
        undefined,
        authHeader(userB.email)
      );
      const countData = getData(todayCount);
      expect(countData).toBe(0);
    });

    test('user B cannot manipulate user A active pomodoro', async ({
      testUser,
      userFactory,
      projectFactory,
      taskFactory,
      prisma,
      tracker,
    }) => {
      // UserA has an active pomodoro
      const projectA = await projectFactory.create(testUser.id);
      const taskA = await taskFactory.create(projectA.id, testUser.id, {
        title: 'UserA Active Focus',
        planDate: new Date(),
      });

      const activePomodoroA = await prisma.pomodoro.create({
        data: {
          userId: testUser.id,
          taskId: taskA.id,
          duration: 25,
          status: 'IN_PROGRESS',
          startTime: new Date(),
        },
      });
      tracker.trackPomodoro(activePomodoroA.id);

      const userB = await userFactory.create();

      // UserB tries to complete userA's pomodoro → should fail
      const completeResult = await trpcMutation(
        'pomodoro.complete',
        { id: activePomodoroA.id },
        authHeader(userB.email)
      );
      expect(isError(completeResult)).toBeTruthy();

      // UserB tries to abort userA's pomodoro → should fail
      const abortResult = await trpcMutation(
        'pomodoro.abort',
        { id: activePomodoroA.id },
        authHeader(userB.email)
      );
      expect(isError(abortResult)).toBeTruthy();

      // Verify pomodoro is still active (as userA)
      const verify = await trpcQuery(
        'pomodoro.getCurrent',
        undefined,
        authHeader(testUser.email)
      );
      const verifyData = getData(verify) as { id: string; status: string } | null;
      expect(verifyData).toBeTruthy();
      expect(verifyData!.id).toBe(activePomodoroA.id);
      expect(verifyData!.status).toBe('IN_PROGRESS');
    });
  });

  // ──────────────────────────────────────────────
  // 3.2.5 Settings isolation
  // ──────────────────────────────────────────────
  test.describe('Settings Isolation (3.2.5)', () => {
    test('user A settings changes do not affect user B', async ({
      testUser,
      userFactory,
      prisma,
    }) => {
      // Ensure both users have UserSettings
      await prisma.userSettings.upsert({
        where: { userId: testUser.id },
        create: { userId: testUser.id },
        update: {},
      });

      const userB = await userFactory.create();
      await prisma.userSettings.upsert({
        where: { userId: userB.id },
        create: { userId: userB.id },
        update: {},
      });

      // Read userB's initial settings
      const initialSettings = await trpcQuery(
        'settings.get',
        undefined,
        authHeader(userB.email)
      );
      const initialData = getData(initialSettings) as {
        pomodoroDuration: number;
        dailyCap: number;
      } | null;
      expect(initialData).toBeTruthy();
      const initialDuration = initialData!.pomodoroDuration;
      const initialCap = initialData!.dailyCap;

      // UserA updates their settings to extreme values
      await trpcMutation(
        'settings.updateTimer',
        {
          pomodoroDuration: 50,
          dailyCap: 20,
        },
        authHeader(testUser.email)
      );

      // Read userB's settings again → should be unchanged
      const afterSettings = await trpcQuery(
        'settings.get',
        undefined,
        authHeader(userB.email)
      );
      const afterData = getData(afterSettings) as {
        pomodoroDuration: number;
        dailyCap: number;
      } | null;
      expect(afterData).toBeTruthy();
      expect(afterData!.pomodoroDuration).toBe(initialDuration);
      expect(afterData!.dailyCap).toBe(initialCap);
    });

    test('user B cannot read user A settings via API', async ({
      testUser,
      userFactory,
      prisma,
    }) => {
      // Settings endpoint always returns the authenticated user's own settings.
      // This test verifies that behavior is correct.

      await prisma.userSettings.upsert({
        where: { userId: testUser.id },
        create: { userId: testUser.id, pomodoroDuration: 45 },
        update: { pomodoroDuration: 45 },
      });

      const userB = await userFactory.create();
      await prisma.userSettings.upsert({
        where: { userId: userB.id },
        create: { userId: userB.id },
        update: {},
      });

      // UserB calls settings.get → should get their own settings (default 25), not userA's (45)
      const userBSettings = await trpcQuery(
        'settings.get',
        undefined,
        authHeader(userB.email)
      );
      const userBData = getData(userBSettings) as { pomodoroDuration: number } | null;
      expect(userBData).toBeTruthy();
      expect(userBData!.pomodoroDuration).toBe(25); // default, not 45

      // UserA calls settings.get → should get their customized settings
      const userASettings = await trpcQuery(
        'settings.get',
        undefined,
        authHeader(testUser.email)
      );
      const userAData = getData(userASettings) as { pomodoroDuration: number } | null;
      expect(userAData).toBeTruthy();
      expect(userAData!.pomodoroDuration).toBe(45);
    });

    test('user B cannot modify user A settings', async ({
      testUser,
      userFactory,
      prisma,
    }) => {
      // Set userA's settings to known values
      await prisma.userSettings.upsert({
        where: { userId: testUser.id },
        create: { userId: testUser.id, pomodoroDuration: 30 },
        update: { pomodoroDuration: 30 },
      });

      const userB = await userFactory.create();
      await prisma.userSettings.upsert({
        where: { userId: userB.id },
        create: { userId: userB.id },
        update: {},
      });

      // UserB updates timer settings — this should only affect userB
      await trpcMutation(
        'settings.updateTimer',
        { pomodoroDuration: 15 },
        authHeader(userB.email)
      );

      // Verify userA's settings are unchanged
      const userASettings = await trpcQuery(
        'settings.get',
        undefined,
        authHeader(testUser.email)
      );
      const userAData = getData(userASettings) as { pomodoroDuration: number } | null;
      expect(userAData).toBeTruthy();
      expect(userAData!.pomodoroDuration).toBe(30); // unchanged

      // Verify userB's settings were updated
      const userBSettings = await trpcQuery(
        'settings.get',
        undefined,
        authHeader(userB.email)
      );
      const userBData = getData(userBSettings) as { pomodoroDuration: number } | null;
      expect(userBData).toBeTruthy();
      expect(userBData!.pomodoroDuration).toBe(15);
    });
  });
});
