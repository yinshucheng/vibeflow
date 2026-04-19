#!/bin/bash
#
# Auth Activation & Skill API — Pipeline 配置
#
# 用法:
#   ./scripts/run-pipeline.sh .kiro/specs/auth-and-skill-api/pipeline.config.sh
#   ./scripts/run-pipeline.sh .kiro/specs/auth-and-skill-api/pipeline.config.sh task2
#   ./scripts/run-pipeline.sh .kiro/specs/auth-and-skill-api/pipeline.config.sh --dry
#
# 注意：
#   - Phase 3 (iOS/Desktop) 需要真机验证，不在 pipeline 中
#   - Phase 5 (Skill 文件编写) 是纯文档，不在 pipeline 中
#   - Checkpoint task (4, 7, 10, 14, 17) 需要手动验证，不在 pipeline 中
#

# ===== 基本配置 =====
PIPELINE_BRANCH="feature/auth-and-skill-api"
PIPELINE_TASKS_MD=".kiro/specs/auth-and-skill-api/tasks.md"
PIPELINE_DESIGN_MD=".kiro/specs/auth-and-skill-api/design.md"

# 全部使用 @section 自动生成 prompt
# PIPELINE_PROMPTS_DIR 不设置

# ===== 测试命令 =====
PIPELINE_TEST_CMDS=(
  "npx tsc --noEmit"
  "npm test"
)

# ===== 撞墙策略 =====
PIPELINE_MAX_RETRIES=2
PIPELINE_MODULE_TIMEOUT=3600
PIPELINE_ON_BLOCK="stop"

# ===== 已知 Flaky 测试 =====
PIPELINE_KNOWN_FLAKY=()

# ===== 额外上下文 =====
PIPELINE_EXTRA_CONTEXT=(
  ".kiro/specs/auth-and-skill-api/requirements.md"
)

# ===== 模块定义 =====
# 格式: "模块ID:@tasks.md中的Section标题:完成标记"
#
# Phase 1: 数据迁移准备 + 服务端改造
#   task1 (迁移脚本) → task2 (ApiToken 扩展) → task3 (服务端认证改造)
#   task2 和 task3 可并行但 pipeline 串行更安全
#
# Phase 2: Web + Extension
#   task5 (Web) → task6 (Extension)
#
# Phase 3: iOS + Desktop — 需真机验证，不在 pipeline 中
#
# Phase 4: API Key + MCP + REST Adapter
#   task11 (API Key 管理) → task12 (MCP 统一) → task13 (REST Adapter)
#   task11.3 (Scope 全面应用) 工作量最大
#
# Phase 5: Skill 文件 — 纯文档，不在 pipeline 中

PIPELINE_MODULES=(
  # === Phase 1: 服务端基础 ===
  "task1:@1. 数据迁移脚本:1.1"
  "task2:@2. ApiToken 模型扩展:2.1"
  "task3:@3. 服务端认证改造:3.1"

  # === Phase 2: Web + Extension ===
  "task5:@5. Web 客户端认证启用:5.1"
  "task6:@6. Extension 认证:6.1"

  # === Phase 4: API Key + MCP + REST ===
  "task11_1:@11. API Key 管理:11.1"
  "task11_3:@11. API Key 管理:11.3"
  "task11_4:@11. API Key 管理:11.4"
  "task12:@12. MCP 认证统一:12.1"
  "task13:@13. Skill REST Adapter:13.1"
)
