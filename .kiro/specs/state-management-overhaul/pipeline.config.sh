#!/bin/bash
#
# 状态管理系统重构 — Pipeline 配置
#
# 用法:
#   ./scripts/run-pipeline.sh .kiro/specs/state-management-overhaul/pipeline.config.sh
#   ./scripts/run-pipeline.sh .kiro/specs/state-management-overhaul/pipeline.config.sh p2_1
#   ./scripts/run-pipeline.sh .kiro/specs/state-management-overhaul/pipeline.config.sh --dry
#

# ===== 基本配置 =====
PIPELINE_BRANCH="feature/state-management-overhaul"
PIPELINE_TASKS_MD=".kiro/specs/state-management-overhaul/tasks.md"
PIPELINE_DESIGN_MD=".kiro/specs/state-management-overhaul/design.md"

# 不需要预写 prompt 文件 — 全部使用 @section 自动生成
# PIPELINE_PROMPTS_DIR 不设置

# ===== 测试命令 =====
PIPELINE_TEST_CMDS=(
  "npm test"
  "npm run build"
)

# ===== 撞墙策略 =====
PIPELINE_MAX_RETRIES=3
PIPELINE_MODULE_TIMEOUT=3600
PIPELINE_ON_BLOCK="stop"

# ===== 已知 Flaky 测试 =====
PIPELINE_KNOWN_FLAKY=()

# ===== 额外上下文 =====
PIPELINE_EXTRA_CONTEXT=(
  ".kiro/specs/state-management-overhaul/requirements.md"
)

# ===== 模块定义 =====
# 格式: "模块ID:@tasks.md中的Section标题:完成标记"
#
# Phase 1: 基础设施（不改变外部行为）
# Phase 2: 引擎上线 + 调用方迁移
# Phase 3: 清理旧代码 + 前端适配
# Phase 4: Airlock 移除
PIPELINE_MODULES=(
  # Phase 1: 基础设施
  "p1_1:@1.1 Schema 变更:1.1"
  "p1_2:@1.2 工具函数:1.2"
  "p1_3:@1.3 重写 XState 状态机:1.3"
  "p1_4:@1.4 StateEngine 骨架:1.4"

  # Phase 2: 引擎上线 + 调用方迁移
  "p2_1:@2.1 StateEngine 完整实现:2.1"
  "p2_2:@2.2 迁移 pomodoro.start（tRPC）:2.2"
  "p2_3:@2.3 迁移 pomodoro.complete（tRPC）:2.3"
  "p2_4:@2.4 迁移 pomodoro.abort + interrupt（tRPC）:2.4"
  "p2_5:@2.5 迁移 pomodoro.startTaskless（tRPC）:2.5"
  "p2_6:@2.6 迁移 Scheduler completeExpiredPomodoros:2.6"
  "p2_7:@2.7 迁移 Socket POMODORO_START handler:2.7"
  "p2_8:@2.8 迁移 chatToolsService:2.8"
  "p2_9:@2.9 迁移 dailyReset:2.9"
  "p2_10:@2.10 OVER_REST 触发机制:2.10"
  "p2_11:@2.11 标记旧函数 deprecated:2.11"
  "p2_12:@2.12 Phase 2 完整验证:2.12"

  # Phase 3: 清理旧代码 + 前端适配 + iOS 适配
  "p3_1:@3.1 删除旧服务端代码:3.1"
  "p3_2:@3.2 getOrCreateToday 适配:3.2"
  "p3_3:@3.3 前端兼容层:3.3"
  "p3_4:@3.4 前端状态值替换:3.4"
  "p3_5:@3.5 服务端 Policy 广播适配:3.5"
  "p3_6:@3.6 iOS 端适配 (vibeflow-ios):3.6"
  "p3_7:@3.7 Phase 3 完整验证:3.7"

  # Phase 4: Airlock 移除
  "p4_1:@4.1 删除 Airlock 服务端代码:4.1"
  "p4_2:@4.2 删除 Airlock 前端代码:4.2"
  "p4_3:@4.3 删除 Extension LOCKED 逻辑:4.3"
  "p4_4:@4.4 Top 3 降级为可选功能:4.4"
  "p4_5:@4.5 清理测试:4.5"
  "p4_6:@4.6 Phase 4 完整验证:4.6"
)
