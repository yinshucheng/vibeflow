#!/bin/bash
#
# AI Chat 待办任务 — Pipeline 配置
#
# 包含: C1-C2 验收审计 + D1-D4 新特性
# (A1-A5, B1 已手动完成)
#
# 用法:
#   ./scripts/run-pipeline.sh docs/ai-chat-design/pending-pipeline.config.sh
#   ./scripts/run-pipeline.sh docs/ai-chat-design/pending-pipeline.config.sh d1
#   ./scripts/run-pipeline.sh docs/ai-chat-design/pending-pipeline.config.sh --dry
#

# ===== 基本配置 =====
PIPELINE_BRANCH="feature/f2-llm-engine"
PIPELINE_TASKS_MD="docs/ai-chat-design/pending-tasks.md"
PIPELINE_PROMPTS_DIR="scripts/prompts/pending"
PIPELINE_LOG_FILE="scripts/logs/pending-tasks-pipeline.log"

# ===== 测试命令 =====
PIPELINE_TEST_CMDS=(
  "npm test"
)

# ===== 撞墙策略 =====
PIPELINE_MAX_RETRIES=2
PIPELINE_MODULE_TIMEOUT=3600     # 60min per module
PIPELINE_ON_BLOCK="skip"         # skip blocked modules, continue with next

# ===== 已知 Flaky 测试 =====
PIPELINE_KNOWN_FLAKY=(
  "mode-quit-behavior.property.ts"
  "heartbeat-interval.property.ts"
  "demo-mode-enforcement-suspension.property.ts"
  "state-restriction.property.ts"
  "mcp-resources.property.ts"
  "ai-trigger.service.test.ts"
  "chat-triggers-cron.test.ts"
  "chat-triggers-state.test.ts"
  "chat-summary.test.ts"
)

# ===== 模块定义 =====
# 格式: "模块ID:prompt文件:pending-tasks.md中的检测标记"
#
# C 系列: 验收审计（研究性质，不改代码）
# D 系列: 新特性实现
PIPELINE_MODULES=(
  "c1:c1.md:C1"
  "c2:c2.md:C2"
  "d1:d1.md:D1"
  "d2:d2.md:D2"
  "d3:d3.md:D3"
  "d4:d4.md:D4"
)
