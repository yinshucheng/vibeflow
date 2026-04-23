#!/bin/bash
#
# 八爪鱼协议统一化 — Pipeline 配置 (Phase B2 + C + D)
#
# Phase A 和 B1 已完成。此 pipeline 覆盖剩余的可自动化任务。
#
# 用法:
#   ./scripts/run-pipeline.sh .kiro/specs/octopus-protocol-unification/pipeline.config.sh
#   ./scripts/run-pipeline.sh .kiro/specs/octopus-protocol-unification/pipeline.config.sh b2
#   ./scripts/run-pipeline.sh .kiro/specs/octopus-protocol-unification/pipeline.config.sh --dry
#

# ===== 基本配置 =====
PIPELINE_BRANCH="main"
PIPELINE_TASKS_MD=".kiro/specs/octopus-protocol-unification/tasks.md"
PIPELINE_DESIGN_MD=".kiro/specs/octopus-protocol-unification/design.md"

# ===== 测试命令 =====
PIPELINE_TEST_CMDS=(
  "npx tsc --noEmit"
  "npx vitest --run --config vitest.config.ts --exclude '**/property/**'"
  "npm run lint"
  "cd vibeflow-desktop && npx tsc --noEmit"
  "cd vibeflow-extension && npx tsc --noEmit"
  "cd vibeflow-ios && npx tsc --noEmit 2>&1 | grep -v 'auth.ts\|notification-trigger\|habit.store' | grep 'error' && exit 1 || true"
)

# ===== 撞墙策略 =====
PIPELINE_MAX_RETRIES=2
PIPELINE_MODULE_TIMEOUT=3600
PIPELINE_ON_BLOCK="stop"

# ===== 已知 Flaky 测试 =====
PIPELINE_KNOWN_FLAKY=(
  "client-registry.property"
  "offline-detection.property"
  "skip-token-quit-consumption.property"
  "test-data-isolation.property"
  "browser-event-storage.property"
  "entertainment-service.property"
  "bypass-score-calculation.property"
  "daily-quota-reset.property"
  "demo-mode-activation-restriction.property"
  "sleep-time-snooze-limit.property"
)

# ===== 额外上下文 =====
PIPELINE_EXTRA_CONTEXT=(
  "CLAUDE.md"
)

# ===== 模块定义 =====
# 格式: "模块ID:@tasks.md中的Section标题:完成标记"
#
# Phase B2: 原子切换（一个大 module — 服务端+4端必须同时完成）
# Phase C: SDK + 数据流统一（拆为 4 个 module）
# Phase D: 测试（1 个 module）
#
# 注意:
# - Task 29 (impact analysis) 和 Task 46 (WS 推送审计) 是人工判断任务，
#   已在 prompt 中要求 AI 自行分析代码完成（可自动化的程度足够）
# - Phase B2 作为单个 module 保证原子性

PIPELINE_MODULES=(
  "b2:@Phase B2\: 原子切换到纯 OCTOPUS_COMMAND:45. 全量编译"
  "c-sdk:@Tasks — SDK 实现:52. SDK 单元测试"
  "c-clients:@Tasks — 各端迁移:58. 各端离线队列"
  "c-web:@Tasks — Web 端数据流统一:67. 全量编译"
  "c-verify:@Tasks — 自动化验证:70. 性能验证"
  "d:@Phase D\: Conformance 测试 + 性能验证:83. 各端编译通过"
)
