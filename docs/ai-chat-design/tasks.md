# AI Chat 实施任务清单

> 先把基础能力做扎实，再逐步扩展场景。基础能力是所有场景共用的引擎，场景是引擎上的具体应用。
> 每个阶段都包含自动化测试，功能代码和测试代码同步交付。

---

## 测试策略

```
┌──────────────────────────────────────────────────────┐
│                    测试分层                            │
│                                                        │
│  E2E (Playwright)         端到端对话流程验证           │
│    e2e/tests/chat-*.spec.ts                            │
│                                                        │
│  Integration (Vitest)     Service 层集成测试            │
│    tests/services/chat.service.test.ts                 │
│    tests/services/llm-adapter.service.test.ts          │
│    （使用 LLM mock，不调真实 API）                      │
│                                                        │
│  Property (fast-check)    协议一致性 / 数据不变量       │
│    tests/property/chat-*.property.ts                   │
│                                                        │
│  iOS Unit (Jest)          Store / Service 逻辑          │
│    vibeflow-ios/__tests__/chat-*.test.ts               │
└──────────────────────────────────────────────────────┘
```

**LLM Mock 策略**：测试中不调用真实 LLM API。通过 mock `streamText` / `generateText` 返回预设响应（包含 tool_use content blocks），验证上下游链路正确性。

### 测试用户隔离

当前没有独立的测试数据库，所有测试共用 dev 数据库。必须保证测试用户数据完全隔离，不影响其他测试和真实数据。

**隔离原则**：每个测试用例创建自己的独立用户，测试结束后清理全部关联数据。

```
┌─────────────────────────────────────────────────────────┐
│  测试类型          │  隔离方式                            │
├─────────────────────────────────────────────────────────┤
│  E2E (Playwright)  │  复用现有 e2e/fixtures 体系：        │
│                    │  - generateTestEmail() 生成唯一用户  │
│                    │  - TestDataTracker 追踪所有实体      │
│                    │  - afterEach cleanup 按依赖序删除    │
│                    │  Chat 新增实体需注册到 Tracker：     │
│                    │    Conversation, ChatMessage,        │
│                    │    LLMUsageLog                       │
├─────────────────────────────────────────────────────────┤
│  Integration       │  纯 mock，不接触真实 DB              │
│  (Vitest mock)     │  userId 用硬编码假 ID               │
│                    │  vi.mock(prisma), vi.clearAllMocks() │
├─────────────────────────────────────────────────────────┤
│  Integration       │  需要真实 DB 的 service 测试：       │
│  (Vitest DB)       │  - beforeAll: 创建唯一测试用户       │
│                    │  - beforeEach: 清理 Chat 数据        │
│                    │  - afterAll: 删除用户及全部关联数据   │
│                    │  - 不可用时 graceful skip            │
├─────────────────────────────────────────────────────────┤
│  Property          │  纯逻辑类：无 DB，无隔离需求         │
│  (fast-check)      │  DB-backed 类：同 Integration DB     │
├─────────────────────────────────────────────────────────┤
│  iOS Unit (Jest)   │  纯 mock，不接触真实 DB              │
└─────────────────────────────────────────────────────────┘
```

**具体实现**：

#### E2E: 扩展 TestDataTracker

```typescript
// e2e/fixtures/database.fixture.ts — 新增 Chat 实体追踪
class TestDataTracker {
  // 新增
  private conversationIds: string[] = [];
  private chatMessageIds: string[] = [];
  private llmUsageLogIds: string[] = [];

  trackConversation(id: string) { this.conversationIds.push(id); }
  trackChatMessage(id: string) { this.chatMessageIds.push(id); }
  trackLLMUsageLog(id: string) { this.llmUsageLogIds.push(id); }

  async cleanup() {
    // Chat 实体在现有清理序列之前（因为 Conversation 依赖 User）
    // 顺序: LLMUsageLog → ChatMessage → Conversation → ...existing...
    await prisma.lLMUsageLog.deleteMany({ where: { id: { in: this.llmUsageLogIds } } });
    await prisma.chatMessage.deleteMany({ where: { id: { in: this.chatMessageIds } } });
    await prisma.conversation.deleteMany({ where: { id: { in: this.conversationIds } } });
    // ...existing cleanup...
  }
}
```

#### E2E: Chat Fixture 扩展

```typescript
// e2e/fixtures/index.ts — 新增 Chat 相关 fixture
interface TestFixtures {
  // ...existing...
  chatHelper: ChatTestHelper;
}

class ChatTestHelper {
  constructor(private prisma: PrismaClient, private tracker: TestDataTracker) {}

  /** 为测试用户创建一个对话 + 若干消息 */
  async seedConversation(userId: string, messageCount: number = 0) {
    const conv = await this.prisma.conversation.create({
      data: { userId, type: 'DEFAULT', title: 'Test Conversation' },
    });
    this.tracker.trackConversation(conv.id);

    for (let i = 0; i < messageCount; i++) {
      const msg = await this.prisma.chatMessage.create({
        data: {
          conversationId: conv.id,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Test message ${i}`,
        },
      });
      this.tracker.trackChatMessage(msg.id);
    }
    return conv;
  }
}
```

#### Integration (Vitest DB): Chat 测试基类

```typescript
// tests/helpers/chat-test-setup.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
let testUserId: string;
let dbAvailable = false;

export async function setupChatTestUser() {
  try {
    await prisma.$connect();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }

  const email = `chat-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.vibeflow.local`;
  const user = await prisma.user.create({
    data: { email, password: 'test_hash' },
  });
  testUserId = user.id;
}

export async function cleanupChatTestUser() {
  if (!dbAvailable) return;
  // 按依赖序删除
  await prisma.lLMUsageLog.deleteMany({ where: { userId: testUserId } });
  await prisma.chatMessage.deleteMany({ where: { conversation: { userId: testUserId } } });
  await prisma.conversation.deleteMany({ where: { userId: testUserId } });
  await prisma.user.delete({ where: { id: testUserId } });
  await prisma.$disconnect();
}

export function skipIfNoDb(fn: () => void) {
  if (!dbAvailable) {
    console.warn('Skipping: Database not available');
    return;
  }
  fn();
}

export { prisma, testUserId, dbAvailable };
```

```typescript
// 使用示例: tests/services/chat.service.test.ts
import { setupChatTestUser, cleanupChatTestUser, testUserId, skipIfNoDb } from '../helpers/chat-test-setup';

beforeAll(() => setupChatTestUser());
afterAll(() => cleanupChatTestUser());

describe('chatService', () => {
  it('should create default conversation', () => skipIfNoDb(async () => {
    const conv = await chatService.getOrCreateDefaultConversation(testUserId);
    expect(conv.userId).toBe(testUserId);
    expect(conv.type).toBe('DEFAULT');
  }));
});
```

### 人工验收 ↔ 自动化测试关联

每个人工验收项 (QA-*) 都标注了关联的自动化测试文件和用例。排障流程：

```
人工验收不通过
  │
  ├─ 1. 先跑关联测试（每个 QA 项下方 🔗 标注的测试文件）
  │     npx vitest run <关联测试文件>
  │
  ├─ 2a. 关联测试红 → 修 bug → 测试绿 → 重新人工验收
  │
  └─ 2b. 关联测试绿但人工验收仍失败
        → 说明测试覆盖有遗漏
        → 先补测试（复现 QA 失败场景的自动化用例）
        → 测试红 → 修 bug → 测试绿 → 重新人工验收
```

**原则**: 不允许只修 bug 不补测试。每次人工验收发现的问题，都必须转化为自动化测试用例，防止回归。

**关联标记说明**:
- `🔗` 关联测试: 该 QA 项依赖的自动化测试文件和具体用例
- `❌` 不通过时排查: 具体的排障命令和思路

---

**关键约束**：

1. **邮箱唯一性**：所有测试用户邮箱包含时间戳 + 随机数，格式 `chat-test-{ts}-{rand}@test.vibeflow.local`，避免冲突
2. **清理完整性**：清理时按外键依赖序：LLMUsageLog → ChatMessage → Conversation → User
3. **不依赖全局状态**：每个测试文件独立创建/销毁用户，不共享测试用户
4. **DB 不可用时跳过**：CI 或本地无 DB 时 graceful skip，不阻塞纯逻辑测试
5. **不清理他人数据**：所有 deleteMany 必须带 `where: { userId: testUserId }`，不用 `deleteMany({})`

---

## 基础能力与场景的关系

```
┌─────────────────────────────────────────────────────┐
│                    场景层 (Scenarios)                 │
│                                                       │
│  晨间规划 · 专注快捷操作 · 任务管理 · 项目分析       │
│  主动触发 · 定时提醒 · 数据回顾 · Desktop 增强       │
│  ...可持续扩展                                        │
├─────────────────────────────────────────────────────┤
│                    基础能力 (Foundation)               │
│                                                       │
│  F1 数据层        Prisma Schema / 协议类型            │
│  F2 LLM 引擎      模型注册 / 调用编排 / 流式输出     │
│  F3 会话管理       单会话 / 消息持久化 / 并发锁       │
│  F4 Tool 框架      Tool 注册 / 执行 / userId 注入    │
│  F5 传输层        Socket.io 事件处理 / 多端同步       │
│  F6 上下文管理     System Prompt / 滑动窗口 / 裁剪   │
│  F7 可观测性       Token 追踪 / 上下文使用率          │
│  F8 端侧框架      iOS Chat UI 骨架 / Store / Service │
└─────────────────────────────────────────────────────┘
```

**原则**：基础能力完成后，应该能跑通一个最简单的对话（用户说 "你好" → AI 回复），且具备工具调用的完整链路。在此之上再叠加具体场景。

---

## 第一部分：基础能力 (Foundation)

### F0. 测试基础设施

> 所有测试任务依赖此模块。在 F1 之后、其他测试之前完成。

- [ ] **F0.1 扩展 TestDataTracker**
  - `e2e/fixtures/database.fixture.ts`: 新增 `trackConversation`, `trackChatMessage`, `trackLLMUsageLog`
  - `cleanup()` 方法增加 Chat 实体清理（LLMUsageLog → ChatMessage → Conversation，在现有清理序列之前）

- [ ] **F0.2 Chat E2E Fixture**
  - `e2e/fixtures/chat.fixture.ts`: `ChatTestHelper` class
  - `seedConversation(userId, messageCount)`: 创建测试对话 + 消息，注册到 Tracker
  - `e2e/fixtures/index.ts` 增加 `chatHelper` fixture

- [ ] **F0.3 Vitest Chat 测试辅助**
  - `tests/helpers/chat-test-setup.ts`:
    - `setupChatTestUser()`: 创建唯一测试用户（`chat-test-{ts}-{rand}@test.vibeflow.local`）
    - `cleanupChatTestUser()`: 按依赖序删除全部 Chat 数据 + 用户
    - `skipIfNoDb()`: DB 不可用时 graceful skip
  - 验证: 创建用户 → 创建 Conversation + ChatMessage → cleanup → 数据全部消失

- [ ] **F0.4 LLM Mock 工具**
  - `tests/helpers/llm-mock.ts`:
    - `mockStreamText(response)`: mock Vercel AI SDK `streamText`，返回预设的流式文本响应
    - `mockStreamTextWithToolUse(toolCalls)`: mock 含 tool_use 的响应，验证 tool execute 被调用
    - `mockGenerateText(response)`: mock `generateText`，用于摘要生成等场景
  - 所有 Chat service 测试复用此 mock，不调用真实 LLM API

### F1. 数据层

- [ ] **F1.1 Prisma Schema**
  - `Conversation` 模型（含 `ConversationType` / `ConversationStatus` 枚举，MVP 只用 `DEFAULT`）
  - `ChatMessage` 模型（role / content / metadata / tokenCount）
  - `LLMUsageLog` 模型（inputTokens / outputTokens / contextLength / contextUsagePercent）
  - `db:migrate`

- [ ] **F1.2 Octopus 协议类型扩展**
  - `src/types/octopus.ts` 新增事件: `CHAT_MESSAGE`, `CHAT_ACTION`
  - 新增命令: `CHAT_RESPONSE`, `CHAT_TOOL_CALL`, `CHAT_TOOL_RESULT`, `CHAT_SYNC`
  - Payload 接口定义: `ChatMessagePayload`, `ChatResponsePayload`, `ChatToolCallPayload`, `ChatToolResultPayload`, `ChatActionPayload`

- [ ] **F1.3 测试: 数据层**
  - `tests/property/chat-message-schema.property.ts`:
    - 任意合法 ChatMessage 字段组合 → 通过 Prisma 写入/读取 round-trip 一致
    - ConversationType 枚举覆盖: DEFAULT / DAILY / TOPIC 均可写入
  - `tests/property/chat-octopus-protocol.property.ts`:
    - CHAT_* 事件/命令的 payload 满足 validateEvent / validateCommand
    - 与现有 Octopus 协议一致性（继承 base fields）

### F2. LLM 引擎

- [ ] **F2.1 依赖安装**
  - `npm install ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google`
  - `.env` 配置 API Keys

- [ ] **F2.2 模型注册 `llm.config.ts`**
  - `MODEL_REGISTRY`: Anthropic / OpenAI / Google（Qwen / Kimi 配置预留，暂不验证）
  - `MODEL_META`: 各模型上下文窗口 / 最大输出 / provider / displayName
  - `getModel(modelId)` 函数

- [ ] **F2.3 LLM 调用编排 `llm-adapter.service.ts`**
  - `callLLM(model, system, messages, tools, onChunk, onFinish)`: 封装 `streamText()` 的统一调用入口
  - 流式输出 → `onChunk` 回调 → 最终 `onFinish` 回调
  - 错误处理: Tool Use 不支持时的 fallback

- [ ] **F2.4 测试: LLM 引擎**
  - `tests/services/llm-adapter.service.test.ts`:
    - `getModel()`: 已注册 modelId → 返回 provider 实例；未知 modelId → 抛错
    - `callLLM()` (mock streamText): 纯文本响应 → onChunk 被调用 N 次 + onFinish 被调用 1 次
    - `callLLM()` (mock streamText): 含 tool_use 响应 → tool execute 被调用 → tool_result 回传
    - `callLLM()` error fallback: Tool Use 不支持时 → 降级为无 tools 调用
  - `tests/property/model-registry.property.ts`:
    - MODEL_REGISTRY 中每个 key 在 MODEL_META 中都有对应条目
    - MODEL_META.contextWindow > MODEL_META.maxOutputTokens（不变量）

### F3. 会话管理

- [ ] **F3.1 会话核心 `chat.service.ts`**
  - `getOrCreateDefaultConversation(userId)`: 每用户一个活跃 DEFAULT 会话
  - `persistMessage(conversationId, role, content, metadata?)`: 消息写入 DB
  - `getHistory(userId, conversationId, limit?)`: 查询历史（含 userId 所有权验证）

- [ ] **F3.2 消息处理主流程**
  - `handleMessage(userId, content, onDelta)`: 完整链路
    1. 获取/创建会话
    2. 并发锁（同一 conversationId 互斥）
    3. 构建 LLM 消息
    4. 调用 LLM（流式）
    5. 持久化用户消息 + AI 回复
    6. 记录 token 使用

- [ ] **F3.3 并发锁**
  - `conversationLocks` Map，防止同一会话并发 LLM 调用导致上下文错乱
  - 前一请求未完成时，后续请求排队等待

- [ ] **F3.4 测试: 会话管理**
  - `tests/services/chat.service.test.ts`:
    - `getOrCreateDefaultConversation`: 首次调用 → 创建；重复调用 → 返回同一个
    - `getOrCreateDefaultConversation`: 不同 userId → 不同 Conversation
    - `persistMessage`: 写入后 getHistory 可读取，字段一致
    - `getHistory`: 查询别人的 conversationId → 返回错误（数据隔离）
    - `handleMessage` (mock LLM): 用户消息 + AI 回复均持久化到 DB
    - `handleMessage` (mock LLM): onDelta 回调被调用（流式 chunk）
  - `tests/services/chat-concurrency.test.ts`:
    - 同一 conversationId 并发 2 个 handleMessage → 串行执行（第二个等第一个完成）
    - 不同 conversationId 并发 → 并行执行（不互相阻塞）
  - `tests/property/chat-data-isolation.property.ts`:
    - 任意 userId 对 → getHistory 只能查到自己的消息
    - getOrCreateDefaultConversation 每个 userId 只有一个 ACTIVE DEFAULT

### F4. Tool 框架

- [ ] **F4.1 Tool 注册机制**
  - 统一的 Tool 注册函数：将 MCP Tool 定义（Zod schema）转为 Vercel AI SDK `tool()` 格式
  - userId 注入模式：Tool execute 闭包中从服务端上下文获取 userId，不信任 AI 传入
  - Tool 结果格式标准化

- [ ] **F4.2 首批 Tool 实现（验证链路用）**
  - 先绑定 3 个最基础的工具，跑通完整 Tool Use 链路：
    - `flow_complete_task`: 最简单的状态变更
    - `flow_create_task_from_nl`: 涉及自然语言解析
    - `flow_start_pomodoro`: 涉及状态机转换
  - 验证: 用户说 "帮我创建一个任务" → LLM 调用 tool → 执行 → 结果返回 → AI 总结

- [ ] **F4.3 Tool 确认机制框架**
  - `requiresConfirmation` 标记（低风险自动执行，高风险需确认）
  - `CHAT_TOOL_CALL` 推送确认请求
  - `handleToolConfirmation(userId, conversationId, toolCallId, action)`

- [ ] **F4.4 测试: Tool 框架**
  - `tests/services/chat-tools.test.ts`:
    - Tool 注册: Zod schema → tool() 格式，parameters 正确
    - Tool execute: userId 从闭包注入，不从 AI 参数读取
    - Tool execute: `flow_complete_task` 调用 → taskService.updateStatus 被调用 + 正确 userId
    - Tool execute: `flow_create_task_from_nl` 调用 → nlParserService.parseAndCreate 被调用
    - 确认机制: requiresConfirmation=true → 不自动执行，推送 CHAT_TOOL_CALL
    - 确认机制: handleToolConfirmation(confirm) → 执行工具；(cancel) → 不执行
  - `tests/property/chat-tool-userid-injection.property.ts`:
    - 任意 userId + 任意 tool 调用 → execute 内部使用的 userId === 注入的 userId（不从参数取）

### F5. 传输层

- [ ] **F5.1 Socket.io 事件处理**
  - `socket.ts` 的 `processOctopusEvent` 新增 `CHAT_MESSAGE` case → 调用 `chatService.handleMessage`
  - `CHAT_ACTION` case → 调用 `chatService.handleToolConfirmation`
  - 流式回调: `onDelta` → `sendOctopusCommand` 推送 `CHAT_RESPONSE` 到客户端

- [ ] **F5.2 多端消息同步**
  - AI 回复完成后，向同用户的其他在线设备广播 `CHAT_SYNC`
  - 用户消息也同步（iOS 发送 → Desktop 看到）

- [ ] **F5.3 测试: 传输层**
  - `e2e/tests/chat-basic.spec.ts`:
    - 发送 CHAT_MESSAGE → 收到 CHAT_RESPONSE (delta * N + complete)
    - CHAT_MESSAGE 含 tool 意图 → 收到 CHAT_TOOL_CALL + CHAT_TOOL_RESULT + CHAT_RESPONSE
    - 消息持久化: 发送后通过 tRPC chat.getHistory 可查到
  - `e2e/tests/chat-sync.spec.ts`:
    - 模拟两个 socket 连接（同 userId）→ A 发消息 → B 收到 CHAT_SYNC
    - A 和 B 的消息历史一致

### F6. 上下文管理

- [ ] **F6.1 System Prompt 构建**
  - `buildSystemPrompt(userId)`: 静态模板（角色定义 + 行为准则）+ 动态上下文
  - 动态上下文: 复用 `contextProviderService.getFullContext(userId)` — 当前状态、活跃番茄钟、Top 3 等
  - MVP 阶段始终加载全量上下文（不做意图路由）

- [ ] **F6.2 消息构建与滑动窗口**
  - `buildLLMMessages(userId, conversationId, newMessage)`:
    - DB 取最近 N=20 条消息
    - 跳过 `role: 'system'`（日期分割线等不送入 LLM）
    - 加入新用户消息
  - Token 裁剪: 超出预算时从最早的 recent 消息开始移除

- [ ] **F6.3 测试: 上下文管理**
  - `tests/services/chat-context.test.ts`:
    - `buildSystemPrompt`: 返回值包含当前状态、Top 3 等动态数据
    - `buildLLMMessages`: 数据库有 30 条消息 → 只取最近 20 条
    - `buildLLMMessages`: role='system' 的消息被跳过
    - `buildLLMMessages`: 新消息追加在末尾
    - Token 裁剪: 消息总 token 超出预算 → 从最早开始移除，直到预算内
  - `tests/property/chat-sliding-window.property.ts`:
    - 任意消息数 N → buildLLMMessages 返回 <= min(N, 20) + 1（新消息）条
    - 返回的消息中不包含 role='system'

### F7. 可观测性

- [ ] **F7.1 Token 使用记录**
  - `trackUsage(userId, conversationId, messageId, scene, modelId, usage)`:
    - 写入 `LLMUsageLog`
    - 计算 `contextUsagePercent`
  - 每次 `onFinish` 回调中调用

- [ ] **F7.2 会话级统计查询**
  - `getConversationStats(userId, conversationId)`: 累计 tokens / 最新上下文使用率 / 消息数 / 当前模型

- [ ] **F7.3 测试: 可观测性**
  - `tests/services/chat-observability.test.ts`:
    - `trackUsage`: 写入后 LLMUsageLog 记录存在，字段正确
    - `trackUsage`: contextUsagePercent = inputTokens / contextWindow * 100
    - `getConversationStats`: 多次调用后 totalTokens = sum(所有 log)
    - `getConversationStats`: 查询别人的 conversationId → 返回空/错误
  - `tests/property/chat-token-tracking.property.ts`:
    - 任意 inputTokens/outputTokens → totalTokens = input + output
    - contextUsagePercent 始终在 [0, 100+] 范围内（可能超 100 表示溢出）

### F8. 端侧框架 (iOS)

- [ ] **F8.1 类型定义**
  - `vibeflow-ios/src/types/chat.ts`: ChatMessage, PendingToolCall, ChatAttachment, ChatResponsePayload 等

- [ ] **F8.2 Chat Store (Zustand)**
  - `isPanelOpen` / `panelHeight`
  - `messages` / `isStreaming` / `streamingContent`
  - `pendingToolCalls`
  - Actions: `sendMessage`, `appendStreamDelta`, `finalizeStreamMessage`, `confirmToolCall`, `cancelToolCall`

- [ ] **F8.3 Chat Service (iOS)**
  - 监听 Socket.io 命令: `CHAT_RESPONSE`, `CHAT_TOOL_CALL`, `CHAT_TOOL_RESULT`, `CHAT_SYNC`
  - 发送事件: `CHAT_MESSAGE`, `CHAT_ACTION`
  - `initialize()` / `cleanup()` 生命周期

- [ ] **F8.4 Chat UI 骨架**
  - `ChatFAB.tsx`: 浮动按钮（右下角）
  - `ChatPanel.tsx`: BottomSheet 容器（半屏/全屏）
  - `ChatMessageList.tsx`: FlatList
  - `ChatBubble.tsx`: 用户/AI 消息气泡（支持 Markdown）
  - `ChatInput.tsx`: 输入框 + 发送按钮

- [ ] **F8.5 AppProvider 集成**
  - `ChatFAB` + `ChatPanel` 放在 `NavigationContainer` 外层
  - `chatService.initialize()` 在 AppProvider `useEffect` 中调用

- [ ] **F8.6 测试: 端侧框架**
  - `vibeflow-ios/__tests__/chat-store.test.ts`:
    - `appendStreamDelta`: 多次追加 → streamingContent 拼接正确
    - `finalizeStreamMessage`: isStreaming → false, streamingContent 清空, messages 追加完整消息
    - `sendMessage`: messages 追加用户消息 + isStreaming = true
    - `confirmToolCall`: 对应 pendingToolCall 移除
    - `openPanel` / `closePanel`: isPanelOpen 切换
  - `vibeflow-ios/__tests__/chat-service.test.ts` (mock websocketService):
    - `sendMessage` → websocketService.sendEvent 被调用，eventType = CHAT_MESSAGE
    - 收到 CHAT_RESPONSE delta → store.appendStreamDelta 被调用
    - 收到 CHAT_RESPONSE complete → store.finalizeStreamMessage 被调用
    - 收到 CHAT_SYNC → store.messages 更新

### Foundation 人工验收

> **前置条件**: `npm test` + `cd vibeflow-ios && npx jest` 全绿。以下为在真机/模拟器上的人工验收。
>
> **排障原则**: 人工验收不通过时，首先排查关联测试是否正常。如果关联测试全绿但人工验收仍失败，说明测试覆盖有遗漏，需要先补测试再修 bug。

#### 交付物: iOS 上可用的 AI Chat 面板，支持基础对话和 3 个工具调用

- [ ] **QA-F1 Chat 入口**: 打开 iOS App → 右下角看到 AI 浮动按钮 → 点击 → Chat 面板从底部滑出 → 半屏展示
  - 🔗 关联测试: `vibeflow-ios/__tests__/chat-store.test.ts` (openPanel/closePanel), F8.4 ChatFAB/ChatPanel 组件
  - ❌ 不通过时排查: `npx jest chat-store` → openPanel/closePanel 用例是否绿

- [ ] **QA-F2 面板交互**: 拖拽 Chat 面板 → 可从半屏拉到全屏 → 再拉回半屏 → 点关闭按钮 → 面板收起 → 底层页面恢复正常
  - 🔗 关联测试: `vibeflow-ios/__tests__/chat-store.test.ts` (isPanelOpen/panelHeight 状态)
  - ❌ 不通过时排查: 手势交互多为 UI 层，若 store 测试绿但交互异常 → 补 ChatPanel 交互测试

- [ ] **QA-F3 基础对话**: 输入 "你好" → 发送 → 看到消息气泡出现在列表 → AI 回复逐字流式显示 → 最终显示完整回复
  - 🔗 关联测试: `vibeflow-ios/__tests__/chat-store.test.ts` (sendMessage, appendStreamDelta, finalizeStreamMessage) + `vibeflow-ios/__tests__/chat-service.test.ts` (sendMessage→sendEvent, CHAT_RESPONSE→appendStreamDelta) + `tests/services/chat.service.test.ts` (handleMessage) + `e2e/tests/chat-basic.spec.ts` (CHAT_MESSAGE→CHAT_RESPONSE)
  - ❌ 不通过时排查: `npx vitest run tests/services/chat.service.test.ts` → handleMessage 链路; `npx jest chat-service` → iOS 侧 Socket 事件

- [ ] **QA-F4 Tool 调用 — 创建任务**: 输入 "帮我创建一个任务叫买咖啡" → AI 回复确认创建 → 切到任务列表页面 → 确认 "买咖啡" 任务存在
  - 🔗 关联测试: `tests/services/chat-tools.test.ts` (flow_create_task_from_nl execute) + `tests/services/llm-adapter.service.test.ts` (含 tool_use 响应) + `e2e/tests/chat-basic.spec.ts` (CHAT_TOOL_CALL + CHAT_TOOL_RESULT)
  - ❌ 不通过时排查: `npx vitest run tests/services/chat-tools.test.ts` → tool execute 是否正确调用 service

- [ ] **QA-F5 Tool 调用 — 完成任务**: 输入 "把买咖啡标记为完成" → AI 回复确认 → 切到任务列表 → 任务状态已变为完成
  - 🔗 关联测试: `tests/services/chat-tools.test.ts` (flow_complete_task execute + userId 注入) + `tests/property/chat-tool-userid-injection.property.ts`
  - ❌ 不通过时排查: `npx vitest run tests/services/chat-tools.test.ts -t "flow_complete_task"`

- [ ] **QA-F6 Tool 调用 — 开始番茄钟**: 在 PLANNING 状态下输入 "开始专注" → AI 回复已开始 → 顶部 PomodoroStatus 显示计时中
  - 🔗 关联测试: `tests/services/chat-tools.test.ts` (flow_start_pomodoro execute) + `tests/services/llm-adapter.service.test.ts` (tool_use 链路)
  - ❌ 不通过时排查: `npx vitest run tests/services/chat-tools.test.ts -t "flow_start_pomodoro"` → 状态机是否允许转换

- [ ] **QA-F7 消息持久化**: 关闭 Chat 面板 → 重新点击浮动按钮打开 → 之前的对话历史全部可见 → 杀掉 App 重启 → 再打开 Chat → 历史仍在
  - 🔗 关联测试: `tests/services/chat.service.test.ts` (persistMessage + getHistory) + `tests/property/chat-message-schema.property.ts` (round-trip) + `e2e/tests/chat-basic.spec.ts` (消息持久化)
  - ❌ 不通过时排查: `npx vitest run tests/services/chat.service.test.ts -t "persistMessage"` → 写入/读取是否一致

- [ ] **QA-F8 多端同步**: 同一账号在 iOS 和 Desktop 同时登录 → iOS 发一条消息 → Desktop 端看到该消息和 AI 回复
  - 🔗 关联测试: `e2e/tests/chat-sync.spec.ts` (双 socket 同步) + `vibeflow-ios/__tests__/chat-service.test.ts` (CHAT_SYNC 处理)
  - ❌ 不通过时排查: `npx playwright test e2e/tests/chat-sync.spec.ts` → CHAT_SYNC 广播是否正常

- [ ] **QA-F9 并发安全**: 快速连续点两次发送（或在两个设备同时发消息）→ 两条消息都得到正确回复 → 对话历史顺序正确，无乱序
  - 🔗 关联测试: `tests/services/chat-concurrency.test.ts` (同 conversationId 串行 + 不同 conversationId 并行)
  - ❌ 不通过时排查: `npx vitest run tests/services/chat-concurrency.test.ts` → 并发锁是否生效

- [ ] **QA-F10 异常恢复**: 对话过程中断网 → 重新连网 → 发送新消息 → 正常回复（不丢失之前历史）
  - 🔗 关联测试: `tests/services/chat.service.test.ts` (getHistory) + `vibeflow-ios/__tests__/chat-service.test.ts` (重连后消息恢复)
  - ❌ 不通过时排查: 若无专门的断线恢复测试 → 需补 `chat-reconnect.test.ts`（测试 Socket 断开重连后 getHistory 重新加载）

---

## 第二部分：场景扩展 (Scenarios)

基础能力就绪后，以下场景可以**独立开发、独立验收**，按业务价值排序。

### S1. 核心 Tool 全量绑定

> 依赖: F4 Tool 框架

- [ ] **S1.1 任务管理类 Tools (6 个)**
  - `flow_update_task`, `flow_get_task`, `flow_add_subtask`
  - `flow_get_top3`, `flow_set_top3`, `flow_quick_create_inbox_task`

- [ ] **S1.2 番茄钟控制类 Tools (4 个)**
  - `flow_switch_task`, `flow_complete_current_task`
  - `flow_start_taskless_pomodoro`, `flow_record_pomodoro`

- [ ] **S1.3 批量与规划类 Tools (5 个)**
  - `flow_get_overdue_tasks`, `flow_get_backlog_tasks`
  - `flow_batch_update_tasks`, `flow_set_plan_date`, `flow_move_task`

- [ ] **S1.4 项目管理类 Tools (5 个)**
  - `flow_create_project`, `flow_update_project`, `flow_get_project`
  - `flow_create_project_from_template`, `flow_analyze_task_dependencies`

- [ ] **S1.5 其他 Tools (3 个)**
  - `flow_report_blocker`, `flow_delete_task`, `flow_get_task_context`
  - `flow_generate_daily_summary`

- [ ] **S1.6 测试: Tool 全量绑定**
  - `tests/services/chat-tools-full.test.ts`:
    - 每个 Tool: execute 调用对应 service 方法 + userId 注入正确
    - Tool 参数 Zod schema 验证: 合法输入通过，非法输入拒绝
  - `tests/property/chat-tool-completeness.property.ts`:
    - 现有 MCP tools 列表（28 个）与 Chat Tool 注册表做集合比较 → 全覆盖

**人工验收** (前置: S1.6 测试全绿):

> 交付物: 所有 VibeFlow 操作均可通过对话完成
>
> 排障: `npx vitest run tests/services/chat-tools-full.test.ts` + `npx vitest run tests/property/chat-tool-completeness.property.ts`

- [ ] **QA-S1.1** 输入 "帮我添加一个子任务叫写单元测试" → 子任务创建成功
  - 🔗 `tests/services/chat-tools-full.test.ts` → `flow_add_subtask` execute 用例
- [ ] **QA-S1.2** 输入 "切换到下一个任务" → 番茄钟绑定任务切换
  - 🔗 `tests/services/chat-tools-full.test.ts` → `flow_switch_task` execute 用例
- [ ] **QA-S1.3** 输入 "有哪些逾期任务" → 列出逾期任务列表
  - 🔗 `tests/services/chat-tools-full.test.ts` → `flow_get_overdue_tasks` execute 用例
- [ ] **QA-S1.4** 输入 "创建一个叫用户中心的项目" → 项目创建成功 → 输入 "项目进展怎么样" → 返回进度分析
  - 🔗 `tests/services/chat-tools-full.test.ts` → `flow_create_project` + `flow_get_project` execute 用例
- [ ] **QA-S1.5** 输入 "今天干了什么" → 返回每日总结
  - 🔗 `tests/services/chat-tools-full.test.ts` → `flow_generate_daily_summary` execute 用例

### S2. 高风险操作确认 UI

> 依赖: F4.3 确认框架 + F8.4 UI 骨架

- [ ] **S2.1 确认卡片 UI (iOS)**
  - `ChatToolCallCard.tsx`: 操作描述 + 参数预览 + 确认/取消按钮
  - `ChatToolResultCard.tsx`: 执行结果卡片（成功绿 / 失败红）
  - 动画反馈

- [ ] **S2.2 确认规则定义**
  - 定义哪些 Tool 需要确认: `flow_delete_task`, `flow_batch_update_tasks`, 设置类等
  - 其余自动执行

- [ ] **S2.3 测试: 确认机制**
  - `e2e/tests/chat-confirmation.spec.ts`:
    - 触发高风险操作 → 收到 CHAT_TOOL_CALL (requiresConfirmation=true) → 发送 confirm → 工具执行 → 数据变更
    - 触发高风险操作 → 发送 cancel → 工具不执行 → 数据未变更
    - 触发低风险操作 → 自动执行（无 CHAT_TOOL_CALL 带 requiresConfirmation）

**人工验收** (前置: S2.3 测试全绿):

> 交付物: 危险操作有安全门，不会误删数据
>
> 排障: `npx vitest run tests/services/chat-tools.test.ts -t "确认机制"` + `npx playwright test e2e/tests/chat-confirmation.spec.ts`

- [ ] **QA-S2.1** 输入 "删除买咖啡这个任务" → Chat 中出现确认卡片（显示任务名 + 删除操作描述）→ 点 "取消" → 任务仍在
  - 🔗 `e2e/tests/chat-confirmation.spec.ts` → requiresConfirmation=true + cancel → 数据未变更
- [ ] **QA-S2.2** 再次输入 "删除买咖啡" → 确认卡片出现 → 点 "确认" → 卡片变绿显示已删除 → 切到任务列表 → 任务已消失
  - 🔗 `e2e/tests/chat-confirmation.spec.ts` → confirm → 工具执行 → 数据变更
- [ ] **QA-S2.3** 输入 "帮我创建一个任务叫测试" → 直接执行，**没有**确认卡片（低风险操作自动执行）
  - 🔗 `e2e/tests/chat-confirmation.spec.ts` → 低风险操作自动执行用例

### S3. Web / Desktop Chat

> 依赖: F1-F7 (服务端基础能力)

- [ ] **S3.1 Web Chat 组件**
  - `src/components/chat/`: ChatFAB, ChatPanel, ChatMessageList, ChatBubble, ChatInput, ChatProvider
  - tRPC `chat.sendMessage` / `chat.getHistory`
  - Socket.io CHAT_RESPONSE 监听

- [ ] **S3.2 tRPC Chat Router**
  - `src/server/routers/chat.ts`: `sendMessage`, `getHistory`, `getConversationStats`
  - `protectedProcedure`

- [ ] **S3.3 Desktop 增强**
  - 全局快捷键 ⌘⇧Space
  - `window.vibeflow.chat.onToggleChat()` preload API
  - Tray 菜单 "AI 对话" 入口

- [ ] **S3.4 测试: Web/Desktop Chat**
  - `e2e/tests/chat-web.spec.ts`:
    - tRPC chat.getHistory → 返回消息列表（需认证）
    - tRPC chat.getHistory 无认证 → 401
    - tRPC chat.getHistory 查别人的 → 空/错误
  - `vibeflow-desktop/tests/chat-shortcut.test.ts`:
    - 快捷键注册验证

**人工验收** (前置: S3.4 测试全绿):

> 交付物: Desktop 端完整的 Chat 体验
>
> 排障: `npx playwright test e2e/tests/chat-web.spec.ts` + `cd vibeflow-desktop && npx vitest run tests/chat-shortcut.test.ts`

- [ ] **QA-S3.1** 打开 Desktop 应用 → 看到 Chat 浮动按钮 → 点击 → Chat 面板打开 → 对话正常
  - 🔗 `e2e/tests/chat-web.spec.ts` → tRPC chat.getHistory 认证 + 返回
- [ ] **QA-S3.2** 在任意应用中按 ⌘⇧Space → VibeFlow 窗口弹出并打开 Chat → 输入 "创建任务" → 正常执行
  - 🔗 `vibeflow-desktop/tests/chat-shortcut.test.ts` → 快捷键注册验证
- [ ] **QA-S3.3** Tray 右键菜单 → 看到 "AI 对话" 入口 → 点击 → 打开 Chat
  - 🔗 `vibeflow-desktop/tests/chat-shortcut.test.ts` → Tray 菜单项验证
- [ ] **QA-S3.4** Desktop 发一条消息 → iOS 端 Chat 中看到同步 → iOS 回复 → Desktop 看到同步
  - 🔗 `e2e/tests/chat-sync.spec.ts` → 双 socket 同步用例（复用 Foundation 测试）

### S4. AI 主动触发框架

> 依赖: F5 传输层 + F3 会话管理

- [ ] **S4.1 触发器框架 `ai-trigger.service.ts`**
  - `TriggerDefinition` 接口 + 注册表
  - `shouldFire()`: 防抖 / 用户偏好 / 静默期 / FOCUS 保护
  - `fire()`: LLM 生成或模板渲染 → Socket.io 推送 → 审计日志
  - 消息标记 `metadata.isProactive` + `metadata.triggerId`

- [ ] **S4.2 补齐 MCP 事件发布**
  - `daily_state.over_rest_entered` → overRestService
  - `entertainment.started/stopped` → entertainmentService
  - `daily_state.daily_reset` → dailyResetSchedulerService
  - `early_warning.triggered` → earlyWarningService

- [ ] **S4.3 主动消息客户端展示**
  - iOS: `isProactive` 消息视觉区分（触发原因标签 + 快捷操作按钮）
  - Chat 面板未打开时 → 系统通知

- [ ] **S4.4 测试: 主动触发框架**
  - `tests/services/ai-trigger.service.test.ts`:
    - `shouldFire`: 全局关闭 → false
    - `shouldFire`: 该触发器关闭 → false
    - `shouldFire`: 防抖期内 → false
    - `shouldFire`: FOCUS 状态 + low 优先级 → false
    - `shouldFire`: 静默时段 + 非 high → false
    - `shouldFire`: 所有条件满足 → true
    - `fire`: 推送消息到 Socket.io + 写入审计日志
    - `fire`: useLLM=true → 调用 LLM 生成消息；useLLM=false → 使用模板
  - `tests/property/ai-trigger-cooldown.property.ts`:
    - 任意 cooldownSeconds + 两次触发间隔 < cooldown → 第二次不触发
    - 间隔 >= cooldown → 两次都触发

**人工验收** (前置: S4.4 测试全绿):

> 交付物: AI 可以主动跟你说话（不只是你问它答）
>
> 排障: `npx vitest run tests/services/ai-trigger.service.test.ts` + `npx vitest run tests/property/ai-trigger-cooldown.property.ts`

- [ ] **QA-S4.1** Chat 面板打开时 → 通过后台手动触发一条主动消息 → 消息出现在 Chat 中，带有特殊标签（如 "系统消息"），视觉上与普通对话有区分
  - 🔗 `tests/services/ai-trigger.service.test.ts` → fire 推送消息到 Socket.io + 审计日志
- [ ] **QA-S4.2** Chat 面板关闭时 → 触发主动消息 → 收到系统通知 → 点击通知 → Chat 面板打开并跳转到该消息
  - 🔗 `tests/services/ai-trigger.service.test.ts` → fire 推送验证; iOS 通知为端侧 UI，若 fire 测试绿但通知异常 → 补 iOS 通知集成测试

### S5. 状态转换触发器

> 依赖: S4 触发框架

- [ ] **S5.1 `on_planning_enter`**
  - Airlock 完成 → LLM 生成每日规划建议（Top 3 推荐）

- [ ] **S5.2 `on_rest_enter`**
  - 番茄钟完成 → LLM 总结本轮 + 推荐下一步

- [ ] **S5.3 `on_over_rest_enter`**
  - 休息超时 → 模板提醒回归

- [ ] **S5.4 `over_rest_escalation`**
  - 超时升级: 0-5min 温和 / 5-10min 催促 / 10min+ 强烈

- [ ] **S5.5 `task_stuck`**
  - 同一任务连续 3+ 番茄钟 → LLM 建议拆分

- [ ] **S5.6 测试: 状态转换触发器**
  - `tests/services/chat-triggers-state.test.ts`:
    - 模拟 `daily_state.changed` 事件 (newState=planning) → `on_planning_enter` 触发
    - 模拟 `pomodoro.completed` 事件 → `on_rest_enter` 触发
    - 模拟 over_rest 条件 → `on_over_rest_enter` 触发
    - `over_rest_escalation`: 3 个时间段产生 3 种不同语气的消息
    - `task_stuck`: 同一任务 2 个番茄钟 → 不触发；3 个 → 触发
  - `e2e/tests/chat-trigger-integration.spec.ts`:
    - 完成 Airlock → 收到 CHAT_RESPONSE (isProactive=true, triggerId=on_planning_enter)
    - 完成番茄钟 → 收到休息建议消息

**人工验收** (前置: S5.6 测试全绿):

> 交付物: AI 在关键时刻自动出现，像一个贴心的工作伙伴
>
> 排障: `npx vitest run tests/services/chat-triggers-state.test.ts` + `npx playwright test e2e/tests/chat-trigger-integration.spec.ts`

- [ ] **QA-S5.1** 完成 Airlock 进入 PLANNING → Chat 中自动出现晨间规划建议（含 Top 3 推荐）→ 可以直接回复调整
  - 🔗 `tests/services/chat-triggers-state.test.ts` → `on_planning_enter` 触发用例 + `e2e/tests/chat-trigger-integration.spec.ts` → Airlock 完成后收到 CHAT_RESPONSE
- [ ] **QA-S5.2** 完成一个番茄钟 → 进入 REST → Chat 自动出现总结（"这轮你在 XX 上工作了 25 分钟"）+ 下一步推荐
  - 🔗 `tests/services/chat-triggers-state.test.ts` → `on_rest_enter` 触发用例 + `e2e/tests/chat-trigger-integration.spec.ts` → 番茄钟完成后收到休息建议
- [ ] **QA-S5.3** REST 状态超时 → 收到温和提醒 → 继续超时 → 提醒语气变强
  - 🔗 `tests/services/chat-triggers-state.test.ts` → `over_rest_escalation` 3 个时间段 3 种语气用例
- [ ] **QA-S5.4** 同一任务连续做 3 个番茄钟 → 收到 "这个任务可能比预期复杂，建议拆分" 的提示
  - 🔗 `tests/services/chat-triggers-state.test.ts` → `task_stuck` 2 个番茄钟不触发 / 3 个触发
- [ ] **QA-S5.5** FOCUS 状态中 → **不会**收到低优先级的主动消息（不打断心流）
  - 🔗 `tests/services/ai-trigger.service.test.ts` → `shouldFire`: FOCUS + low 优先级 → false

### S6. 意图路由与 Dynamic Context

> 依赖: F6 上下文管理

- [ ] **S6.1 意图分类 `classifyIntent()`**
  - 关键词匹配: quick_action / planning / review / task_mgmt / project
  - 零 LLM 成本

- [ ] **S6.2 Tool 子集策略**
  - 按系统状态 + 意图动态选择 Tool 子集
  - FOCUS: + switch_task, complete_current_task, report_blocker
  - PLANNING: + overdue, backlog, batch_update, set_plan_date, move_task
  - 意图=project: + 项目管理 5 个

- [ ] **S6.3 Dynamic Context 按意图加载**
  - planning → tasks/today + analytics/productivity
  - review → history/pomodoros + analytics/productivity
  - task_mgmt → tasks/today + projects/active
  - quick_action → 不加载额外上下文

- [ ] **S6.4 场景路由配置**
  - `DEFAULT_SCENE_CONFIG`: 不同场景使用不同模型/温度/maxTokens
  - `getSceneConfig()`: 代码默认 → 环境变量 → 用户设置 三级优先级

- [ ] **S6.5 测试: 意图路由**
  - `tests/services/chat-intent.test.ts`:
    - "搞定了" / "完成" / "done" → quick_action
    - "帮我规划今天" / "今天做什么" → planning
    - "这周效率怎么样" → review
    - "创建一个任务" / "把 XX 调到 P1" → task_mgmt
    - "项目进度" / "创建项目" → project
    - 无法识别 → default
  - `tests/services/chat-tool-subset.test.ts`:
    - FOCUS 状态 → 返回的 tools 包含 switch_task, 不包含 batch_update
    - PLANNING 状态 → 包含 batch_update, set_plan_date
    - 核心 9 个 tool 始终包含
  - `tests/services/chat-scene-config.test.ts`:
    - 用户设置覆盖 → 使用用户设置的 model
    - 环境变量覆盖 → 使用环境变量的 model
    - 无覆盖 → 使用默认配置
  - `tests/property/chat-intent-classification.property.ts`:
    - classifyIntent 对任意字符串输入都返回合法的意图枚举（不抛错）

**人工验收** (前置: S6.5 测试全绿):

> 交付物: AI 回复更快更准 — 简单操作秒回，复杂规划深度思考
>
> 排障: `npx vitest run tests/services/chat-intent.test.ts` + `npx vitest run tests/services/chat-tool-subset.test.ts` + `npx vitest run tests/services/chat-scene-config.test.ts`

- [ ] **QA-S6.1** 输入 "搞定了" → 回复速度明显快于复杂问题（体感 <2s），回复简洁
  - 🔗 `tests/services/chat-intent.test.ts` → "搞定了" → quick_action; `tests/services/chat-scene-config.test.ts` → quick_action 使用轻量模型
- [ ] **QA-S6.2** 输入 "帮我规划今天的工作" → 回复包含今日任务、逾期情况、Top 3 建议（说明加载了完整上下文）
  - 🔗 `tests/services/chat-intent.test.ts` → "帮我规划今天" → planning; Dynamic Context 加载 tasks/today + analytics
- [ ] **QA-S6.3** 输入 "这周效率怎么样" → 回复包含番茄钟统计、完成任务数等数据（说明加载了分析数据）
  - 🔗 `tests/services/chat-intent.test.ts` → review 意图; Dynamic Context 加载 history/pomodoros + analytics
- [ ] **QA-S6.4** FOCUS 状态下输入 "帮我记一下还要写文档" → AI 只提供了创建子任务的工具，没有提供批量修改等不相关工具
  - 🔗 `tests/services/chat-tool-subset.test.ts` → FOCUS 状态包含 switch_task 但不包含 batch_update

### S7. 上下文长对话保障

> 依赖: F6 + F7

- [ ] **S7.1 摘要生成**
  - 消息 > 40 条时用 Haiku 生成早期消息摘要
  - 摘要缓存，注入 LLM 消息头部

- [ ] **S7.2 Tool Result 压缩**
  - DB 存完整 JSON，LLM Prompt 中截断到 500 tokens

- [ ] **S7.3 上下文使用率 UI**
  - Chat 面板底部: 使用率条 + 颜色梯度（绿/黄/橙/红）
  - 展示 tokens / 模型窗口 + 消息轮次 + 模型名

- [ ] **S7.4 自动压缩触发**
  - 上下文使用率 > 80% → 自动生成摘要压缩历史
  - > 90% → 建议开新会话

- [ ] **S7.5 测试: 长对话保障**
  - `tests/services/chat-summary.test.ts`:
    - 消息数 <= 40 → 不生成摘要
    - 消息数 > 40 → 调用 LLM 生成摘要（mock），摘要注入消息头部
    - 摘要缓存: 第二次调用不重新生成
  - `tests/services/chat-tool-result-compression.test.ts`:
    - 短 tool result (<500 tokens) → 原样保留
    - 长 tool result (>500 tokens) → 截断到 500 tokens 以内
  - `tests/property/chat-context-budget.property.ts`:
    - 任意消息数 → buildLLMMessages 返回的总 token 不超过 recentMessageMaxTokens + 摘要 token

**人工验收** (前置: S7.5 测试全绿):

> 交付物: 长时间使用不卡顿，对话越长 AI 仍然记得之前说了什么
>
> 排障: `npx vitest run tests/services/chat-summary.test.ts` + `npx vitest run tests/services/chat-tool-result-compression.test.ts` + `npx vitest run tests/property/chat-context-budget.property.ts`

- [ ] **QA-S7.1** 与 AI 进行 40+ 轮对话 → AI 仍能正常回复，不报错
  - 🔗 `tests/services/chat-summary.test.ts` → 消息数 > 40 触发摘要; `tests/property/chat-context-budget.property.ts` → 总 token 不超预算
- [ ] **QA-S7.2** 长对话中引用 20 条消息之前的内容 → AI 能基于摘要给出合理回复（不必完美，但不能完全遗忘）
  - 🔗 `tests/services/chat-summary.test.ts` → 摘要注入消息头部 + 缓存不重复生成
- [ ] **QA-S7.3** Chat 面板底部可以看到上下文使用率指示条（如 "78% 156K/200K tokens"）
  - 🔗 `tests/services/chat-observability.test.ts` → getConversationStats 返回正确统计; iOS 端为 UI 层
- [ ] **QA-S7.4** 使用率超过 80% 时 → 指示条变为橙色 → 提示 "对话较长，建议归档"
  - 🔗 `tests/services/chat-observability.test.ts` → contextUsagePercent 计算; 阈值逻辑为端侧 UI，若 stats 正确但 UI 未变色 → 补 iOS 组件测试

### S8. 会话归档与历史

> 依赖: F3 会话管理

- [ ] **S8.1 Daily Archive**
  - 04:00 AM: 归档 DEFAULT → DAILY/ARCHIVED + 创建新 DEFAULT
  - 日期分割线 (`role: 'system'`)

- [ ] **S8.2 历史记录 UI**
  - iOS / Web "历史记录" 入口
  - 归档 Session 列表 → 只读消息查看

- [ ] **S8.3 会话清理**
  - 30 天以上消息自动删除

- [ ] **S8.4 测试: 会话归档**
  - `tests/services/chat-archive.test.ts`:
    - archiveAndRotate: 旧 DEFAULT → type=DAILY, status=ARCHIVED, date=昨天
    - archiveAndRotate: 新 DEFAULT 创建，messages 为空
    - archiveAndRotate: getOrCreateDefaultConversation 返回新的（不是旧的）
    - 会话清理: 31 天前的消息被删除，30 天内的保留
  - `tests/property/chat-archive-invariant.property.ts`:
    - 任意时刻，每个 userId 最多一个 type=DEFAULT, status=ACTIVE 的 Conversation

**人工验收** (前置: S8.4 测试全绿):

> 交付物: 每天一个干净的起点，但过去的对话不会丢失
>
> 排障: `npx vitest run tests/services/chat-archive.test.ts` + `npx vitest run tests/property/chat-archive-invariant.property.ts`

- [ ] **QA-S8.1** 等待 04:00 AM 重置（或手动触发）→ 打开 Chat → 看到空白对话区 + 日期分割线
  - 🔗 `tests/services/chat-archive.test.ts` → archiveAndRotate: 旧 DEFAULT 归档 + 新 DEFAULT 创建
- [ ] **QA-S8.2** Chat 面板中找到 "历史记录" 入口 → 点击 → 看到按日期排列的归档会话列表
  - 🔗 `tests/services/chat-archive.test.ts` → archiveAndRotate 后 type=DAILY, status=ARCHIVED; `tests/property/chat-archive-invariant.property.ts` → 唯一 ACTIVE DEFAULT 不变量
- [ ] **QA-S8.3** 点击某天的归档会话 → 看到当天完整对话（只读，不能发新消息）
  - 🔗 `tests/services/chat-archive.test.ts` → getHistory 对 ARCHIVED 会话返回完整消息; 只读交互为端侧 UI 层

### S9. 定时触发器

> 依赖: S4 触发框架

- [ ] **S9.1 `morning_greeting`**: 工作日晨间提醒（LOCKED 状态时）
- [ ] **S9.2 `evening_summary`**: 下班时间今日总结（LLM）
- [ ] **S9.3 `progress_check`**: 每 2h 进度检查（FOCUS 不打断）
- [ ] **S9.4 `midday_check`**: 午间回顾（默认关闭）

- [ ] **S9.5 测试: 定时触发器**
  - `tests/services/chat-triggers-cron.test.ts`:
    - `morning_greeting`: 用户 LOCKED + 工作日 9:00 → 触发
    - `morning_greeting`: 用户已在 PLANNING → 不触发
    - `morning_greeting`: 周末 → 不触发
    - `evening_summary`: 下班时间 → 触发 + 消息包含今日完成统计
    - `progress_check`: FOCUS 状态 → 不打断（入队）
    - `midday_check`: 默认关闭 → 不触发

**人工验收** (前置: S9.5 测试全绿):

> 交付物: AI 像定时闹钟一样在固定时间提醒你
>
> 排障: `npx vitest run tests/services/chat-triggers-cron.test.ts`

- [ ] **QA-S9.1** 工作日 9:00 且用户仍在 LOCKED 状态 → Chat 收到 "新的一天开始了，你有 X 个任务..."
  - 🔗 `tests/services/chat-triggers-cron.test.ts` → `morning_greeting`: LOCKED + 工作日 9:00 → 触发; 非工作日/已 PLANNING → 不触发
- [ ] **QA-S9.2** 下班时间（如 18:00）→ Chat 收到今日工作总结（完成任务数、番茄钟数、效率趋势）
  - 🔗 `tests/services/chat-triggers-cron.test.ts` → `evening_summary`: 下班时间触发 + 消息包含今日完成统计
- [ ] **QA-S9.3** 已在 FOCUS 状态 → 到了 progress_check 时间 → **不会**收到消息（不打断）→ 进入 REST 后才收到
  - 🔗 `tests/services/chat-triggers-cron.test.ts` → `progress_check`: FOCUS → 不打断; `tests/services/ai-trigger.service.test.ts` → shouldFire FOCUS 保护

### S10. 用户配置

> 依赖: S4 (触发器) + S6 (场景路由)

- [ ] **S10.1 触发器配置 UI**
  - SettingsScreen "AI 助手" 区: 全局开关、静默时段、各触发器独立开关
  - `UserSettings.aiTriggerConfig`

- [ ] **S10.2 模型偏好设置 UI**
  - 默认模型 / 快速操作模型 / 规划模型 下拉选择
  - `UserSettings.aiModelConfig`

- [ ] **S10.3 测试: 用户配置**
  - `tests/services/chat-user-config.test.ts`:
    - aiTriggerConfig.enabled=false → 所有触发器不触发
    - aiTriggerConfig.triggers.morning_greeting.enabled=false → 该触发器不触发，其他不受影响
    - aiModelConfig 设置 chat:default 为 gpt-4o → resolveModelForChat 返回 gpt-4o
    - quietHours 22:00-07:00 → 23:00 触发 → 被静默（high 除外）

**人工验收** (前置: S10.3 测试全绿):

> 交付物: 用户可以自定义 AI 的行为方式
>
> 排障: `npx vitest run tests/services/chat-user-config.test.ts`

- [ ] **QA-S10.1** 设置页面 → "AI 助手" 区域 → 关闭 "晨间提醒" → 第二天 9:00 不再收到晨间消息
  - 🔗 `tests/services/chat-user-config.test.ts` → triggers.morning_greeting.enabled=false → 不触发
- [ ] **QA-S10.2** 设置 "静默时段" 为 22:00-08:00 → 22:30 不收到任何 AI 主动消息
  - 🔗 `tests/services/chat-user-config.test.ts` → quietHours 22:00-07:00 → 23:00 被静默
- [ ] **QA-S10.3** 切换默认模型为 GPT-4o → 发送消息 → AI 回复风格发生变化（观察 DB 中 LLMUsageLog.model 字段确认）
  - 🔗 `tests/services/chat-user-config.test.ts` → aiModelConfig chat:default=gpt-4o → resolveModelForChat 返回 gpt-4o

### S11. 高级能力（按需）

- [ ] **S11.1 Topic Mode 会话**: 手动创建跨天专题会话 + 切换列表
- [ ] **S11.2 对话搜索**: 全文搜索归档内容
- [ ] **S11.3 Attachment 引用**: 任务长按 → "问 AI" → 携带上下文
- [ ] **S11.4 Skill Registry**: Skill 接口 + 5 个核心 Skill + 意图 → Skill 路由
- [ ] **S11.5 外部 MCP Server 接入**: 日历 / Notion / GitHub 集成
- [ ] **S11.6 国产 LLM 验证**: Qwen / Kimi 端到端 Tool Use + 流式测试
- [ ] **S11.7 数据分析面板**: 管理后台 token 统计 + 上下文使用率分析

S11 各项的测试随实现同步规划。

---

## 推荐实施顺序

```
Foundation（基础能力，串行）
  F1 数据层 → F0 测试基础设施（依赖 F1 的 Schema）
  → F2 LLM 引擎 → F3 会话管理 → F4 Tool 框架
  → F5 传输层 → F6 上下文管理 → F7 可观测性
  F8 端侧框架（与 F1-F7 并行开发，在 F5 完成后集成联调）

  每个 F 模块完成时，对应测试必须通过 ✅

Foundation 验收: npm test + cd vibeflow-ios && npx jest 全绿 ✅

场景扩展（可并行，按价值排序）
  ┌─ S1 Tool 全量绑定（扩展工具数量，最直接的功能增量）
  ├─ S2 确认 UI（安全门槛，高风险操作必须有）
  ├─ S3 Web/Desktop Chat（覆盖第二个客户端）
  └─ S6 意图路由（提升响应质量和速度）

  ┌─ S4 主动触发框架（解锁 AI 主动能力）
  └─ S5 状态转换触发器（基于 S4，最核心的主动场景）

  ┌─ S7 长对话保障（随使用量增长必须解决）
  ├─ S8 会话归档（数据量增长后必须有）
  └─ S9 定时触发器（基于 S4，补充触发场景）

  ┌─ S10 用户配置（使用一段时间后按需求优先级做）
  └─ S11 高级能力（按需评估）

  每个 S 模块交付 = 功能代码 + 测试代码，npm test 全绿
```

---

## 统计

| 分类 | 功能任务 | 测试任务 | 合计 |
|------|---------|---------|------|
| **F0 测试基础设施** | — | 4 | 4 |
| **Foundation (F1-F8)** | 17 | 8 | 25 |
| S1 Tool 全量绑定 | 5 | 1 | 6 |
| S2 确认 UI | 2 | 1 | 3 |
| S3 Web/Desktop Chat | 3 | 1 | 4 |
| S4 主动触发框架 | 3 | 1 | 4 |
| S5 状态转换触发器 | 5 | 1 | 6 |
| S6 意图路由 | 4 | 1 | 5 |
| S7 长对话保障 | 4 | 1 | 5 |
| S8 会话归档 | 3 | 1 | 4 |
| S9 定时触发器 | 4 | 1 | 5 |
| S10 用户配置 | 2 | 1 | 3 |
| S11 高级能力 | 7 | — | 7 |
| **合计** | **59** | **22** | **81** |
