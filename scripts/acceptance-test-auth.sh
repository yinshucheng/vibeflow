#!/bin/bash
#
# Auth & Skill API 验收测试脚本
#
# 用法：
#   1. 确保在 feature/auth-and-skill-api 分支
#   2. 启动 dev server: npm run dev （DEV_MODE=true，端口 3000）
#   3. 运行: ./scripts/acceptance-test-auth.sh
#
# 自动化范围：
#   - Phase 1: DEV_MODE=true 兼容性（Checkpoint 4 部分）
#   - Phase 2: DEV_MODE=false 认证拦截（Checkpoint 4 + 7 自动）
#   - Phase 3: Scope 权限控制（静态检查）
#   - Phase 4: REST Skill API
#   - Phase 5: API Key 管理 + 端到端（Checkpoint 14）
#   - Phase 6: MCP 认证统一（静态检查）
#   - Phase 7: Rate Limiting
#   - Phase 8: 数据迁移脚本
#   - Phase 9: 回滚兼容性
#

set -uo pipefail

DEV_PORT=${1:-3000}
PROD_PORT=3001
DEV_BASE="http://localhost:$DEV_PORT"
PROD_BASE="http://localhost:$PROD_PORT"
PASS=0
FAIL=0
SKIP=0
RESULTS=()
PROD_PID=""

# ─── Helpers ───────────────────────────────────────────────────────────────

green() { echo -e "\033[32m✅ $1\033[0m"; }
red()   { echo -e "\033[31m❌ $1\033[0m"; }
yellow(){ echo -e "\033[33m⏭️  $1\033[0m"; }
blue()  { echo -e "\033[34m🔧 $1\033[0m"; }

check() {
  local name="$1"
  local result="$2"
  if [ "$result" = "pass" ]; then
    green "$name"
    PASS=$((PASS+1))
    RESULTS+=("✅ $name")
  elif [ "$result" = "skip" ]; then
    yellow "$name (SKIPPED)"
    SKIP=$((SKIP+1))
    RESULTS+=("⏭️  $name")
  else
    red "$name"
    FAIL=$((FAIL+1))
    RESULTS+=("❌ $name")
  fi
}

cleanup_prod_server() {
  if [ -n "$PROD_PID" ]; then
    blue "停止 DEV_MODE=false 测试服务器 (PID $PROD_PID)..."
    kill "$PROD_PID" 2>/dev/null || true
    wait "$PROD_PID" 2>/dev/null || true
    PROD_PID=""
  fi
}

trap cleanup_prod_server EXIT

# ─── Pre-flight ────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════"
echo "  Auth & Skill API — 验收测试"
echo "═══════════════════════════════════════════"
echo ""

# Check branch
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "feature/auth-and-skill-api" ]; then
  red "当前分支是 $BRANCH，需要 feature/auth-and-skill-api"
  exit 1
fi
green "分支正确: $BRANCH"

# Check dev server running
if ! curl -s "$DEV_BASE/api/health" > /dev/null 2>&1; then
  red "Dev server 未启动。请先运行: npm run dev"
  exit 1
fi
green "Dev server (DEV_MODE=true) 运行中: $DEV_BASE"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
echo "── Checkpoint 4a: DEV_MODE=true 兼容性 ──"
echo ""

# 1.1 Dashboard 不重定向
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$DEV_BASE/")
if [ "$STATUS" = "200" ]; then
  check "1.1 DEV_MODE=true Dashboard 可访问 (200)" "pass"
else
  check "1.1 DEV_MODE=true Dashboard 可访问 (got $STATUS)" "fail"
fi

# 1.2 dev header 认证有效
RESULT=$(curl -s -H "x-dev-user-email: dev@vibeflow.local" "$DEV_BASE/api/skill/state")
if echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('success')==True" 2>/dev/null; then
  check "1.2 dev header 认证有效 (Skill API)" "pass"
else
  check "1.2 dev header 认证有效 (Skill API)" "fail"
fi

# 1.3 tRPC API 可用
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "x-dev-user-email: dev@vibeflow.local" "$DEV_BASE/api/trpc/dailyState.getToday")
if [ "$STATUS" = "200" ]; then
  check "1.3 tRPC API 可用 (DEV_MODE=true)" "pass"
else
  check "1.3 tRPC API 可用 (got $STATUS)" "fail"
fi

# 1.4 /api/health 正常
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$DEV_BASE/api/health")
if [ "$STATUS" = "200" ]; then
  check "1.4 /api/health 正常" "pass"
else
  check "1.4 /api/health (got $STATUS)" "fail"
fi

# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "── Checkpoint 4b: DEV_MODE=false 认证拦截 ──"
echo ""

# 检查 3001 端口是否已占用
if curl -s "http://localhost:$PROD_PORT/api/health" > /dev/null 2>&1; then
  red "端口 $PROD_PORT 已占用，无法启动 DEV_MODE=false 测试服务器"
  check "2.x DEV_MODE=false 测试" "skip"
else
  blue "启动 DEV_MODE=false 测试服务器 (端口 $PROD_PORT)..."
  DEV_MODE=false NEXT_PUBLIC_DEV_MODE=false PORT=$PROD_PORT node server.js > /dev/null 2>&1 &
  PROD_PID=$!

  # 等待服务器启动（最多 30 秒）
  WAITED=0
  while ! curl -s "http://localhost:$PROD_PORT/api/health" > /dev/null 2>&1; do
    sleep 1
    WAITED=$((WAITED+1))
    if [ "$WAITED" -ge 30 ]; then
      red "DEV_MODE=false 服务器启动超时（30s）"
      check "2.x DEV_MODE=false 服务器启动" "fail"
      cleanup_prod_server
      break
    fi
  done

  if curl -s "http://localhost:$PROD_PORT/api/health" > /dev/null 2>&1; then
    green "DEV_MODE=false 服务器启动成功 (PID $PROD_PID)"
    echo ""

    # 2.1 首页重定向到 /login
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L --max-redirs 0 "$PROD_BASE/")
    if [ "$STATUS" = "302" ] || [ "$STATUS" = "307" ] || [ "$STATUS" = "308" ]; then
      check "2.1 首页重定向到 /login ($STATUS)" "pass"
    else
      check "2.1 首页重定向到 /login (got $STATUS)" "fail"
    fi

    # 2.2 /login 页面可访问
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_BASE/login")
    if [ "$STATUS" = "200" ]; then
      check "2.2 /login 页面可访问 (200)" "pass"
    else
      check "2.2 /login 页面可访问 (got $STATUS)" "fail"
    fi

    # 2.3 /login 页面无 Dev Quick Login
    LOGIN_HTML=$(curl -s "$PROD_BASE/login")
    if echo "$LOGIN_HTML" | grep -qi "dev.*quick.*login\|dev.*mode.*login\|devMode.*true.*login"; then
      check "2.3 /login 无 Dev Quick Login" "fail"
    else
      check "2.3 /login 无 Dev Quick Login" "pass"
    fi

    # 2.4 tRPC 无认证 → 401
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_BASE/api/trpc/task.list")
    if [ "$STATUS" = "401" ]; then
      check "2.4 tRPC 无认证 → 401" "pass"
    else
      check "2.4 tRPC 无认证 → 401 (got $STATUS)" "fail"
    fi

    # 2.5 Skill API 无认证 → 401
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_BASE/api/skill/state")
    if [ "$STATUS" = "401" ]; then
      check "2.5 Skill API 无认证 → 401" "pass"
    else
      check "2.5 Skill API 无认证 → 401 (got $STATUS)" "fail"
    fi

    # 2.6 dev header 被拒绝
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "x-dev-user-email: dev@vibeflow.local" "$PROD_BASE/api/skill/state")
    if [ "$STATUS" = "401" ]; then
      check "2.6 dev header 被拒绝 (DEV_MODE=false) → 401" "pass"
    else
      check "2.6 dev header 被拒绝 (got $STATUS)" "fail"
    fi

    # 2.7 /api/auth/token 无密码登录被拒
    RESULT=$(curl -s -X POST "$PROD_BASE/api/auth/token" \
      -H "Content-Type: application/json" \
      -d '{"email":"dev@vibeflow.local"}')
    STATUS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null || echo "")
    if [ -n "$STATUS" ]; then
      check "2.7 无密码登录被拒" "pass"
    else
      check "2.7 无密码登录被拒" "fail"
    fi

    # 2.8 /api/health 不受影响
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_BASE/api/health")
    if [ "$STATUS" = "200" ]; then
      check "2.8 /api/health 不受认证影响 (200)" "pass"
    else
      check "2.8 /api/health (got $STATUS)" "fail"
    fi

    # 清理
    cleanup_prod_server
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "── Scope 权限控制（静态检查） ──"
echo ""

# 3.1 Scope 中间件存在
COUNT=$(grep -c "withScope\|readProcedure\|writeProcedure\|adminProcedure" src/server/trpc.ts || echo 0)
if [ "$COUNT" -ge 4 ]; then
  check "3.1 Scope 中间件存在 ($COUNT references)" "pass"
else
  check "3.1 Scope 中间件存在 ($COUNT references)" "fail"
fi

# 3.2 无 protectedProcedure 残留
RESIDUAL=$(grep -rn "protectedProcedure\.query\|protectedProcedure\.mutation" src/server/routers/ 2>/dev/null | wc -l | tr -d ' ')
if [ "$RESIDUAL" = "0" ]; then
  check "3.2 无 protectedProcedure.query/mutation 残留" "pass"
else
  check "3.2 无 protectedProcedure.query/mutation 残留 ($RESIDUAL found)" "fail"
fi

# 3.3 Router scope 抽查
TASK_READ=$(grep -c "readProcedure" src/server/routers/task.ts 2>/dev/null || echo 0)
TASK_WRITE=$(grep -c "writeProcedure" src/server/routers/task.ts 2>/dev/null || echo 0)
if [ "$TASK_READ" -ge 1 ] && [ "$TASK_WRITE" -ge 1 ]; then
  check "3.3a task.ts: read=$TASK_READ, write=$TASK_WRITE" "pass"
else
  check "3.3a task.ts scope 分类" "fail"
fi

APIKEY_ADMIN=$(grep -c "adminProcedure" src/server/routers/api-key.ts 2>/dev/null || echo 0)
APIKEY_READ=$(grep -c "readProcedure" src/server/routers/api-key.ts 2>/dev/null || echo 0)
if [ "$APIKEY_ADMIN" -ge 1 ] && [ "$APIKEY_READ" -ge 1 ]; then
  check "3.3b api-key.ts: admin=$APIKEY_ADMIN, read=$APIKEY_READ" "pass"
else
  check "3.3b api-key.ts scope 分类" "fail"
fi

SETTINGS_ADMIN=$(grep -c "adminProcedure" src/server/routers/settings.ts 2>/dev/null || echo 0)
SETTINGS_WRITE=$(grep -c "writeProcedure" src/server/routers/settings.ts 2>/dev/null || echo 0)
if [ "$SETTINGS_ADMIN" -ge 1 ] && [ "$SETTINGS_WRITE" -ge 1 ]; then
  check "3.3c settings.ts: admin=$SETTINGS_ADMIN, write=$SETTINGS_WRITE" "pass"
else
  check "3.3c settings.ts scope 分类" "fail"
fi

# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "── REST Skill API ──"
echo ""

# 4.1-4.4 各端点返回 success
for endpoint in state tasks projects analytics timeline top3; do
  RESULT=$(curl -s -H "x-dev-user-email: dev@vibeflow.local" "$DEV_BASE/api/skill/$endpoint")
  if echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('success')==True" 2>/dev/null; then
    check "4.x GET /api/skill/$endpoint" "pass"
  else
    check "4.x GET /api/skill/$endpoint" "fail"
  fi
done

# 4.5 无认证返回 401
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$DEV_BASE/api/skill/state")
if [ "$STATUS" = "401" ]; then
  check "4.5 无认证 → 401" "pass"
else
  check "4.5 无认证 → 401 (got $STATUS)" "fail"
fi

# 4.6 标准 JSON（无 SuperJSON meta）
RESULT=$(curl -s -H "x-dev-user-email: dev@vibeflow.local" "$DEV_BASE/api/skill/state")
if echo "$RESULT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
data_str = json.dumps(d.get('data',{}))
# SuperJSON responses have 'meta' with type mappings
assert '\"meta\"' not in data_str or '\"values\"' not in data_str
" 2>/dev/null; then
  check "4.6 标准 JSON（无 SuperJSON meta）" "pass"
else
  check "4.6 标准 JSON（无 SuperJSON meta）" "fail"
fi

# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "── API Key 管理 + Checkpoint 14 端到端 ──"
echo ""

# 5.1 api-key router 注册
if grep -q "apiKey\|api-key\|api_key" src/server/routers/_app.ts 2>/dev/null; then
  check "5.1 api-key router 注册到 _app.ts" "pass"
else
  check "5.1 api-key router 注册到 _app.ts" "fail"
fi

# 5.2 创建 API Key 并用它访问 Skill API（Checkpoint 14 端到端）
CREATED=$(curl -s -X POST "$DEV_BASE/api/trpc/apiKey.create" \
  -H "Content-Type: application/json" \
  -H "x-dev-user-email: dev@vibeflow.local" \
  -d '{"json":{"name":"e2e-acceptance-test","scopes":["read","write"]}}')

# 从 SuperJSON 响应中提取 token
TOKEN=$(echo "$CREATED" | python3 -c "
import sys,json
d=json.load(sys.stdin)
r = d.get('result',{}).get('data',{})
actual = r.get('json', r)
if isinstance(actual, dict) and actual.get('success'):
  print(actual.get('data',{}).get('token',''))
elif isinstance(actual, dict) and 'token' in actual:
  print(actual.get('token',''))
else:
  print('')
" 2>/dev/null)

if [ -n "$TOKEN" ] && [[ "$TOKEN" == vf_* ]]; then
  check "5.2 创建 API Key 成功 (vf_...)" "pass"

  # 5.3 用新 Key 访问 Skill API
  RESULT=$(curl -s -H "Authorization: Bearer $TOKEN" "$DEV_BASE/api/skill/tasks")
  if echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('success')==True" 2>/dev/null; then
    check "5.3 用 API Key 访问 Skill API 成功" "pass"
  else
    check "5.3 用 API Key 访问 Skill API" "fail"
  fi

  # 5.4 用 read-only Key 测试 scope（创建一个 read-only key）
  READ_CREATED=$(curl -s -X POST "$DEV_BASE/api/trpc/apiKey.create" \
    -H "Content-Type: application/json" \
    -H "x-dev-user-email: dev@vibeflow.local" \
    -d '{"json":{"name":"e2e-readonly","scopes":["read"]}}')
  READ_TOKEN=$(echo "$READ_CREATED" | python3 -c "
import sys,json
d=json.load(sys.stdin)
r = d.get('result',{}).get('data',{})
actual = r.get('json', r)
if isinstance(actual, dict) and actual.get('success'):
  print(actual.get('data',{}).get('token',''))
elif isinstance(actual, dict) and 'token' in actual:
  print(actual.get('token',''))
else:
  print('')
" 2>/dev/null)

  if [ -n "$READ_TOKEN" ] && [[ "$READ_TOKEN" == vf_* ]]; then
    # read-only token 读取应该成功
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $READ_TOKEN" "$DEV_BASE/api/skill/state")
    if [ "$STATUS" = "200" ]; then
      check "5.4a read-only token GET → 200" "pass"
    else
      check "5.4a read-only token GET (got $STATUS)" "fail"
    fi

    # read-only token 写入应该 403
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
      -H "Authorization: Bearer $READ_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"title":"test","projectId":"nonexistent"}' \
      "$DEV_BASE/api/skill/tasks")
    if [ "$STATUS" = "403" ]; then
      check "5.4b read-only token POST → 403" "pass"
    else
      check "5.4b read-only token POST (got $STATUS)" "fail"
    fi
  else
    check "5.4 read-only Key 创建" "skip"
  fi

  # 5.5 吊销 Key 后返回 401
  # 先获取 token ID（通过 list）
  LIST_RESULT=$(curl -s "$DEV_BASE/api/trpc/apiKey.list" \
    -H "x-dev-user-email: dev@vibeflow.local")
  TOKEN_ID=$(echo "$LIST_RESULT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
r = d.get('result',{}).get('data',{})
actual = r.get('json', r)
tokens = actual if isinstance(actual, list) else actual.get('data',[]) if isinstance(actual, dict) else []
for t in tokens:
  if t.get('name') == 'e2e-acceptance-test':
    print(t.get('id',''))
    break
" 2>/dev/null)

  if [ -n "$TOKEN_ID" ]; then
    # 吊销
    curl -s -X POST "$DEV_BASE/api/trpc/apiKey.revoke" \
      -H "Content-Type: application/json" \
      -H "x-dev-user-email: dev@vibeflow.local" \
      -d "{\"json\":{\"tokenId\":\"$TOKEN_ID\"}}" > /dev/null 2>&1

    # 吊销后用原 token 访问应该 401
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$DEV_BASE/api/skill/state")
    if [ "$STATUS" = "401" ]; then
      check "5.5 吊销后 → 401" "pass"
    else
      check "5.5 吊销后 (got $STATUS)" "fail"
    fi
  else
    check "5.5 吊销测试（无法获取 token ID）" "skip"
  fi
else
  check "5.2 创建 API Key" "fail"
  check "5.3 用 API Key 访问" "skip"
  check "5.4 Scope 测试" "skip"
  check "5.5 吊销测试" "skip"
fi

# 清理 read-only test key
if [ -n "${READ_TOKEN:-}" ]; then
  READ_TOKEN_ID=$(echo "$LIST_RESULT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
r = d.get('result',{}).get('data',{})
actual = r.get('json', r)
tokens = actual if isinstance(actual, list) else actual.get('data',[]) if isinstance(actual, dict) else []
for t in tokens:
  if t.get('name') == 'e2e-readonly':
    print(t.get('id',''))
    break
" 2>/dev/null)
  if [ -n "$READ_TOKEN_ID" ]; then
    curl -s -X POST "$DEV_BASE/api/trpc/apiKey.revoke" \
      -H "Content-Type: application/json" \
      -H "x-dev-user-email: dev@vibeflow.local" \
      -d "{\"json\":{\"tokenId\":\"$READ_TOKEN_ID\"}}" > /dev/null 2>&1
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "── MCP 认证统一（静态检查） ──"
echo ""

if grep -rq "39.105.213.147" src/mcp/ 2>/dev/null; then
  check "6.1 硬编码 IP 已删除" "fail"
else
  check "6.1 硬编码 IP 已删除" "pass"
fi

if grep -q "vibeflow_" src/mcp/auth.ts 2>/dev/null; then
  check "6.2 vibeflow_ 格式已删除" "fail"
else
  check "6.2 vibeflow_ 格式已删除" "pass"
fi

ENVCOUNT=$(grep -c "VIBEFLOW_API_KEY\|VIBEFLOW_SERVER_URL" src/mcp/trpc-client.ts 2>/dev/null || echo 0)
if [ "$ENVCOUNT" -ge 2 ]; then
  check "6.3 环境变量读取 ($ENVCOUNT references)" "pass"
else
  check "6.3 环境变量读取 ($ENVCOUNT found)" "fail"
fi

if grep -q "VIBEFLOW_API_KEY" .claude/.mcp.json 2>/dev/null; then
  check "6.4 .mcp.json 含 VIBEFLOW_API_KEY" "pass"
else
  check "6.4 .mcp.json 含 VIBEFLOW_API_KEY" "fail"
fi

# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "── Rate Limiting ──"
echo ""

if [ -f "src/lib/rate-limit.ts" ]; then
  check "7.1 rate-limit.ts 存在" "pass"
else
  check "7.1 rate-limit.ts 存在" "fail"
fi

if grep -q "rateLimit\|rate-limit\|rateLimiter\|RateLimit" src/app/api/auth/token/route.ts 2>/dev/null; then
  check "7.2 token 端点引用 rate limiter" "pass"
else
  check "7.2 token 端点引用 rate limiter" "fail"
fi

if grep -q "rateLimit\|rate-limit\|rateLimiter\|RateLimit" src/app/api/auth/register/route.ts 2>/dev/null; then
  check "7.3 register 端点引用 rate limiter" "pass"
else
  check "7.3 register 端点引用 rate limiter" "fail"
fi

# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "── 数据迁移脚本 ──"
echo ""

DRY_OUTPUT=$(npx tsx scripts/migrate-user-data.ts --source dev@vibeflow.local --target dev@vibeflow.local --dry-run 2>&1 || true)
if echo "$DRY_OUTPUT" | grep -qi "dry.run\|would migrate\|DRY RUN\|skip.*same\|same.*user\|cannot.*same\|source.*target.*same"; then
  check "8.1 迁移脚本 dry-run 可执行" "pass"
else
  check "8.1 迁移脚本 dry-run" "fail"
fi

LAYERS=$(grep -c "MIGRATE_CORE\|MIGRATE_AUXILIARY\|Layer 3\|skip by default" scripts/migrate-user-data.ts 2>/dev/null || echo 0)
if [ "$LAYERS" -ge 3 ]; then
  check "8.2 三层分类 ($LAYERS references)" "pass"
else
  check "8.2 三层分类 ($LAYERS references)" "fail"
fi

if grep -q "timeout.*120000\|timeout.*120_000\|120.*000" scripts/migrate-user-data.ts 2>/dev/null; then
  check "8.3 Transaction timeout 120s" "pass"
else
  check "8.3 Transaction timeout 120s" "fail"
fi

if grep -q "parentId.*null\|parentId: null" scripts/migrate-user-data.ts 2>/dev/null; then
  check "8.4 Task 自引用处理（parentId=null 后批量更新）" "pass"
else
  check "8.4 Task 自引用处理" "fail"
fi

# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "── 回滚兼容性 ──"
echo ""

if grep -q "DEV_MODE.*true" src/middleware.ts 2>/dev/null && grep -q "NextResponse.next" src/middleware.ts 2>/dev/null; then
  check "9.1 middleware DEV_MODE=true 放行" "pass"
else
  check "9.1 middleware DEV_MODE=true 放行" "fail"
fi

if grep -q "dev-user-email\|devEmail\|email.*fallback" src/server/socket.ts 2>/dev/null; then
  check "9.2 socket.ts email fallback 保留" "pass"
else
  check "9.2 socket.ts email fallback 保留" "fail"
fi

if grep -q "x-dev-user-email\|devEmail" src/mcp/trpc-client.ts 2>/dev/null; then
  check "9.3 MCP trpc-client dev email header 保留" "pass"
else
  check "9.3 MCP trpc-client dev email header 保留" "fail"
fi

# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════"
echo "  验收结果"
echo "═══════════════════════════════════════════"
echo ""
echo "  ✅ 通过: $PASS"
echo "  ❌ 失败: $FAIL"
echo "  ⏭️  跳过: $SKIP"
echo "  📊 总计: $((PASS+FAIL+SKIP))"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "失败项:"
  for r in "${RESULTS[@]}"; do
    if [[ "$r" == ❌* ]]; then
      echo "  $r"
    fi
  done
  echo ""
fi

if [ "$SKIP" -gt 0 ]; then
  echo "跳过项:"
  for r in "${RESULTS[@]}"; do
    if [[ "$r" == ⏭️* ]]; then
      echo "  $r"
    fi
  done
  echo ""
fi

# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "── 需手动验收的项目 ──"
echo ""
echo "  🎨 Settings API Keys UI 视觉验证（创建/列表/吊销对话框）"
echo "  📱 Phase 3: iOS AppProvider 改造 + LoginScreen 真机验证"
echo "  🖥️  Phase 3: Desktop main.ts + 登录窗口验证"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo "🎉 自动化验收全部通过！请继续手动验收上述项目。"
  exit 0
else
  echo "⚠️  有 $FAIL 项自动化验收失败，请检查后重试。"
  exit 1
fi
