#!/bin/bash
#
# Habit Tracking Module — Pipeline 配置
#
# 用法:
#   ./scripts/run-pipeline.sh .kiro/specs/habit-tracking/pipeline.config.sh
#   ./scripts/run-pipeline.sh .kiro/specs/habit-tracking/pipeline.config.sh task1_3
#   ./scripts/run-pipeline.sh .kiro/specs/habit-tracking/pipeline.config.sh --dry
#

# ===== 基本配置 =====
PIPELINE_BRANCH="feature/habit-tracking"
PIPELINE_TASKS_MD=".kiro/specs/habit-tracking/tasks.md"
PIPELINE_DESIGN_MD=".kiro/specs/habit-tracking/design.md"

# 全部使用 @section 自动生成 prompt
# PIPELINE_PROMPTS_DIR 不设置

# ===== 测试命令 =====
PIPELINE_TEST_CMDS=(
  "npm test"
  "npx tsc --noEmit"
)

# ===== 撞墙策略 =====
PIPELINE_MAX_RETRIES=2
PIPELINE_MODULE_TIMEOUT=3600
PIPELINE_ON_BLOCK="stop"

# ===== 已知 Flaky 测试 =====
PIPELINE_KNOWN_FLAKY=()

# ===== 额外上下文 =====
PIPELINE_EXTRA_CONTEXT=(
  ".kiro/specs/habit-tracking/requirements.md"
)

# ===== 模块定义 =====
# 格式: "模块ID:@tasks.md中的Section标题:完成标记"
# @前缀 = 自动从 tasks.md 的 section + design.md 生成 prompt
#
# Phase 1: 最小可用版本（11 个 task，按依赖顺序）
# 依赖链: 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6
#                                 1.4 → 1.7 → 1.8
#                                 1.4 + 1.5 → 1.9 → 1.10
#                                 1.6 + 1.8 + 1.10 → 1.11
PIPELINE_MODULES=(
  "task1_1:@Task 1.1\: Prisma Schema + DB:1.1"
  "task1_2:@Task 1.2\: HabitStatsService — 纯函数统计计算:1.2"
  "task1_3:@Task 1.3\: HabitService — CRUD + 完成记录:1.3"
  "task1_4:@Task 1.4\: tRPC Router + 注册:1.4"
  "task1_5:@Task 1.5\: Socket 广播 + EXECUTE 命令:1.5"
  "task1_6:@Task 1.6\: 提醒服务（服务端 cron）:1.6"
  "task1_7:@Task 1.7\: Web UI — Dashboard 今日习惯 + 创建:1.7"
  "task1_8:@Task 1.8\: Web UI — 习惯列表页 + 提醒通知:1.8"
  "task1_9:@Task 1.9\: iOS — Store + API + 今日习惯:1.9"
  "task1_10:@Task 1.10\: iOS — 创建/列表/编辑 + 本地提醒:1.10"
  "task1_11:@Task 1.11\: Phase 1 集成测试:1.11"
)
