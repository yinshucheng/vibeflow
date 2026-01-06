#!/usr/bin/env node

/**
 * Test Pomodoro Fix Script
 * 
 * This script tests the pomodoro auto-completion functionality
 * by creating a short pomodoro and verifying it completes automatically.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🧪 Testing pomodoro auto-completion fix...\n');

  try {
    // Get a test user
    const testUser = await prisma.user.findFirst({
      where: {
        email: 'dev@vibeflow.local'
      }
    });

    if (!testUser) {
      console.log('❌ Test user not found. Creating one...');
      const newUser = await prisma.user.create({
        data: {
          email: 'dev@vibeflow.local',
          name: 'Test User'
        }
      });
      console.log(`✅ Created test user: ${newUser.id}`);
      testUser = newUser;
    }

    // Get or create a test task
    let testTask = await prisma.task.findFirst({
      where: {
        userId: testUser.id,
        title: 'Test Pomodoro Task'
      }
    });

    if (!testTask) {
      // Create a test project first
      let testProject = await prisma.project.findFirst({
        where: {
          userId: testUser.id,
          title: 'Test Project'
        }
      });

      if (!testProject) {
        testProject = await prisma.project.create({
          data: {
            userId: testUser.id,
            title: 'Test Project',
            deliverable: 'Test deliverable for pomodoro testing'
          }
        });
      }

      testTask = await prisma.task.create({
        data: {
          userId: testUser.id,
          projectId: testProject.id,
          title: 'Test Pomodoro Task',
          priority: 'P2',
          planDate: new Date()
        }
      });
      console.log(`✅ Created test task: ${testTask.id}`);
    }

    // Create a short pomodoro (1 minute for testing)
    const testPomodoro = await prisma.pomodoro.create({
      data: {
        userId: testUser.id,
        taskId: testTask.id,
        duration: 1, // 1 minute for quick testing
        status: 'IN_PROGRESS'
      }
    });

    console.log(`✅ Created test pomodoro: ${testPomodoro.id}`);
    console.log(`   Duration: ${testPomodoro.duration} minutes`);
    console.log(`   Start time: ${testPomodoro.startTime}`);
    console.log(`   Expected end time: ${new Date(testPomodoro.startTime.getTime() + testPomodoro.duration * 60 * 1000)}`);

    console.log('\n⏳ Waiting for auto-completion (this may take up to 30 seconds)...');
    
    // Wait and check for auto-completion
    let attempts = 0;
    const maxAttempts = 40; // 40 * 3 seconds = 2 minutes max wait
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
      attempts++;
      
      const updatedPomodoro = await prisma.pomodoro.findUnique({
        where: { id: testPomodoro.id }
      });
      
      if (updatedPomodoro.status === 'COMPLETED') {
        console.log(`✅ Pomodoro auto-completed after ${attempts * 3} seconds!`);
        console.log(`   Status: ${updatedPomodoro.status}`);
        console.log(`   End time: ${updatedPomodoro.endTime}`);
        console.log(`   Summary: ${updatedPomodoro.summary || 'None'}`);
        
        // Verify the end time is correct
        const expectedEndTime = new Date(testPomodoro.startTime.getTime() + testPomodoro.duration * 60 * 1000);
        const actualEndTime = updatedPomodoro.endTime;
        const timeDiff = Math.abs(actualEndTime.getTime() - expectedEndTime.getTime());
        
        if (timeDiff < 5000) { // Within 5 seconds is acceptable
          console.log('✅ End time is accurate!');
        } else {
          console.log(`⚠️  End time differs by ${timeDiff}ms from expected`);
        }
        
        break;
      } else if (attempts % 10 === 0) {
        console.log(`   Still waiting... (${attempts * 3}s elapsed, status: ${updatedPomodoro.status})`);
      }
    }
    
    if (attempts >= maxAttempts) {
      console.log('❌ Pomodoro did not auto-complete within the expected time');
      
      // Check current status
      const finalPomodoro = await prisma.pomodoro.findUnique({
        where: { id: testPomodoro.id }
      });
      console.log(`   Final status: ${finalPomodoro.status}`);
      console.log(`   Current time: ${new Date()}`);
      console.log(`   Expected completion: ${new Date(testPomodoro.startTime.getTime() + testPomodoro.duration * 60 * 1000)}`);
    }

    // Clean up test data
    console.log('\n🧹 Cleaning up test data...');
    await prisma.pomodoro.delete({ where: { id: testPomodoro.id } });
    console.log('✅ Test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});