import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seed() {
  const user = await prisma.user.upsert({
    where: { email: 'ithinker1991@gmail.com' },
    update: {},
    create: {
      email: 'ithinker1991@gmail.com',
      password: 'dev-password-hash',
    },
  });
  console.log('User:', user.id, user.email);

  const goal = await prisma.goal.create({
    data: {
      title: 'Learn TypeScript',
      description: 'Master TypeScript fundamentals',
      type: 'SHORT_TERM',
      targetDate: new Date('2026-12-31'),
      userId: user.id,
    },
  });
  console.log('Goal:', goal.id);

  const project = await prisma.project.create({
    data: {
      title: 'VibeFlow Development',
      deliverable: 'Working MCP integration',
      userId: user.id,
      goals: { create: { goalId: goal.id } },
    },
  });
  console.log('Project:', project.id);

  const task = await prisma.task.create({
    data: {
      title: 'Test MCP Integration',
      priority: 'P1',
      projectId: project.id,
      userId: user.id,
      planDate: new Date(),
    },
  });
  console.log('Task:', task.id);

  await prisma.$disconnect();
  console.log('Done!');
}

seed().catch(e => { console.error(e); process.exit(1); });
