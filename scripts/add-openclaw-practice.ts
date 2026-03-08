#!/usr/bin/env ts-node
/**
 * Script to add or update "OpenClaw 实践" project with practice tasks
 */

import { PrismaClient, TaskStatus, Priority } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get dev user (or first user)
  const user = await prisma.user.findFirst({
    where: {
      email: 'dev@vibeflow.local'
    }
  });

  if (!user) {
    console.error('❌ No user found. Please ensure dev user exists.');
    process.exit(1);
  }

  console.log(`✅ Found user: ${user.email} (${user.id})`);

  // Check if "OpenClaw 实践" project already exists
  let project = await prisma.project.findFirst({
    where: {
      userId: user.id,
      title: {
        contains: 'OpenClaw'
      }
    },
    include: {
      tasks: true
    }
  });

  const isNewProject = !project;

  if (!project) {
    // Create new project
    project = await prisma.project.create({
      data: {
        title: 'OpenClaw 实践',
        deliverable: '通过实际项目实践 OpenClaw 的各种能力，包括自动化运营、数据分析、AI 集成等',
        userId: user.id,
      },
      include: {
        tasks: true
      }
    });
    console.log(`✅ Created new project: ${project.title}`);
  } else {
    console.log(`ℹ️  Project already exists: ${project.title}`);
    console.log(`   Existing tasks: ${project.tasks.length}`);
  }

  // Define practice tasks
  const practiceTasks = [
    {
      title: '自动运营小红书账号',
      description: '使用 OpenClaw 实现小红书账号的自动化运营',
      subtasks: [
        '调研小红书 API 和自动化方案（网页自动化 vs API）',
        '实现内容发布自动化（图文、视频）',
        '实现定时发布功能',
        '添加内容生成功能（使用 LLM 生成文案）',
        '实现互动管理（评论回复、点赞）',
        '添加数据统计和分析功能',
        '测试和优化自动化流程'
      ]
    },
    {
      title: '股市行情分析和监控',
      description: '构建一个股市行情分析系统，实现自动化数据采集、分析和预警',
      subtasks: [
        '选择数据源（新浪财经、东方财富、Yahoo Finance API）',
        '实现实时行情数据采集',
        '构建技术指标分析（MA、MACD、RSI、KDJ）',
        '实现 K 线形态识别',
        '添加基本面数据分析（财报、公告）',
        '构建预警系统（价格突破、异常波动）',
        '实现可视化看板（使用 vibeflow-extension）',
        '添加回测功能验证策略效果'
      ]
    },
    {
      title: '智能日记助手',
      description: '基于 OpenClaw 的智能日记记录和分析系统',
      subtasks: [
        '设计日记数据结构',
        '实现语音转文字输入（使用 Whisper）',
        '添加情绪分析功能',
        '实现自动标签和分类',
        '构建日记摘要和回顾功能',
        '添加趋势分析（情绪变化、活动频率）',
        '集成到 vibeflow 每日总结流程'
      ]
    },
    {
      title: '自动化测试助手',
      description: '使用 OpenClaw 辅助自动化测试编写和执行',
      subtasks: [
        '调研现有自动化测试框架',
        '实现测试用例生成（基于需求文档）',
        '添加测试代码生成功能',
        '实现测试执行和结果分析',
        '构建测试报告自动生成',
        '添加回归测试智能推荐'
      ]
    },
    {
      title: '智能代码审查助手',
      description: '基于 OpenClaw 的代码审查和优化建议系统',
      subtasks: [
        '集成 Git hooks 拦截代码提交',
        '实现代码静态分析',
        '添加代码质量评分',
        '实现优化建议生成',
        '构建 PR 自动审查功能',
        '添加安全漏洞检测'
      ]
    }
  ];

  // Create tasks
  console.log('\n📝 Adding practice tasks...\n');
  
  for (const taskData of practiceTasks) {
    // Check if main task already exists
    const existingTask = await prisma.task.findFirst({
      where: {
        projectId: project.id,
        title: taskData.title
      }
    });

    if (existingTask) {
      console.log(`⏭️  Task already exists: ${taskData.title}`);
      continue;
    }

    // Create main task
    const mainTask = await prisma.task.create({
      data: {
        title: taskData.title,
        status: TaskStatus.TODO,
        priority: Priority.P2,
        projectId: project.id,
        userId: user.id,
        estimatedMinutes: 480, // 8 hours per main task
      }
    });

    console.log(`✅ Created task: ${taskData.title}`);

    // Create subtasks
    for (let i = 0; i < taskData.subtasks.length; i++) {
      await prisma.task.create({
        data: {
          title: taskData.subtasks[i],
          status: TaskStatus.TODO,
          priority: Priority.P2,
          projectId: project.id,
          userId: user.id,
          parentId: mainTask.id,
          estimatedMinutes: 60, // 1 hour per subtask
          sortOrder: i
        }
      });
    }
    console.log(`   └─ Added ${taskData.subtasks.length} subtasks`);
  }

  // Get final project state
  const finalProject = await prisma.project.findUnique({
    where: { id: project.id },
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

  console.log('\n📊 Project Summary:');
  console.log(`   Title: ${finalProject?.title}`);
  console.log(`   Total main tasks: ${finalProject?.tasks.length}`);
  console.log(`   Total subtasks: ${finalProject?.tasks.reduce((acc, t) => acc + t.subTasks.length, 0)}`);
  
  if (isNewProject) {
    console.log('\n🎉 New project created successfully!');
  } else {
    console.log('\n✨ Project updated successfully!');
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
