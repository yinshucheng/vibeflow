#!/bin/bash
#
# Friend Sharing MVP — Pipeline 配置
#
# 用法:
#   ./scripts/run-pipeline.sh .kiro/specs/friend-sharing-mvp/pipeline.config.sh
#   ./scripts/run-pipeline.sh .kiro/specs/friend-sharing-mvp/pipeline.config.sh p1_2
#   ./scripts/run-pipeline.sh .kiro/specs/friend-sharing-mvp/pipeline.config.sh --dry
#

# ===== 基本配置 =====
PIPELINE_BRANCH="feature/friend-sharing-mvp"
PIPELINE_TASKS_MD=".kiro/specs/friend-sharing-mvp/tasks.md"
PIPELINE_DESIGN_MD=".kiro/specs/friend-sharing-mvp/design.md"

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
# Phase 1-4 (自动化任务), Phase 5 (人工验收) 不纳入
#
# 格式: "模块ID:@tasks.md中的Section标题:完成标记"
PIPELINE_MODULES=(
  # Phase 1: 登录注册 + 认证集成
  "p1_1:@1.1 后端认证改造:1.1.1"
  "p1_2:@1.2 Checkpoint\: 后端认证:1.2.1"
  "p1_3:@1.3 前端页面:1.3.1"
  "p1_4:@1.4 路由守卫 + 全局错误处理:1.4.1"
  "p1_5:@1.5 Checkpoint\: Web 端 E2E:1.5.1"

  # Phase 2: 默认账号迁移脚本
  "p2_1:@2.1 迁移脚本:2.1.1"

  # Phase 3: 数据隔离审计
  "p3_1:@3.1 Service 审计:3.1.1"
  "p3_2:@3.2 跨用户隔离测试:3.2.1"

  # Phase 4: 客户端代码适配
  "p4_1:@4.1 iOS 客户端认证:4.1.1"
  "p4_2:@4.2 iOS 分发配置（代码部分）:4.2.1"
  "p4_3:@4.3 Desktop 客户端认证:4.3.1"
  "p4_4:@4.4 Browser Extension 适配:4.4.1"
  "p4_5:@4.5 安装文档:4.5.1"
)
