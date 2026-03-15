#!/bin/bash
#
# Desktop REST Enforcement — Pipeline 配置
#
# 用法:
#   ./scripts/run-pipeline.sh .kiro/specs/desktop-rest-enforcement/pipeline.config.sh
#   ./scripts/run-pipeline.sh .kiro/specs/desktop-rest-enforcement/pipeline.config.sh t3
#   ./scripts/run-pipeline.sh .kiro/specs/desktop-rest-enforcement/pipeline.config.sh --dry
#

# ===== 基本配置 =====
PIPELINE_BRANCH="feature/desktop-rest-enforcement"
PIPELINE_TASKS_MD=".kiro/specs/desktop-rest-enforcement/tasks.md"
PIPELINE_DESIGN_MD=".kiro/specs/desktop-rest-enforcement/design.md"

# ===== 测试命令 =====
PIPELINE_TEST_CMDS=(
  "npm test"
)

# ===== 撞墙策略 =====
PIPELINE_MAX_RETRIES=3
PIPELINE_MODULE_TIMEOUT=3600
PIPELINE_ON_BLOCK="skip"

# ===== 已知 Flaky 测试 =====
PIPELINE_KNOWN_FLAKY=(
  "grace-period-bypass.property.ts"
  "skip-token-quit-consumption.property.ts"
  "test-data-isolation.property.ts"
  "demo-mode-duration.property.ts"
  "chat.service.test.ts"
)

# ===== 额外上下文 =====
PIPELINE_EXTRA_CONTEXT=(
  "CLAUDE.md"
)

# ===== 模块定义 =====
# Phase 1-5 自动化，Phase 6 (测试验证) 部分自动化
#
# 格式: "模块ID:@tasks.md中的Section标题:完成标记"
# 完成标记 (marker) 必须出现在 [x] 行上，is_done 检查: grep "\[x\].*marker"
# 使用每个 task 首个子任务的唯一关键词作为 marker
PIPELINE_MODULES=(
  # Phase 1: Types & Server Policy
  "t1:@Task 1\: Add RestEnforcementPolicy type to octopus.ts:RestEnforcementPolicy"
  "t2:@Task 2\: Add getActiveGrace() and getGraceInfo() to RestEnforcementService:getActiveGrace"
  "t3:@Task 3\: Add REST enforcement to compilePolicy():restEnforcement.*when state"
  "t4:@Task 4\: Create rest-enforcement tRPC router:requestGrace.*protectedProcedure"

  # Phase 2: Desktop RestEnforcer Module
  "t5:@Task 5\: Add createRestTimeMonitor() factory to AppMonitor:createRestTimeMonitor"
  "t6:@Task 6\: Create RestEnforcer module:rest-enforcer.ts"
  "t7:@Task 7\: Add PolicyRestEnforcement type to desktop types:PolicyRestEnforcement"
  "t8:@Task 8\: Integrate RestEnforcer in main.ts:handleRestEnforcementPolicyUpdate"

  # Phase 3: Settings UI
  "t9:@Task 9\: Create RestEnforcementSettings component:rest-enforcement-settings.tsx"
  "t10:@Task 10\: Integrate settings in page:RestEnforcementSettings"

  # Phase 4: OVER_REST Investigation & Fix
  "t11:@Task 11\: Add diagnostic logging to OVER_REST pipeline:checkOverRestStatus"
  "t12:@Task 12\: Verify OVER_REST end-to-end flow:OVER_REST"
  "t13:@Task 13\: Fix identified OVER_REST bugs:root cause"

  # Phase 5: Health Limit Notifications
  "t14:@Task 14\: Add healthLimit to policy compilation:healthLimitService"
  "t15:@Task 15\: Desktop health limit notifications:lastHealthLimitNotified"

  # Phase 6: Testing & Validation
  "t16:@Task 16\: Property tests for REST enforcement policy:Property test"
  # Task 17 (integration verification) is manual — not included
)
