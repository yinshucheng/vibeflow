#!/bin/bash
#
# Dashboard Command Center — Pipeline 配置
#
# 用法:
#   ./scripts/run-pipeline.sh .kiro/specs/dashboard-command-center/pipeline.config.sh
#   ./scripts/run-pipeline.sh .kiro/specs/dashboard-command-center/pipeline.config.sh phase2
#   ./scripts/run-pipeline.sh .kiro/specs/dashboard-command-center/pipeline.config.sh --dry
#

# ===== 基本配置 =====
PIPELINE_BRANCH="feature/dashboard-command-center"
PIPELINE_TASKS_MD=".kiro/specs/dashboard-command-center/tasks.md"
PIPELINE_DESIGN_MD=".kiro/specs/dashboard-command-center/design.md"

# 不需要预写 prompt 文件 — 全部使用 @section 自动生成
# PIPELINE_PROMPTS_DIR 不设置

# ===== 测试命令 =====
PIPELINE_TEST_CMDS=(
  "npm test"
  "npm run build"
)

# ===== 撞墙策略 =====
PIPELINE_MAX_RETRIES=2
PIPELINE_MODULE_TIMEOUT=3600
PIPELINE_ON_BLOCK="stop"

# ===== 已知 Flaky 测试 =====
PIPELINE_KNOWN_FLAKY=()

# ===== 额外上下文 =====
PIPELINE_EXTRA_CONTEXT=()

# ===== 模块定义 =====
# 格式: "模块ID:@tasks.md中的Section标题:完成标记"
# @前缀 = 自动从 tasks.md 的 section 生成 prompt，无需预写 prompt 文件
#
# Phase 依赖关系:
#   Phase 1 (API) → Phase 2 (TaskRow) → Phase 3 (DetailPanel) → Phase 5 (TodayTaskList)
#   Phase 2 (TaskRow) → Phase 4 (FocusZone)
#   Phase 3,4,5 → Phase 6 (Dashboard重构)
#   Phase 6 → Phase 7 (质量验证)
PIPELINE_MODULES=(
  "phase1:@Phase 1\: API 准备:1.1"
  "phase2:@Phase 2\: TaskRow 组件（全局通用任务行）:2.1"
  "phase3:@Phase 3\: TaskDetailPanel 组件（右侧滑出详情栏）:3.1"
  "phase4:@Phase 4\: FocusZone 组件:4.1"
  "phase5:@Phase 5\: TodayTaskList 组件:5.1"
  "phase6:@Phase 6\: Dashboard 页面重构:6.1"
  "phase7:@Phase 7\: 质量验证:7.1"
)
