#!/bin/bash
#
# iOS Screen Time API 集成 — Pipeline 配置
#
# 用法:
#   ./scripts/run-pipeline.sh .kiro/specs/ios-screen-time/pipeline.config.sh
#   ./scripts/run-pipeline.sh .kiro/specs/ios-screen-time/pipeline.config.sh task3
#   ./scripts/run-pipeline.sh .kiro/specs/ios-screen-time/pipeline.config.sh --dry
#

# ===== 基本配置 =====
PIPELINE_BRANCH="feature/ios-screen-time"
PIPELINE_TASKS_MD=".kiro/specs/ios-screen-time/tasks.md"
PIPELINE_DESIGN_MD=".kiro/specs/ios-screen-time/design.md"

# 不需要预写 prompt 文件 — 全部使用 @section 自动生成
# PIPELINE_PROMPTS_DIR 不设置

# ===== 测试命令 =====
PIPELINE_TEST_CMDS=(
  "cd vibeflow-ios && npx jest"
)

# ===== 撞墙策略 =====
PIPELINE_MAX_RETRIES=2
PIPELINE_MODULE_TIMEOUT=3600
PIPELINE_ON_BLOCK="stop"

# ===== 已知 Flaky 测试 =====
PIPELINE_KNOWN_FLAKY=()

# ===== 额外上下文 =====
PIPELINE_EXTRA_CONTEXT=(
  "vibeflow-ios/CLAUDE.md"
)

# ===== 模块定义 =====
# 格式: "模块ID:@tasks.md中的Section标题:完成标记"
# @前缀 = 自动从 tasks.md 的 section 生成 prompt，无需预写 prompt 文件
# [HUMAN] 任务会在 prompt 中被标记为跳过，AI 只实现 [AI] 任务
#
# 注意: Phase 0 全是 [HUMAN] 任务，不纳入 pipeline
PIPELINE_MODULES=(
  "task1:@Task 1\: App Group 基础设施:1.1"
  "task2:@Task 2\: FamilyActivityPicker 模态弹出:2.1"
  "task3:@Task 3\: Native Module 接口扩展 + Service 链路一起改:3.1"
  "task4:@Task 4\: Settings 页面交互:4.1"
  "task5:@Task 5\: Native 精细阻断实现:5.1"
  "task6:@Task 6\: ShieldConfiguration Extension:6.2"
  "task7:@Task 7\: DeviceActivityMonitor Extension:7.2"
  "task8:@Task 8\: 睡眠调度集成:8.1"
  "task9:@Task 9\: StatusScreen 阻断信息展示:9.1"
  "task10:@Task 10\: 错误处理和边界情况:10.1"
  "task11:@Task 11\: 测试:11.1"
  "task12:@Task 12\: Expo Prebuild 兼容:12.2"
)
