import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seed() {
  const user = await prisma.user.upsert({
    where: { email: 'dev@vibeflow.local' },
    update: {},
    create: {
      email: 'dev@vibeflow.local',
      name: 'Dev User',
    },
  });
  console.log('User:', user.id, user.email);

  const goal = await prisma.goal.create({
    data: {
      title: 'Learn TypeScript',
      type: 'MONTHLY',
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
