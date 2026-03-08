#!/usr/bin/env ts-node
/**
 * View OpenClaw practice project details
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const project = await prisma.project.findFirst({
    where: {
      title: {
        contains: 'OpenClaw'
      }
    },
    include: {
      tasks: {
        where: { parentId: null },
        include: {
          subTasks: {
            orderBy: { sortOrder: 'asc' }
          }
        },
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!project) {
    console.log('❌ OpenClaw project not found');
    return;
  }

  console.log('\n📁 Project: ' + project.title);
  console.log('   Deliverable: ' + project.deliverable);
  console.log('   Status: ' + project.status);
  console.log('   Created: ' + project.createdAt.toLocaleDateString('zh-CN'));
  console.log('\n📋 Tasks:\n');

  for (const task of project.tasks) {
    const statusEmoji = task.status === 'DONE' ? '✅' : task.status === 'IN_PROGRESS' ? '🔄' : '⭕';
    console.log(`  ${statusEmoji} ${task.title} (${task.estimatedMinutes}分钟)`);
    
    for (const subtask of task.subTasks) {
      const subStatus = subtask.status === 'DONE' ? '✅' : subtask.status === 'IN_PROGRESS' ? '🔄' : '⭕';
      console.log(`      ${subStatus} ${subtask.title}`);
    }
    console.log('');
  }

  const totalEstimated = project.tasks.reduce((acc, t) => 
    acc + (t.estimatedMinutes || 0) + t.subTasks.reduce((a, s) => a + (s.estimatedMinutes || 0), 0), 0);
  
  console.log(`\n📊 Statistics:`);
  console.log(`   Total estimated time: ${totalEstimated} minutes (${(totalEstimated/60).toFixed(1)} hours)`);
  console.log(`   Main tasks: ${project.tasks.length}`);
  console.log(`   Subtasks: ${project.tasks.reduce((acc, t) => acc + t.subTasks.length, 0)}`);
}

main()
  .finally(() => prisma.$disconnect());
