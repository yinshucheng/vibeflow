#!/bin/bash
#
# AI Chat Feature — Pipeline 配置
#
# 用法:
#   ./scripts/run-pipeline.sh docs/ai-chat-design/pipeline.config.sh
#   ./scripts/run-pipeline.sh docs/ai-chat-design/pipeline.config.sh s1
#   ./scripts/run-pipeline.sh docs/ai-chat-design/pipeline.config.sh --dry
#

# ===== 基本配置 =====
PIPELINE_BRANCH="feature/f2-llm-engine"
PIPELINE_TASKS_MD="docs/ai-chat-design/tasks.md"
PIPELINE_PROMPTS_DIR="scripts/prompts/ai-chat"
PIPELINE_LOG_FILE="scripts/logs/ai-chat-pipeline.log"

# ===== 测试命令 =====
# 主项目测试 (Vitest)
# 如需验证 iOS 测试，取消下面注释
PIPELINE_TEST_CMDS=(
  "npm test"
  # "cd vibeflow-ios && npx jest"
)

# ===== 撞墙策略 =====
PIPELINE_MAX_RETRIES=2           # 最大重试次数 (含首次执行)
PIPELINE_MODULE_TIMEOUT=3600     # 单模块超时 (秒, 默认 60min)
PIPELINE_ON_BLOCK="stop"         # stop | skip | notify

# ===== 已知 Flaky 测试 =====
# 这些测试失败时不计入模块失败判定
PIPELINE_KNOWN_FLAKY=(
  "mode-quit-behavior.property.ts"
  "heartbeat-interval.property.ts"
  "demo-mode-enforcement-suspension.property.ts"
  "state-restriction.property.ts"
)

# ===== 模块定义 =====
# 格式: "模块ID:prompt文件:tasks.md检测标记"
PIPELINE_MODULES=(
  "f6:f6.md:F6.1"
  "f7:f7.md:F7.1"
  "f8:f8.md:F8.1"
  "s1:s1.md:S1.1"
  "s2-s3:s2-s3.md:S2.1"
  "s4-s5:s4-s5.md:S4.1"
  "s6-s7:s6-s7.md:S6.1"
  "s8-s9-s10:s8-s9-s10.md:S8.1"
)
