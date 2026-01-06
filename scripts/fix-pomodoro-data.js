#!/usr/bin/env node

/**
 * Pomodoro Data Fix Script
 * 
 * This script fixes corrupted pomodoro data in the database:
 * 1. Fixes negative duration pomodoros (endTime < startTime)
 * 2. Fixes super long pomodoros (duration > expected)
 * 3. Completes any stuck IN_PROGRESS pomodoros
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Starting pomodoro data fix...\n');

  try {
    // 1. Find and fix negative duration pomodoros
    console.log('1. Checking for negative duration pomodoros...');
    const negativeDurationPomodoros = await prisma.$queryRaw`
      SELECT id, "userId", "taskId", duration, "startTime", "endTime", status,
             EXTRACT(EPOCH FROM ("endTime" - "startTime"))/60 as actual_duration_minutes
      FROM "Pomodoro" 
      WHERE "endTime" IS NOT NULL 
        AND "endTime" < "startTime"
        AND status = 'COMPLETED'
    `;

    console.log(`Found ${negativeDurationPomodoros.length} pomodoros with negative duration`);

    for (const pomodoro of negativeDurationPomodoros) {
      const expectedEndTime = new Date(pomodoro.startTime.getTime() + pomodoro.duration * 60 * 1000);
      
      console.log(`  Fixing pomodoro ${pomodoro.id}: ${pomodoro.actual_duration_minutes.toFixed(2)} min -> ${pomodoro.duration} min`);
      
      await prisma.pomodoro.update({
        where: { id: pomodoro.id },
        data: {
          endTime: expectedEndTime,
          summary: pomodoro.summary ? `${pomodoro.summary} (Fixed: negative duration)` : 'Fixed: negative duration'
        }
      });
    }

    // 2. Find and fix super long pomodoros (more than 2x expected duration)
    console.log('\n2. Checking for super long pomodoros...');
    const longPomodoros = await prisma.$queryRaw`
      SELECT id, "userId", "taskId", duration, "startTime", "endTime", status,
             EXTRACT(EPOCH FROM ("endTime" - "startTime"))/60 as actual_duration_minutes
      FROM "Pomodoro" 
      WHERE "endTime" IS NOT NULL 
        AND "endTime" > "startTime"
        AND EXTRACT(EPOCH FROM ("endTime" - "startTime"))/60 > duration * 2
        AND status = 'COMPLETED'
    `;

    console.log(`Found ${longPomodoros.length} pomodoros with excessive duration`);

    for (const pomodoro of longPomodoros) {
      const expectedEndTime = new Date(pomodoro.startTime.getTime() + pomodoro.duration * 60 * 1000);
      
      console.log(`  Fixing pomodoro ${pomodoro.id}: ${pomodoro.actual_duration_minutes.toFixed(2)} min -> ${pomodoro.duration} min`);
      
      await prisma.pomodoro.update({
        where: { id: pomodoro.id },
        data: {
          endTime: expectedEndTime,
          summary: pomodoro.summary ? `${pomodoro.summary} (Fixed: excessive duration)` : 'Fixed: excessive duration'
        }
      });
    }

    // 3. Complete any stuck IN_PROGRESS pomodoros
    console.log('\n3. Checking for stuck IN_PROGRESS pomodoros...');
    const stuckPomodoros = await prisma.pomodoro.findMany({
      where: {
        status: 'IN_PROGRESS'
      },
      include: {
        task: {
          select: {
            title: true
          }
        }
      }
    });

    console.log(`Found ${stuckPomodoros.length} stuck IN_PROGRESS pomodoros`);

    for (const pomodoro of stuckPomodoros) {
      const expectedEndTime = new Date(pomodoro.startTime.getTime() + pomodoro.duration * 60 * 1000);
      const now = new Date();
      
      if (now >= expectedEndTime) {
        console.log(`  Completing expired pomodoro ${pomodoro.id} (${pomodoro.task?.title || 'Unknown Task'})`);
        
        await prisma.pomodoro.update({
          where: { id: pomodoro.id },
          data: {
            status: 'COMPLETED',
            endTime: expectedEndTime,
            summary: 'Auto-completed (expired, fixed by script)'
          }
        });
      } else {
        console.log(`  Keeping active pomodoro ${pomodoro.id} (${pomodoro.task?.title || 'Unknown Task'}) - still running`);
      }
    }

    // 4. Verify the fixes
    console.log('\n4. Verifying fixes...');
    const remainingIssues = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "Pomodoro" 
      WHERE "endTime" IS NOT NULL 
        AND ("endTime" < "startTime" OR EXTRACT(EPOCH FROM ("endTime" - "startTime"))/60 > duration * 2)
        AND status = 'COMPLETED'
    `;

    console.log(`Remaining problematic pomodoros: ${remainingIssues[0].count}`);

    // 5. Show summary statistics
    console.log('\n5. Summary statistics:');
    const totalPomodoros = await prisma.pomodoro.count();
    const completedPomodoros = await prisma.pomodoro.count({
      where: { status: 'COMPLETED' }
    });
    const inProgressPomodoros = await prisma.pomodoro.count({
      where: { status: 'IN_PROGRESS' }
    });

    console.log(`  Total pomodoros: ${totalPomodoros}`);
    console.log(`  Completed: ${completedPomodoros}`);
    console.log(`  In progress: ${inProgressPomodoros}`);

    console.log('\n✅ Pomodoro data fix completed successfully!');

  } catch (error) {
    console.error('❌ Error fixing pomodoro data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});