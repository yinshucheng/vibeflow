#!/bin/bash
#
# 通用开发管线 — 批量执行 Claude Code 任务
#
# 用法:
#   ./scripts/run-pipeline.sh <config-file>              # 从第一个未完成的模块开始
#   ./scripts/run-pipeline.sh <config-file> f7           # 从 f7 开始
#   ./scripts/run-pipeline.sh <config-file> --dry        # 只打印计划，不执行
#   ./scripts/run-pipeline.sh <config-file> f7 --dry     # 从 f7 开始预览
#
# 模块定义格式 (在 config 的 PIPELINE_MODULES 数组中):
#
#   预写 prompt 模式:
#     "模块ID:prompt-file.md:marker"
#     例: "f6:f6.md:F6.1"
#     → 从 PIPELINE_PROMPTS_DIR/f6.md 读取 prompt
#
#   自动生成 prompt 模式 (无需预写 prompt 文件):
#     "模块ID:@Task Section Name:marker"
#     例: "task1:@Task 1\\: App Group 基础设施:1.1"
#     → 自动生成 prompt: 读 tasks.md 中该 section + design.md → 实现
#     注意: section 名中的冒号用 \: 转义
#
# 每个模块:
#   1. 检查是否已完成 (tasks.md 中有 [x])
#   2. 已完成则跳过
#   3. 调用 claude -p 执行 (预写 prompt 或自动生成)
#   4. 跑测试命令验证
#   5. 失败则检查是否 flaky → 撞墙检测 → 重试修复
#   6. 仍失败则按 PIPELINE_ON_BLOCK 策略处理
#
# 状态感知:
#   - pipeline-status.json: 实时进度快照
#   - macOS 通知: 每个模块完成/失败时推送
#   - 控制台 progress bar: 持续输出
#

set -euo pipefail

# ===== 颜色 =====
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# ===== 日志 =====
log()      { echo -e "${BOLD}[$(date '+%H:%M:%S')]${NC} $*"; }
log_ok()   { echo -e "${GREEN}✅${NC} $*"; }
log_fail() { echo -e "${RED}❌${NC} $*"; }
log_skip() { echo -e "${DIM}⏭️  $*${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }

# ===== 参数解析 =====
CONFIG_FILE=""
START_FROM=""
DRY_RUN=false

usage() {
  echo "用法: $0 <config-file> [start-module] [--dry]"
  echo ""
  echo "  config-file    pipeline 配置文件 (pipeline.config.sh)"
  echo "  start-module   从指定模块开始 (可选)"
  echo "  --dry          只预览，不执行"
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

for arg in "$@"; do
  case "$arg" in
    --dry) DRY_RUN=true ;;
    --help|-h) usage ;;
    *)
      if [ -z "$CONFIG_FILE" ] && [ -f "$arg" ]; then
        CONFIG_FILE="$arg"
      elif [ -z "$CONFIG_FILE" ]; then
        # 尝试从项目根目录解析
        SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
        PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
        if [ -f "$PROJECT_DIR/$arg" ]; then
          CONFIG_FILE="$PROJECT_DIR/$arg"
        else
          echo "错误: 找不到配置文件 '$arg'"
          exit 1
        fi
      else
        START_FROM="$arg"
      fi
      ;;
  esac
done

if [ -z "$CONFIG_FILE" ]; then
  echo "错误: 未指定配置文件"
  usage
fi

# ===== 加载配置 =====
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# 配置默认值
PIPELINE_BRANCH=""
PIPELINE_TASKS_MD=""
PIPELINE_DESIGN_MD=""           # 设计文档 (自动生成 prompt 时需要)
PIPELINE_PROMPTS_DIR=""         # 预写 prompt 目录 (使用 @section 模式时可省略)
PIPELINE_LOG_FILE=""
PIPELINE_TEST_CMDS=("npm test")
PIPELINE_MODULES=()
PIPELINE_KNOWN_FLAKY=()
PIPELINE_MAX_RETRIES=2
PIPELINE_MODULE_TIMEOUT=3600  # 60min in seconds
PIPELINE_ON_BLOCK="stop"      # stop | skip | notify
PIPELINE_STATUS_FILE="$PROJECT_DIR/scripts/pipeline-status.json"
PIPELINE_EXTRA_CONTEXT=()     # 额外需要阅读的文件 (如 CLAUDE.md, 子项目约定等)

# shellcheck source=/dev/null
source "$CONFIG_FILE"

# 验证必需配置
if [ -z "$PIPELINE_BRANCH" ]; then
  log_fail "配置缺失: PIPELINE_BRANCH"; exit 1
fi
if [ -z "$PIPELINE_TASKS_MD" ]; then
  log_fail "配置缺失: PIPELINE_TASKS_MD"; exit 1
fi
if [ ${#PIPELINE_MODULES[@]} -eq 0 ]; then
  log_fail "配置缺失: PIPELINE_MODULES 为空"; exit 1
fi

# 解析模块条目: "id:prompt_or_section:marker"
# section 名中的冒号用 \: 转义，需要特殊处理
parse_module_entry() {
  local entry="$1"
  local field="$2"  # id | prompt | marker

  # 用 python3 做可靠的解析 (处理 \: 转义)
  python3 -c "
import sys
entry = sys.argv[1]
# Split on unescaped colons: split on ':' but not '\:'
parts = []
current = ''
i = 0
while i < len(entry):
    if entry[i] == '\\\\' and i+1 < len(entry) and entry[i+1] == ':':
        current += ':'
        i += 2
    elif entry[i] == ':':
        parts.append(current)
        current = ''
        i += 1
    else:
        current += entry[i]
        i += 1
parts.append(current)

field = sys.argv[2]
if field == 'id':
    print(parts[0] if len(parts) > 0 else '')
elif field == 'prompt':
    print(parts[1] if len(parts) > 1 else '')
elif field == 'marker':
    print(parts[2] if len(parts) > 2 else '')
" "$entry" "$field"
}

# 检查是否有 @section 模块 → 需要 DESIGN_MD
has_auto_prompt=false
_prompt_or_section=""
for entry in "${PIPELINE_MODULES[@]}"; do
  _prompt_or_section=$(parse_module_entry "$entry" "prompt")
  if [[ "$_prompt_or_section" == @* ]]; then
    has_auto_prompt=true
    break
  fi
done

if [ "$has_auto_prompt" = true ] && [ -z "$PIPELINE_DESIGN_MD" ]; then
  log_fail "使用 @section 模式时必须配置 PIPELINE_DESIGN_MD"; exit 1
fi

# 有预写 prompt 模块时需要 PROMPTS_DIR
has_file_prompt=false
for entry in "${PIPELINE_MODULES[@]}"; do
  _prompt_or_section=$(parse_module_entry "$entry" "prompt")
  if [[ "$_prompt_or_section" != @* ]]; then
    has_file_prompt=true
    break
  fi
done

if [ "$has_file_prompt" = true ] && [ -z "$PIPELINE_PROMPTS_DIR" ]; then
  log_fail "使用预写 prompt 文件模式时必须配置 PIPELINE_PROMPTS_DIR"; exit 1
fi

# 解析为绝对路径
TASKS_MD="$PROJECT_DIR/$PIPELINE_TASKS_MD"
DESIGN_MD="${PIPELINE_DESIGN_MD:+$PROJECT_DIR/$PIPELINE_DESIGN_MD}"
PROMPTS_DIR="${PIPELINE_PROMPTS_DIR:+$PROJECT_DIR/$PIPELINE_PROMPTS_DIR}"
LOG_FILE="${PIPELINE_LOG_FILE:+$PROJECT_DIR/$PIPELINE_LOG_FILE}"
if [ -z "$LOG_FILE" ]; then
  # 从配置文件路径提取 spec 名称（父目录名）作为日志文件名
  _config_dir="$(dirname "$CONFIG_FILE")"
  _spec_name="$(basename "$_config_dir")"
  LOG_FILE="$PROJECT_DIR/scripts/logs/${_spec_name}-$(date '+%Y%m%d-%H%M%S').log"
fi
STATUS_FILE="$PIPELINE_STATUS_FILE"

# 确保日志目录存在
mkdir -p "$(dirname "$LOG_FILE")"

# ===== macOS 通知 =====
notify() {
  local title="$1"
  local message="$2"
  local sound="${3:-Glass}"
  osascript -e "display notification \"$message\" with title \"$title\" sound name \"$sound\"" 2>/dev/null || true
}

# ===== 耗时格式化 =====
format_duration() {
  local seconds=$1
  if [ "$seconds" -ge 3600 ]; then
    printf "%dh%dm%ds" $((seconds / 3600)) $((seconds % 3600 / 60)) $((seconds % 60))
  elif [ "$seconds" -ge 60 ]; then
    printf "%dm%ds" $((seconds / 60)) $((seconds % 60))
  else
    printf "%ds" "$seconds"
  fi
}

# ===== Progress Bar =====
progress_bar() {
  local current=$1
  local total=$2
  local module_id="$3"
  local phase="$4"
  local bar_width=20
  local filled=$(( current * bar_width / total ))
  local empty=$(( bar_width - filled ))

  local bar=""
  for ((i=0; i<filled; i++)); do bar+="█"; done
  for ((i=0; i<empty; i++)); do bar+="░"; done

  echo -e "${CYAN}[${current}/${total}]${NC} ${bar} ${BOLD}${module_id}${NC} ${DIM}${phase}${NC}"
}

# ===== Status File 管理 =====
# 初始化 status 中的 modules 数组
init_status() {
  local modules_json="["
  local first=true
  for entry in "${PIPELINE_MODULES[@]}"; do
    local id
    id=$(parse_module_entry "$entry" "id")
    if [ "$first" = true ]; then
      first=false
    else
      modules_json+=","
    fi
    modules_json+="{\"id\":\"$id\",\"status\":\"pending\",\"duration\":null,\"blocker\":null}"
  done
  modules_json+="]"

  cat > "$STATUS_FILE" <<EOF
{
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "config": "$CONFIG_FILE",
  "branch": "$PIPELINE_BRANCH",
  "current_module": null,
  "current_phase": null,
  "modules": $modules_json,
  "wall_clock": "0s",
  "last_test_output": null
}
EOF
}

# 更新 status 中某个模块的状态
update_module_status() {
  local module_id="$1"
  local status="$2"
  local duration="${3:-null}"
  local blocker="${4:-null}"

  if [ "$duration" != "null" ]; then
    duration="\"$duration\""
  fi
  if [ "$blocker" != "null" ]; then
    blocker="\"$(echo "$blocker" | sed 's/"/\\"/g')\""
  fi

  # 使用 python3 更新 JSON (macOS 自带)
  python3 -c "
import json, sys
with open('$STATUS_FILE', 'r') as f:
    data = json.load(f)
for m in data['modules']:
    if m['id'] == '$module_id':
        m['status'] = '$status'
        m['duration'] = $duration
        m['blocker'] = $blocker
        break
with open('$STATUS_FILE', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || true
}

# 更新 status 中的当前阶段
update_phase() {
  local module_id="$1"
  local phase="$2"
  local wall_clock="$3"

  python3 -c "
import json
with open('$STATUS_FILE', 'r') as f:
    data = json.load(f)
data['current_module'] = '$module_id' if '$module_id' != '' else None
data['current_phase'] = '$phase' if '$phase' != '' else None
data['wall_clock'] = '$wall_clock'
with open('$STATUS_FILE', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || true
}

# 更新 last_test_output
update_test_output() {
  local output_file="$1"
  python3 -c "
import json
with open('$output_file', 'r') as f:
    lines = f.readlines()
last_lines = ''.join(lines[-20:]) if len(lines) > 20 else ''.join(lines)
with open('$STATUS_FILE', 'r') as f:
    data = json.load(f)
data['last_test_output'] = last_lines
with open('$STATUS_FILE', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || true
}

# ===== tasks.md 完成检查 =====
is_done() {
  local marker="$1"
  grep -q "\[x\].*${marker}" "$TASKS_MD" 2>/dev/null
}

# ===== 自动生成 Prompt =====
# 从 tasks.md 的 section 名 + design.md 自动构建执行 prompt
generate_prompt() {
  local module_id="$1"
  local section_name="$2"  # 不含 @ 前缀

  local prompt=""
  prompt+="切到 ${PIPELINE_BRANCH} 分支。"
  prompt+=$'\n\n'

  # 引用 design doc
  if [ -n "$DESIGN_MD" ]; then
    prompt+="阅读 ${PIPELINE_DESIGN_MD} 了解技术设计。"
    prompt+=$'\n'
  fi

  # 引用 tasks.md 中的具体 section
  prompt+="阅读 ${PIPELINE_TASKS_MD} 中的「${section_name}」部分，实现其中所有标记为 [AI] 或无标记的任务。"
  prompt+=$'\n'
  prompt+="跳过标记为 [HUMAN] 的任务（这些会在后续人工验收中完成）。"
  prompt+=$'\n\n'

  # 额外上下文文件
  if [ ${#PIPELINE_EXTRA_CONTEXT[@]} -gt 0 ]; then
    prompt+="参考以下文件了解项目约定:"
    prompt+=$'\n'
    for ctx_file in "${PIPELINE_EXTRA_CONTEXT[@]}"; do
      prompt+="- ${ctx_file}"
      prompt+=$'\n'
    done
    prompt+=$'\n'
  fi

  # 通用指令
  prompt+="注意:"
  prompt+=$'\n'
  prompt+="- 遵循现有代码模式和项目约定 (参考 CLAUDE.md)"
  prompt+=$'\n'
  prompt+="- 完成后更新 ${PIPELINE_TASKS_MD} 中对应任务的 checkbox 为 [x]。**重要**：在该 section 最后一个 [x] 行末尾追加 HTML 注释标记，格式为 <!-- SECTION_NUMBER done -->（如 <!-- 2.3 done -->），SECTION_NUMBER 取自 section 标题的编号（如 '### 2.3 迁移...' 则写 '2.3'）。这是 pipeline 自动检测任务完成状态的必要标记。"
  prompt+=$'\n'
  prompt+="- 确保相关测试通过后 commit"
  prompt+=$'\n'

  printf '%s' "$prompt"
}

# ===== 获取模块的 prompt 内容 =====
# 返回 prompt 文本到 stdout
get_module_prompt() {
  local prompt_or_section="$1"
  local module_id="$2"

  if [[ "$prompt_or_section" == @* ]]; then
    # @section 模式: 自动生成
    local section_name="${prompt_or_section#@}"
    generate_prompt "$module_id" "$section_name"
  else
    # 文件模式: 读取预写 prompt
    cat "$PROMPTS_DIR/$prompt_or_section"
  fi
}

# ===== 运行测试 =====
run_tests() {
  cd "$PROJECT_DIR"
  local test_output
  test_output=$(mktemp)
  local all_passed=true

  for cmd in "${PIPELINE_TEST_CMDS[@]}"; do
    log "${DIM}运行 ${cmd}...${NC}"
    if ! eval "$cmd" > "$test_output" 2>&1; then
      all_passed=false
    fi
    tail -20 "$test_output" >> "$LOG_FILE"
    tail -5 "$test_output"
  done

  # 保存最后一次测试输出供 fix prompt 使用
  LAST_TEST_OUTPUT_FILE="$test_output"
  update_test_output "$test_output"

  if [ "$all_passed" = true ]; then
    rm -f "$test_output"
    LAST_TEST_OUTPUT_FILE=""
    return 0
  fi

  return 1
}

# ===== Flaky 测试检测 =====
# 如果所有失败的测试都在 KNOWN_FLAKY 列表中，返回 0 (视为通过)
is_only_flaky_failures() {
  local test_output_file="$1"

  if [ ${#PIPELINE_KNOWN_FLAKY[@]} -eq 0 ]; then
    return 1  # 没配置 flaky 列表，不跳过
  fi

  # 提取失败的测试文件名 (Vitest 格式: " FAIL  path/to/file.test.ts")
  # 只匹配 FAIL 行 (文件级别)，忽略 × 行 (测试级别，不含文件名)
  local failed_tests
  failed_tests=$(grep -E "^[[:space:]]*FAIL[[:space:]]" "$test_output_file" 2>/dev/null || true)

  if [ -z "$failed_tests" ]; then
    return 1  # 无法解析失败测试
  fi

  # 检查每个失败是否在 flaky 列表中
  while IFS= read -r line; do
    local is_flaky=false
    for flaky_pattern in "${PIPELINE_KNOWN_FLAKY[@]}"; do
      if echo "$line" | grep -q "$flaky_pattern"; then
        is_flaky=true
        break
      fi
    done
    if [ "$is_flaky" = false ]; then
      return 1  # 存在非 flaky 的失败
    fi
  done <<< "$failed_tests"

  log_warn "所有失败均为已知 flaky 测试，视为通过"
  return 0
}

# ===== 撞墙检测 =====
check_wall_hit() {
  local module_id="$1"
  local claude_output_file="$2"

  # 规则 2: Prompt is too long
  if grep -q "Prompt is too long" "$claude_output_file" 2>/dev/null; then
    echo "prompt_too_long"
    return 0
  fi

  # 规则 4: "no failures to fix" 但测试仍失败
  if grep -qi "no failures\|no failing\|already.*passing\|all.*pass" "$claude_output_file" 2>/dev/null; then
    echo "fix_ineffective"
    return 0
  fi

  echo ""
  return 1
}

# ===== 处理撞墙 =====
handle_block() {
  local module_id="$1"
  local reason="$2"
  local elapsed="$3"

  log_fail "${module_id} 撞墙: ${reason} ($(format_duration "$elapsed"))"
  notify "Pipeline 撞墙" "${module_id}: ${reason}" "Basso"
  update_module_status "$module_id" "blocked" "$(format_duration "$elapsed")" "$reason"
  echo "--- ${module_id} BLOCKED: ${reason} at $(date) ($(format_duration "$elapsed")) ---" >> "$LOG_FILE"

  case "$PIPELINE_ON_BLOCK" in
    skip)
      log_warn "按配置跳过 ${module_id}，继续下一个"
      return 0
      ;;
    notify)
      log "等待人工决定... (Ctrl+C 退出, 或在另一个终端修复后按 Enter 继续)"
      notify "Pipeline 等待" "请决定 ${module_id} 的处理方式" "Submarine"
      read -r
      return 0
      ;;
    stop|*)
      return 1
      ;;
  esac
}

# ===== 打印汇总表 =====
print_summary() {
  local total_elapsed=$1

  echo ""
  log "${BOLD}╔═══════════════════════════════════════════╗${NC}"
  log "${BOLD}║           Pipeline 执行汇总               ║${NC}"
  log "${BOLD}╠═══════════════════════════════════════════╣${NC}"

  for entry in "${PIPELINE_MODULES[@]}"; do
    local id
    id=$(parse_module_entry "$entry" "id")

    # 从 status file 读取状态
    local status duration
    status=$(python3 -c "
import json
with open('$STATUS_FILE') as f:
    data = json.load(f)
for m in data['modules']:
    if m['id'] == '$id':
        print(m['status'])
        break
" 2>/dev/null || echo "unknown")

    duration=$(python3 -c "
import json
with open('$STATUS_FILE') as f:
    data = json.load(f)
for m in data['modules']:
    if m['id'] == '$id':
        print(m['duration'] or '-')
        break
" 2>/dev/null || echo "-")

    local icon
    case "$status" in
      passed)          icon="${GREEN}✅${NC}" ;;
      passed_after_fix) icon="${YELLOW}🔧${NC}" ;;
      skipped)         icon="${DIM}⏭️ ${NC}" ;;
      blocked)         icon="${RED}🧱${NC}" ;;
      failed)          icon="${RED}❌${NC}" ;;
      pending)         icon="${DIM}⏳${NC}" ;;
      *)               icon="  " ;;
    esac

    printf "  %b %-16s %-18s %s\n" "$icon" "$id" "$status" "$duration"
  done

  log "${BOLD}╚═══════════════════════════════════════════╝${NC}"
  log "总耗时: ${BOLD}$(format_duration "$total_elapsed")${NC}"
}

# ===== 执行单个模块 =====
run_module() {
  local id="$1"
  local prompt_file="$2"
  local marker="$3"
  local module_idx="$4"
  local total_modules="$5"
  local module_start=$SECONDS

  progress_bar "$module_idx" "$total_modules" "$id" "checking..."
  log "${BOLD}${CYAN}===== 模块 ${id} =====${NC}"

  # 跳过已完成
  if is_done "$marker"; then
    log_skip "${id} 已完成，跳过"
    update_module_status "$id" "skipped"
    return 0
  fi

  # 超时监控 (background watchdog)
  local watchdog_pid=""
  if [ "$PIPELINE_MODULE_TIMEOUT" -gt 0 ]; then
    (
      sleep "$PIPELINE_MODULE_TIMEOUT"
      log_fail "${id} 超时 ($(format_duration "$PIPELINE_MODULE_TIMEOUT"))"
      notify "Pipeline 超时" "${id} 执行超过 $(format_duration "$PIPELINE_MODULE_TIMEOUT")" "Basso"
      # 不直接 kill，让主循环检测
      touch "$PROJECT_DIR/.pipeline-timeout-${id}"
    ) &
    watchdog_pid=$!
  fi

  # ===== 第一次尝试 =====
  update_phase "$id" "executing" "$(format_duration $(( SECONDS - pipeline_start )))"
  update_module_status "$id" "in_progress"
  progress_bar "$module_idx" "$total_modules" "$id" "executing..."

  log "执行 ${id} (attempt 1/${PIPELINE_MAX_RETRIES})..."
  echo "" >> "$LOG_FILE"
  echo "========================================" >> "$LOG_FILE"
  echo "--- ${id} started at $(date) ---" >> "$LOG_FILE"
  echo "========================================" >> "$LOG_FILE"

  local claude_output
  claude_output=$(mktemp)

  # 生成或读取 prompt
  local prompt_content
  prompt_content=$(get_module_prompt "$prompt_file" "$id")

  local tmp_prompt
  tmp_prompt=$(mktemp)
  printf '%s' "$prompt_content" > "$tmp_prompt"

  if ! cat "$tmp_prompt" | $CLAUDE_CMD -p --verbose --dangerously-skip-permissions \
    > "$claude_output" 2>&1; then
    log "${YELLOW}claude 进程非零退出，继续检查测试...${NC}"
  fi
  rm -f "$tmp_prompt"
  cat "$claude_output" >> "$LOG_FILE"

  # 检查超时
  if [ -f "$PROJECT_DIR/.pipeline-timeout-${id}" ]; then
    rm -f "$PROJECT_DIR/.pipeline-timeout-${id}"
    kill "$watchdog_pid" 2>/dev/null || true
    handle_block "$id" "模块执行超时 ($(format_duration "$PIPELINE_MODULE_TIMEOUT"))" $(( SECONDS - module_start ))
    rm -f "$claude_output"
    return $?
  fi

  # 撞墙检测: prompt too long
  local wall_reason
  wall_reason=$(check_wall_hit "$id" "$claude_output" || true)
  if [ "$wall_reason" = "prompt_too_long" ]; then
    kill "$watchdog_pid" 2>/dev/null || true
    rm -f "$claude_output"
    handle_block "$id" "Prompt is too long" $(( SECONDS - module_start ))
    return $?
  fi

  # ===== 验证 =====
  update_phase "$id" "testing" "$(format_duration $(( SECONDS - pipeline_start )))"
  progress_bar "$module_idx" "$total_modules" "$id" "testing..."
  log "验证 ${id}..."

  if run_tests && is_done "$marker"; then
    local elapsed=$(( SECONDS - module_start ))
    kill "$watchdog_pid" 2>/dev/null || true
    log_ok "${id} passed ($(format_duration "$elapsed"))"
    notify "Pipeline" "✅ ${id} passed ($(format_duration "$elapsed"))" "Glass"
    update_module_status "$id" "passed" "$(format_duration "$elapsed")"
    echo "--- ${id} PASSED at $(date) ($(format_duration "$elapsed")) ---" >> "$LOG_FILE"
    rm -f "$claude_output"
    return 0
  fi

  # 检查是否只有 flaky test 失败
  if [ -n "${LAST_TEST_OUTPUT_FILE:-}" ] && [ -f "${LAST_TEST_OUTPUT_FILE:-}" ]; then
    if is_only_flaky_failures "$LAST_TEST_OUTPUT_FILE" && is_done "$marker"; then
      local elapsed=$(( SECONDS - module_start ))
      kill "$watchdog_pid" 2>/dev/null || true
      log_ok "${id} passed (flaky tests ignored, $(format_duration "$elapsed"))"
      notify "Pipeline" "✅ ${id} passed (flaky ignored)" "Glass"
      update_module_status "$id" "passed" "$(format_duration "$elapsed")"
      echo "--- ${id} PASSED (flaky ignored) at $(date) ($(format_duration "$elapsed")) ---" >> "$LOG_FILE"
      rm -f "$claude_output" "$LAST_TEST_OUTPUT_FILE"
      return 0
    fi
  fi

  # ===== Fix 循环 (attempt 2 .. MAX_RETRIES) =====
  local attempt=2
  while [ "$attempt" -le "$PIPELINE_MAX_RETRIES" ]; do
    update_phase "$id" "fix_attempt" "$(format_duration $(( SECONDS - pipeline_start )))"
    progress_bar "$module_idx" "$total_modules" "$id" "fix attempt ${attempt}/${PIPELINE_MAX_RETRIES}..."

    log "${YELLOW}${id} 测试失败，尝试修复 (attempt ${attempt}/${PIPELINE_MAX_RETRIES})...${NC}"

    # 构建 fix prompt，包含失败日志
    local fix_prompt="在 ${PIPELINE_BRANCH} 分支上工作。上一次实现 ${id} 后测试有失败。"
    fix_prompt+=$'\n\n'

    # 附加最后的测试输出
    if [ -n "${LAST_TEST_OUTPUT_FILE:-}" ] && [ -f "${LAST_TEST_OUTPUT_FILE:-}" ]; then
      fix_prompt+="以下是测试失败的输出 (最后 50 行):"
      fix_prompt+=$'\n```\n'
      fix_prompt+="$(tail -50 "$LAST_TEST_OUTPUT_FILE")"
      fix_prompt+=$'\n```\n\n'
    fi

    fix_prompt+="请阅读相关代码，修复所有失败的测试。只修复问题，不要重新实现已有的功能。修复后确保测试通过并 commit。"

    echo "--- ${id} FIX ATTEMPT ${attempt} at $(date) ---" >> "$LOG_FILE"

    local tmp_fix_prompt
    tmp_fix_prompt=$(mktemp)
    printf '%s' "$fix_prompt" > "$tmp_fix_prompt"

    local fix_output
    fix_output=$(mktemp)

    if ! cat "$tmp_fix_prompt" | $CLAUDE_CMD -p --verbose --dangerously-skip-permissions \
      > "$fix_output" 2>&1; then
      log "${YELLOW}修复 claude 进程非零退出${NC}"
    fi
    cat "$fix_output" >> "$LOG_FILE"
    rm -f "$tmp_fix_prompt"

    # 撞墙检测
    wall_reason=$(check_wall_hit "$id" "$fix_output" || true)
    if [ -n "$wall_reason" ]; then
      kill "$watchdog_pid" 2>/dev/null || true
      rm -f "$claude_output" "$fix_output"
      handle_block "$id" "$wall_reason" $(( SECONDS - module_start ))
      return $?
    fi
    rm -f "$fix_output"

    # 再次验证
    update_phase "$id" "fix_testing" "$(format_duration $(( SECONDS - pipeline_start )))"
    progress_bar "$module_idx" "$total_modules" "$id" "testing after fix..."

    if run_tests && is_done "$marker"; then
      local elapsed=$(( SECONDS - module_start ))
      kill "$watchdog_pid" 2>/dev/null || true
      log_ok "${id} 修复后测试通过 ($(format_duration "$elapsed"))"
      notify "Pipeline" "🔧 ${id} fixed & passed ($(format_duration "$elapsed"))" "Glass"
      update_module_status "$id" "passed_after_fix" "$(format_duration "$elapsed")"
      echo "--- ${id} FIXED & PASSED at $(date) ($(format_duration "$elapsed")) ---" >> "$LOG_FILE"
      rm -f "$claude_output"
      return 0
    fi

    # 检查 flaky
    if [ -n "${LAST_TEST_OUTPUT_FILE:-}" ] && [ -f "${LAST_TEST_OUTPUT_FILE:-}" ]; then
      if is_only_flaky_failures "$LAST_TEST_OUTPUT_FILE" && is_done "$marker"; then
        local elapsed=$(( SECONDS - module_start ))
        kill "$watchdog_pid" 2>/dev/null || true
        log_ok "${id} 修复后通过 (flaky ignored, $(format_duration "$elapsed"))"
        notify "Pipeline" "🔧 ${id} fixed (flaky ignored)" "Glass"
        update_module_status "$id" "passed_after_fix" "$(format_duration "$elapsed")"
        echo "--- ${id} FIXED & PASSED (flaky ignored) at $(date) ($(format_duration "$elapsed")) ---" >> "$LOG_FILE"
        rm -f "$claude_output" "$LAST_TEST_OUTPUT_FILE"
        return 0
      fi
    fi

    attempt=$((attempt + 1))
  done

  # 所有重试用尽
  local elapsed=$(( SECONDS - module_start ))
  kill "$watchdog_pid" 2>/dev/null || true
  rm -f "$claude_output"

  update_module_status "$id" "failed" "$(format_duration "$elapsed")"
  notify "Pipeline 失败" "❌ ${id} 重试 ${PIPELINE_MAX_RETRIES} 次后仍失败" "Basso"
  echo "--- ${id} FAILED at $(date) ($(format_duration "$elapsed")) ---" >> "$LOG_FILE"

  handle_block "$id" "重试 ${PIPELINE_MAX_RETRIES} 次后仍失败" "$elapsed"
  return $?
}

# ===== Main =====

cd "$PROJECT_DIR"

# 初始化日志
echo "" >> "$LOG_FILE"
echo "===== Pipeline started at $(date) =====" >> "$LOG_FILE"
echo "Config: $CONFIG_FILE" >> "$LOG_FILE"

# Claude Code 命令
if command -v ccr &>/dev/null; then
  CLAUDE_CMD="ccr code"
elif command -v claude &>/dev/null; then
  CLAUDE_CMD="claude"
else
  log_fail "未找到 ccr 或 claude CLI"
  exit 1
fi

# 允许嵌套调用 — 清除 Claude Code 环境变量
unset CLAUDECODE CLAUDE_CODE_SSE_PORT CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC 2>/dev/null || true

# 初始化 status file
init_status

log "${BOLD}Pipeline 开发管线${NC}"
log "配置: ${CONFIG_FILE}"
log "分支: ${PIPELINE_BRANCH}"
log "日志: ${LOG_FILE}"
log "CLI:  ${CLAUDE_CMD}"
if [ -n "$START_FROM" ]; then
  log "起始: ${START_FROM}"
fi
if [ "$DRY_RUN" = true ]; then
  log "${YELLOW}模式: Dry Run (仅预览)${NC}"
fi
echo ""

# 预览模块状态
completed=0
pending=0
for entry in "${PIPELINE_MODULES[@]}"; do
  id=$(parse_module_entry "$entry" "id")
  marker=$(parse_module_entry "$entry" "marker")
  if is_done "$marker"; then
    completed=$((completed + 1))
  else
    pending=$((pending + 1))
  fi
done
log "进度: ${GREEN}${completed} 已完成${NC} / ${YELLOW}${pending} 待执行${NC} / 共 ${#PIPELINE_MODULES[@]} 个模块"
echo ""

# 主循环
started=false
if [ -z "$START_FROM" ]; then
  started=true
fi

pipeline_start=$SECONDS
modules_done=0
module_idx=0
total_modules=${#PIPELINE_MODULES[@]}

for entry in "${PIPELINE_MODULES[@]}"; do
  id=$(parse_module_entry "$entry" "id")
  prompt_file=$(parse_module_entry "$entry" "prompt")
  marker=$(parse_module_entry "$entry" "marker")
  module_idx=$((module_idx + 1))

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
      update_module_status "$id" "skipped"
    else
      if [[ "$prompt_file" == @* ]]; then
        _section="${prompt_file#@}"
        log "📋 ${id} → auto:「${_section}」"
      else
        log "📋 ${id} → ${prompt_file}"
      fi
    fi
    continue
  fi

  if ! run_module "$id" "$prompt_file" "$marker" "$module_idx" "$total_modules"; then
    total_elapsed=$(( SECONDS - pipeline_start ))
    update_phase "" "" "$(format_duration "$total_elapsed")"
    print_summary "$total_elapsed"
    echo ""
    log_fail "管线在 ${id} 处停止。查看日志: ${LOG_FILE}"
    log "修复后重新运行: $0 $CONFIG_FILE ${id}"
    echo "===== Pipeline stopped at $(date) ($(format_duration "$total_elapsed")) =====" >> "$LOG_FILE"
    exit 1
  fi

  modules_done=$((modules_done + 1))
  echo ""
done

# 完成
if [ "$DRY_RUN" = false ]; then
  total_elapsed=$(( SECONDS - pipeline_start ))
  update_phase "" "" "$(format_duration "$total_elapsed")"
  print_summary "$total_elapsed"
  echo ""
  log_ok "${BOLD}管线完成！${NC} (${modules_done} 个模块, $(format_duration "$total_elapsed"))"
  notify "Pipeline 完成" "✅ ${modules_done} 个模块全部通过 ($(format_duration "$total_elapsed"))" "Hero"
  echo "===== Pipeline finished at $(date) ($(format_duration "$total_elapsed")) =====" >> "$LOG_FILE"
else
  update_phase "" "" "0s"
fi
