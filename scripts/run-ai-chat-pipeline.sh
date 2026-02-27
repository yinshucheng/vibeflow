#!/bin/bash
#
# AI Chat 自动化开发管线
#
# 用法:
#   ./scripts/run-ai-chat-pipeline.sh              # 从第一个未完成的模块开始
#   ./scripts/run-ai-chat-pipeline.sh f7           # 从 f7 开始
#   ./scripts/run-ai-chat-pipeline.sh --dry        # 只打印计划，不执行
#   ./scripts/run-ai-chat-pipeline.sh s1 --dry     # 从 s1 开始预览
#
# 每个模块:
#   1. 检查是否已完成 (tasks.md 中有 [x])
#   2. 已完成则跳过
#   3. 调用 claude --print 执行
#   4. 跑 npm test 验证
#   5. 失败则重试一次 (让 claude 修复)
#   6. 仍失败则停止，等人工介入
#

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROMPTS_DIR="$PROJECT_DIR/scripts/prompts"
TASKS_MD="$PROJECT_DIR/docs/ai-chat-design/tasks.md"
LOG_FILE="$PROJECT_DIR/scripts/session-log.txt"
BRANCH="feature/f2-llm-engine"

# 模块定义: id → prompt 文件 → tasks.md 中的检测标记
declare -a MODULES=(
  "f6:f6.md:F6.1"
  "f7:f7.md:F7.1"
  "f8:f8.md:F8.1"
  "s1:s1.md:S1.1"
  "s2-s3:s2-s3.md:S2.1"
  "s4-s5:s4-s5.md:S4.1"
  "s6-s7:s6-s7.md:S6.1"
  "s8-s9-s10:s8-s9-s10.md:S8.1"
)

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

log() { echo -e "${BOLD}[$(date '+%H:%M:%S')]${NC} $*"; }
log_ok() { echo -e "${GREEN}✅${NC} $*"; }
log_fail() { echo -e "${RED}❌${NC} $*"; }
log_skip() { echo -e "${DIM}⏭️  $*${NC}"; }

# 检查模块是否已完成
is_done() {
  local marker="$1"
  grep -q "\[x\].*${marker}" "$TASKS_MD" 2>/dev/null
}

# 运行测试 (服务端)
run_tests() {
  cd "$PROJECT_DIR"
  log "${DIM}运行 npm test...${NC}"
  local tmp_file
  tmp_file=$(mktemp)
  npm test > "$tmp_file" 2>&1 && local exit_code=0 || local exit_code=$?
  tail -20 "$tmp_file" >> "$LOG_FILE"
  tail -5 "$tmp_file"
  rm -f "$tmp_file"
  return "$exit_code"
}

# 耗时格式化
format_duration() {
  local seconds=$1
  if [ "$seconds" -ge 60 ]; then
    printf "%dm%ds" $((seconds / 60)) $((seconds % 60))
  else
    printf "%ds" "$seconds"
  fi
}

# 执行单个模块
run_module() {
  local id="$1"
  local prompt_file="$2"
  local marker="$3"
  local module_start=$SECONDS

  log "${BOLD}${CYAN}===== 模块 ${id} =====${NC}"

  # 跳过已完成
  if is_done "$marker"; then
    log_skip "${id} 已完成，跳过"
    return 0
  fi

  # 第一次尝试
  log "执行 ${id} (第 1 次)..."
  echo "" >> "$LOG_FILE"
  echo "========================================" >> "$LOG_FILE"
  echo "--- ${id} started at $(date) ---" >> "$LOG_FILE"
  echo "========================================" >> "$LOG_FILE"

  if ! cat "$PROMPTS_DIR/$prompt_file" | $CLAUDE_CMD -p --verbose --dangerously-skip-permissions \
    >> "$LOG_FILE" 2>&1; then
    log "${YELLOW}claude 进程非零退出，继续检查测试...${NC}"
  fi

  # 验证: npm test 通过 + tasks.md 中 checkbox 已更新
  log "验证 ${id}..."
  if run_tests && is_done "$marker"; then
    local elapsed=$(( SECONDS - module_start ))
    log_ok "${id} 测试通过 + checkbox 已更新 ($(format_duration $elapsed))"
    echo "--- ${id} PASSED at $(date) ($(format_duration $elapsed)) ---" >> "$LOG_FILE"
    return 0
  fi

  # 测试通过但 checkbox 没更新 → claude 可能没执行
  if ! is_done "$marker"; then
    log "${YELLOW}${id} 测试通过但 tasks.md checkbox 未更新，视为未完成${NC}"
  fi

  # 第二次尝试: 让 claude 修复
  log "${YELLOW}${id} 测试失败，尝试修复 (第 2 次)...${NC}"

  local fix_prompt="在 ${BRANCH} 分支上工作。上一次实现 ${id} 后 npm test 有失败。请先运行 npm test 查看失败输出，然后阅读相关代码，修复所有失败的测试。只修复问题，不要重新实现已有的功能。修复后确保 npm test 通过并 commit。"

  echo "--- ${id} FIX ATTEMPT at $(date) ---" >> "$LOG_FILE"

  local tmp_fix_prompt
  tmp_fix_prompt=$(mktemp)
  printf '%s' "$fix_prompt" > "$tmp_fix_prompt"

  if ! cat "$tmp_fix_prompt" | $CLAUDE_CMD -p --verbose --dangerously-skip-permissions \
    >> "$LOG_FILE" 2>&1; then
    log "${YELLOW}修复 claude 进程非零退出${NC}"
  fi
  rm -f "$tmp_fix_prompt"

  # 再次验证
  if run_tests && is_done "$marker"; then
    local elapsed=$(( SECONDS - module_start ))
    log_ok "${id} 修复后测试通过 ($(format_duration $elapsed))"
    echo "--- ${id} FIXED & PASSED at $(date) ($(format_duration $elapsed)) ---" >> "$LOG_FILE"
    return 0
  fi

  # 仍然失败
  local elapsed=$(( SECONDS - module_start ))
  log_fail "${id} 修复后仍失败，停止管线 ($(format_duration $elapsed))"
  echo "--- ${id} FAILED at $(date) ($(format_duration $elapsed)) ---" >> "$LOG_FILE"
  return 1
}

# ===== Main =====

cd "$PROJECT_DIR"

# 解析参数: 支持 --dry 在任意位置
START_FROM=""
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dry) DRY_RUN=true ;;
    *)     START_FROM="$arg" ;;
  esac
done

# 初始化日志
echo "" >> "$LOG_FILE"
echo "===== Pipeline started at $(date) =====" >> "$LOG_FILE"

log "${BOLD}AI Chat 开发管线${NC}"
log "分支: ${BRANCH}"
log "日志: scripts/session-log.txt"
if [ -n "$START_FROM" ]; then
  log "起始模块: ${START_FROM}"
fi
if [ "$DRY_RUN" = true ]; then
  log "${YELLOW}模式: Dry Run (仅预览)${NC}"
fi
echo ""

# Claude Code 命令: 优先使用 ccr code (Claude Code Router)，否则使用 claude
if command -v ccr &>/dev/null; then
  CLAUDE_CMD="ccr code"
elif command -v claude &>/dev/null; then
  CLAUDE_CMD="claude"
else
  log_fail "未找到 ccr 或 claude CLI"
  exit 1
fi

# 允许在 Claude Code 会话内嵌套调用
# 清除所有 Claude Code 相关环境变量，防止嵌套检测
unset CLAUDECODE CLAUDE_CODE_SSE_PORT CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC 2>/dev/null || true

log "CLI: ${CLAUDE_CMD}"

# 预览已完成/待执行模块
completed=0
pending=0
for entry in "${MODULES[@]}"; do
  IFS=':' read -r id _ marker <<< "$entry"
  if is_done "$marker"; then
    completed=$((completed + 1))
  else
    pending=$((pending + 1))
  fi
done
log "进度: ${GREEN}${completed} 已完成${NC} / ${YELLOW}${pending} 待执行${NC} / 共 ${#MODULES[@]} 个模块"
echo ""

# 主循环
started=false
if [ -z "$START_FROM" ]; then
  started=true
fi

pipeline_start=$SECONDS
modules_done=0

for entry in "${MODULES[@]}"; do
  IFS=':' read -r id prompt_file marker <<< "$entry"

  # 跳到指定起始模块
  if [ "$started" = false ]; then
    if [ "$id" = "$START_FROM" ]; then
      started=true
    else
      continue
    fi
  fi

  # Dry run 模式
  if [ "$DRY_RUN" = true ]; then
    if is_done "$marker"; then
      log_skip "${id} (已完成)"
    else
      log "📋 ${id} → ${prompt_file}"
    fi
    continue
  fi

  if ! run_module "$id" "$prompt_file" "$marker"; then
    log ""
    log_fail "管线在 ${id} 处停止。查看日志: scripts/session-log.txt"
    log "修复后重新运行: ./scripts/run-ai-chat-pipeline.sh ${id}"
    exit 1
  fi

  modules_done=$((modules_done + 1))
  echo ""
done

if [ "$DRY_RUN" = false ]; then
  total_elapsed=$(( SECONDS - pipeline_start ))
  log ""
  log_ok "${BOLD}管线完成！${NC} (${modules_done} 个模块, $(format_duration $total_elapsed))"
  log "运行 npm test 做最终验证"
  echo "===== Pipeline finished at $(date) ($(format_duration $total_elapsed)) =====" >> "$LOG_FILE"
fi
