/**
 * seed-demo.ts — 灌入无隐私的 demo 展示数据
 * Usage: DATABASE_URL="postgresql://..." npx tsx scripts/seed-demo.ts
 *   or:  dotenv -e .env.dev -- npx tsx scripts/seed-demo.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(9, 0, 0, 0);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d;
}

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

async function seed() {
  console.log('[seed-demo] Cleaning existing data...');

  // Truncate all tables with CASCADE to avoid FK issues
  await prisma.$executeRawUnsafe(`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations') LOOP
        EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" CASCADE';
      END LOOP;
    END $$;
  `);

  console.log('[seed-demo] Creating demo user...');

  const user = await prisma.user.create({
    data: {
      email: 'ithinker1991@gmail.com',
      password: 'demo-not-for-production',
    },
  });

  // UserSettings
  await prisma.userSettings.create({
    data: {
      userId: user.id,
      pomodoroDuration: 25,
      shortRestDuration: 5,
      longRestDuration: 15,
      dailyCap: 8,
      airlockMode: 'optional',
    },
  });

  // ── Goals ──
  console.log('[seed-demo] Creating goals...');

  const goalProductLaunch = await prisma.goal.create({
    data: {
      title: 'Q2 Product Launch',
      description: 'Ship v2.0 with core features, onboarding flow, and analytics dashboard',
      type: 'SHORT_TERM',
      targetDate: daysFromNow(60),
      userId: user.id,
    },
  });

  const goalPersonalGrowth = await prisma.goal.create({
    data: {
      title: 'Build Deep Work Habit',
      description: 'Sustain 4+ focused pomodoros daily, reduce context switching',
      type: 'LONG_TERM',
      targetDate: daysFromNow(180),
      userId: user.id,
    },
  });

  // ── Projects ──
  console.log('[seed-demo] Creating projects...');

  const projOnboarding = await prisma.project.create({
    data: {
      title: 'User Onboarding Redesign',
      deliverable: 'New onboarding flow with 3-step wizard and progress tracking',
      userId: user.id,
      goals: { create: { goalId: goalProductLaunch.id } },
    },
  });

  const projDashboard = await prisma.project.create({
    data: {
      title: 'Analytics Dashboard',
      deliverable: 'Real-time metrics dashboard with charts and export',
      userId: user.id,
      goals: { create: { goalId: goalProductLaunch.id } },
    },
  });

  const projTeam = await prisma.project.create({
    data: {
      title: 'Team Collaboration',
      deliverable: 'Shared projects, comments, and @mentions',
      userId: user.id,
    },
  });

  const projLearning = await prisma.project.create({
    data: {
      title: 'Learning & Growth',
      deliverable: 'Complete design system course and write 2 blog posts',
      userId: user.id,
      goals: { create: { goalId: goalPersonalGrowth.id } },
    },
  });

  // ── Tasks ──
  console.log('[seed-demo] Creating tasks...');

  // Onboarding project tasks
  const taskWireframe = await prisma.task.create({
    data: {
      title: 'Design onboarding wireframes',
      status: 'DONE',
      priority: 'P1',
      planDate: daysAgo(3),
      estimatedMinutes: 120,
      projectId: projOnboarding.id,
      userId: user.id,
    },
  });

  const taskOnboardingAPI = await prisma.task.create({
    data: {
      title: 'Build onboarding API endpoints',
      status: 'IN_PROGRESS',
      priority: 'P1',
      planDate: today(),
      estimatedMinutes: 180,
      projectId: projOnboarding.id,
      userId: user.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Write onboarding copy and tooltips',
      status: 'TODO',
      priority: 'P2',
      planDate: daysFromNow(1),
      estimatedMinutes: 60,
      projectId: projOnboarding.id,
      userId: user.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Add progress stepper component',
      status: 'TODO',
      priority: 'P2',
      planDate: daysFromNow(2),
      estimatedMinutes: 90,
      projectId: projOnboarding.id,
      userId: user.id,
    },
  });

  // Dashboard project tasks
  const taskChartLib = await prisma.task.create({
    data: {
      title: 'Evaluate chart libraries (Recharts vs Nivo)',
      status: 'DONE',
      priority: 'P1',
      planDate: daysAgo(2),
      estimatedMinutes: 60,
      projectId: projDashboard.id,
      userId: user.id,
    },
  });

  const taskMetricsAPI = await prisma.task.create({
    data: {
      title: 'Implement metrics aggregation API',
      status: 'TODO',
      priority: 'P1',
      planDate: today(),
      estimatedMinutes: 150,
      projectId: projDashboard.id,
      userId: user.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Build weekly trend chart component',
      status: 'TODO',
      priority: 'P2',
      planDate: daysFromNow(3),
      estimatedMinutes: 120,
      projectId: projDashboard.id,
      userId: user.id,
    },
  });

  // Team project tasks
  await prisma.task.create({
    data: {
      title: 'Design shared project data model',
      status: 'TODO',
      priority: 'P1',
      planDate: daysFromNow(5),
      estimatedMinutes: 90,
      projectId: projTeam.id,
      userId: user.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Research real-time collaboration patterns',
      status: 'TODO',
      priority: 'P3',
      projectId: projTeam.id,
      userId: user.id,
    },
  });

  // Learning project tasks
  const taskCourse = await prisma.task.create({
    data: {
      title: 'Complete Design Systems course (Module 3)',
      status: 'IN_PROGRESS',
      priority: 'P2',
      planDate: today(),
      estimatedMinutes: 45,
      projectId: projLearning.id,
      userId: user.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Draft blog post: "Why Deep Work Matters"',
      status: 'TODO',
      priority: 'P2',
      planDate: daysFromNow(4),
      estimatedMinutes: 90,
      projectId: projLearning.id,
      userId: user.id,
    },
  });

  // ── Pomodoros (history for past days + today) ──
  console.log('[seed-demo] Creating pomodoro history...');

  // 3 days ago — 3 pomodoros
  await prisma.pomodoro.create({
    data: {
      duration: 25,
      startTime: new Date(daysAgo(3).getTime() + 9 * 3600000),
      endTime: new Date(daysAgo(3).getTime() + 9 * 3600000 + 25 * 60000),
      status: 'COMPLETED',
      summary: 'Completed initial wireframe sketches',
      taskId: taskWireframe.id,
      userId: user.id,
    },
  });

  await prisma.pomodoro.create({
    data: {
      duration: 25,
      startTime: new Date(daysAgo(3).getTime() + 10 * 3600000),
      endTime: new Date(daysAgo(3).getTime() + 10 * 3600000 + 25 * 60000),
      status: 'COMPLETED',
      summary: 'Refined wireframes and added annotations',
      taskId: taskWireframe.id,
      userId: user.id,
    },
  });

  await prisma.pomodoro.create({
    data: {
      duration: 25,
      startTime: new Date(daysAgo(3).getTime() + 14 * 3600000),
      endTime: new Date(daysAgo(3).getTime() + 14 * 3600000 + 25 * 60000),
      status: 'COMPLETED',
      summary: 'Reviewed chart library docs',
      taskId: taskChartLib.id,
      userId: user.id,
    },
  });

  // 2 days ago — 4 pomodoros
  await prisma.pomodoro.create({
    data: {
      duration: 25,
      startTime: new Date(daysAgo(2).getTime() + 9 * 3600000),
      endTime: new Date(daysAgo(2).getTime() + 9 * 3600000 + 25 * 60000),
      status: 'COMPLETED',
      summary: 'Prototyped Recharts integration',
      taskId: taskChartLib.id,
      userId: user.id,
    },
  });

  await prisma.pomodoro.create({
    data: {
      duration: 25,
      startTime: new Date(daysAgo(2).getTime() + 10 * 3600000),
      endTime: new Date(daysAgo(2).getTime() + 10 * 3600000 + 25 * 60000),
      status: 'COMPLETED',
      taskId: taskChartLib.id,
      userId: user.id,
    },
  });

  await prisma.pomodoro.create({
    data: {
      duration: 25,
      startTime: new Date(daysAgo(2).getTime() + 11 * 3600000),
      endTime: new Date(daysAgo(2).getTime() + 11 * 3600000 + 20 * 60000),
      status: 'ABORTED',
      taskId: taskOnboardingAPI.id,
      userId: user.id,
    },
  });

  await prisma.pomodoro.create({
    data: {
      duration: 25,
      startTime: new Date(daysAgo(2).getTime() + 14 * 3600000),
      endTime: new Date(daysAgo(2).getTime() + 14 * 3600000 + 25 * 60000),
      status: 'COMPLETED',
      summary: 'Started API route scaffolding',
      taskId: taskOnboardingAPI.id,
      userId: user.id,
    },
  });

  // Yesterday — 2 pomodoros
  await prisma.pomodoro.create({
    data: {
      duration: 25,
      startTime: new Date(daysAgo(1).getTime() + 9 * 3600000),
      endTime: new Date(daysAgo(1).getTime() + 9 * 3600000 + 25 * 60000),
      status: 'COMPLETED',
      summary: 'Implemented user registration endpoint',
      taskId: taskOnboardingAPI.id,
      userId: user.id,
    },
  });

  await prisma.pomodoro.create({
    data: {
      duration: 25,
      startTime: new Date(daysAgo(1).getTime() + 10 * 3600000),
      endTime: new Date(daysAgo(1).getTime() + 10 * 3600000 + 25 * 60000),
      status: 'COMPLETED',
      summary: 'Course module 2 exercises',
      taskId: taskCourse.id,
      userId: user.id,
    },
  });

  // Today — 2 completed
  await prisma.pomodoro.create({
    data: {
      duration: 25,
      startTime: hoursAgo(3),
      endTime: new Date(hoursAgo(3).getTime() + 25 * 60000),
      status: 'COMPLETED',
      summary: 'Continued onboarding API — validation layer',
      taskId: taskOnboardingAPI.id,
      userId: user.id,
    },
  });

  await prisma.pomodoro.create({
    data: {
      duration: 25,
      startTime: hoursAgo(2),
      endTime: new Date(hoursAgo(2).getTime() + 25 * 60000),
      status: 'COMPLETED',
      summary: 'Reviewed metrics API requirements',
      taskId: taskMetricsAPI.id,
      userId: user.id,
    },
  });

  // ── DailyState (today) ──
  await prisma.dailyState.create({
    data: {
      userId: user.id,
      date: today(),
      systemState: 'PLANNING',
      top3TaskIds: [taskOnboardingAPI.id, taskMetricsAPI.id, taskCourse.id],
      pomodoroCount: 2,
      airlockCompleted: true,
    },
  });

  // ── Summary ──
  const stats = {
    goals: await prisma.goal.count(),
    projects: await prisma.project.count(),
    tasks: await prisma.task.count(),
    pomodoros: await prisma.pomodoro.count(),
  };

  console.log('[seed-demo] Done!');
  console.log(`  Goals:     ${stats.goals}`);
  console.log(`  Projects:  ${stats.projects}`);
  console.log(`  Tasks:     ${stats.tasks}`);
  console.log(`  Pomodoros: ${stats.pomodoros}`);

  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
