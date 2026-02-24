# AI Chat 端侧集成方案设计

> 在 iOS 和 Desktop 客户端集成 AI 对话能力，将 VibeFlow 从"工具型 App"转变为"对话驱动型 App"。

---

## 一、设计理念

### 1.1 核心原则：Conversation-First

传统 UI 作为数据展示层（只读为主），所有写操作鼓励通过对话完成：

| 操作类型 | 传统 UI | AI Chat |
|---------|---------|---------|
| 查看任务/状态 | **主要入口** — 列表、仪表盘 | 辅助 — "今天有什么任务？" |
| 创建/修改任务 | 保留但弱化 | **主要入口** — "帮我创建一个 P1 任务" |
| 优先级调整 | 保留但弱化 | **主要入口** — "把 API 重构调到 P1" |
| 开始番茄钟 | 保留快捷按钮 | **主要入口** — "开始专注" |
| 每日规划 | Airlock 流程 | **增强** — "帮我规划今天" |
| 数据分析 | Stats 页面 | **增强** — "这周效率怎么样？" |

### 1.2 Chat 不是附加功能，而是核心交互层

- Chat 面板在所有页面可见/可呼出
- App 的核心操作全部通过 MCP Tools 暴露给 Chatbot
- 对话历史即操作日志，可追溯
- AI 具有完整的 VibeFlow 上下文感知（当前状态、活跃任务、番茄钟等）

---

## 二、系统架构

### 2.1 整体架构

```
┌─────────────┐     ┌─────────────┐
│   iOS App   │     │  Desktop    │
│  (React     │     │  (Electron  │
│   Native)   │     │   WebView)  │
│             │     │             │
│ ┌─────────┐ │     │ ┌─────────┐ │
│ │Chat UI  │ │     │ │Chat UI  │ │
│ │Component│ │     │ │Component│ │
│ └────┬────┘ │     │ └────┬────┘ │
│      │      │     │      │      │
│ ┌────┴────┐ │     │      │      │
│ │Chat     │ │     │      │      │
│ │Service  │ │     │      │      │
│ └────┬────┘ │     │      │      │
└──────┼──────┘     └──────┼──────┘
       │ Socket.io         │ Socket.io
       │ (CHAT_*)          │ (CHAT_*)
       │                   │
┌──────┴───────────────────┴──────┐
│         Vibe Brain (Server)      │
│                                  │
│  ┌──────────────────────────┐   │
│  │   Chat Router (tRPC)     │   │
│  │   - sendMessage          │   │
│  │   - getHistory           │   │
│  │   - streamResponse       │   │
│  └────────┬─────────────────┘   │
│           │                      │
│  ┌────────┴─────────────────┐   │
│  │   Chat Service           │   │
│  │   - 会话管理              │   │
│  │   - 消息持久化            │   │
│  │   - LLM 调用编排          │   │
│  └────────┬─────────────────┘   │
│           │                      │
│  ┌────────┴─────────────────┐   │
│  │   LLM Adapter            │   │
│  │   - Claude API           │   │
│  │   - MCP Tool Binding     │   │
│  │   - System Prompt 构建    │   │
│  └────────┬─────────────────┘   │
│           │                      │
│  ┌────────┴─────────────────┐   │
│  │   Existing MCP Tools     │   │
│  │   (28 tools reused)      │   │
│  └──────────────────────────┘   │
└──────────────────────────────────┘
```

### 2.2 关键设计决策

**为什么 LLM 调用放在服务端？**

- API Key 安全：不在端侧暴露 Claude API Key
- 上下文统一：服务端可直接访问数据库构建丰富的 System Prompt
- 工具复用：直接调用已有的 50+ 个 Service，无需通过 MCP stdio 中转
- 流式输出：服务端通过 Socket.io 推流到客户端，延迟低于客户端直连 LLM
- 审计：所有 AI 操作记录在服务端，与现有 MCP Audit 体系一致

**为什么用 Socket.io 而不是新增 HTTP/SSE 端点？**

- iOS 和 Desktop 已有成熟的 Socket.io 连接（Octopus 协议）
- 流式响应天然适合 WebSocket
- 复用现有的认证、心跳、重连机制
- 无需为 chat 单独建连接

---

## 三、通信协议设计

在现有 Octopus 协议上扩展 Chat 相关的事件和命令类型。

### 3.1 新增 Event Types（客户端 → 服务端）

```typescript
// 追加到 EventType
type EventType = ... | 'CHAT_MESSAGE' | 'CHAT_ACTION';

// 用户发送消息
interface ChatMessagePayload {
  conversationId: string;    // 会话 ID（新会话时客户端生成）
  messageId: string;         // 消息 ID（客户端生成，用于去重）
  content: string;           // 用户输入的文本
  /** 附加的上下文引用，如某个 task ID */
  attachments?: ChatAttachment[];
}

interface ChatAttachment {
  type: 'task' | 'project' | 'goal' | 'pomodoro';
  id: string;
  title: string;
}

// 用户确认/取消 AI 提议的操作
interface ChatActionPayload {
  conversationId: string;
  /** 对应的 AI 消息中的 toolCallId */
  toolCallId: string;
  action: 'confirm' | 'cancel';
}
```

### 3.2 新增 Command Types（服务端 → 客户端）

```typescript
// 追加到 CommandType
type CommandType = ... | 'CHAT_RESPONSE' | 'CHAT_TOOL_CALL' | 'CHAT_TOOL_RESULT';

// AI 文本响应（流式）
interface ChatResponsePayload {
  conversationId: string;
  messageId: string;
  /** 'delta' 表示流式片段，'complete' 表示结束 */
  type: 'delta' | 'complete';
  content: string;
  /** 仅在 complete 时提供 */
  usage?: { inputTokens: number; outputTokens: number };
}

// AI 要执行工具调用（需要用户确认的场景）
interface ChatToolCallPayload {
  conversationId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  /** 人类可读的操作描述 */
  description: string;
  parameters: Record<string, unknown>;
  /** 是否需要用户确认 */
  requiresConfirmation: boolean;
}

// 工具执行结果
interface ChatToolResultPayload {
  conversationId: string;
  messageId: string;
  toolCallId: string;
  success: boolean;
  /** 人类可读的结果描述 */
  summary: string;
}
```

### 3.3 操作确认机制

对于写操作，分为两类：

| 类别 | 示例 | 行为 |
|------|------|------|
| **低风险** — 自动执行 | 创建任务、添加子任务、标记完成、开始番茄钟 | AI 直接执行，结果通知用户 |
| **高风险** — 需确认 | 删除任务/项目、批量修改优先级、修改设置 | AI 先展示操作预览，用户点击确认后执行 |

服务端通过 `ChatToolCallPayload.requiresConfirmation` 字段控制。

---

## 四、服务端实现

### 4.1 新增模块

```
src/services/
  chat.service.ts             # 会话管理、消息持久化
  llm-adapter.service.ts      # Claude API 调用封装

src/server/routers/
  chat.ts                     # tRPC router（用于 Web 端 HTTP 调用 + 历史查询）
```

### 4.2 Chat Service

```typescript
// src/services/chat.service.ts
export const chatService = {
  // 处理用户消息，编排 LLM 调用
  async handleMessage(
    userId: string,
    conversationId: string,
    content: string,
    attachments?: ChatAttachment[]
  ): Promise<void>,

  // 获取会话历史
  async getHistory(
    userId: string,
    conversationId: string,
    limit?: number
  ): Promise<ServiceResult<ChatMessage[]>>,

  // 获取用户的会话列表
  async listConversations(
    userId: string
  ): Promise<ServiceResult<Conversation[]>>,

  // 处理用户对工具调用的确认
  async handleToolConfirmation(
    userId: string,
    conversationId: string,
    toolCallId: string,
    action: 'confirm' | 'cancel'
  ): Promise<void>,
};
```

### 4.3 LLM Adapter

```typescript
// src/services/llm-adapter.service.ts
export const llmAdapterService = {
  // 构建 System Prompt（融入当前上下文）
  async buildSystemPrompt(userId: string): Promise<string>,

  // 将 MCP Tools 转换为 Claude Tool 定义格式
  getToolDefinitions(): ToolDefinition[],

  // 流式调用 Claude API
  async streamChat(
    messages: Message[],
    tools: ToolDefinition[],
    onDelta: (delta: string) => void,
    onToolCall: (toolCall: ToolCall) => void,
  ): Promise<ChatCompletion>,
};
```

### 4.4 System Prompt 设计

System Prompt 由静态模板 + 动态上下文拼接：

```markdown
# VibeFlow AI 助手

你是 VibeFlow 的 AI 助手，帮助用户管理任务、规划每日工作、控制番茄钟。

## 当前上下文
- 系统状态: {state} (LOCKED/PLANNING/FOCUS/REST)
- 活跃番茄钟: {pomodoro_info}
- 今日 Top 3: {top3_tasks}
- 今日完成: {completed_count}/{daily_cap}
- 当前时间: {now}

## 今日任务
{today_tasks_list}

## 活跃项目
{active_projects}

## 可用操作
你可以使用以下工具来帮助用户...
（由 getToolDefinitions() 自动生成）

## 行为准则
- 修改数据前用中文简洁描述你将要做什么
- 批量修改前列出变更清单
- 在 FOCUS 状态下，优先引导用户专注当前任务
- 在 PLANNING 状态下，主动帮助用户规划
```

动态上下文复用现有的 `contextProviderService.getCurrentContext(userId)`。

### 4.5 工具绑定

将现有的 MCP Tools 直接映射为 Claude API 的 Tool Use 格式：

```typescript
// 复用 src/mcp/tools.ts 中已有的 28 个工具定义
// 转换为 Claude API tool use schema
function mcpToolToClaudeTool(mcpTool: MCPToolDef): ClaudeTool {
  return {
    name: mcpTool.name,
    description: mcpTool.description,
    input_schema: mcpTool.inputSchema,
  };
}
```

工具执行直接调用 Service 层，不走 MCP stdio：

```typescript
// 工具名 → 服务方法的映射
const toolHandlers: Record<string, (userId: string, params: any) => Promise<any>> = {
  'flow_complete_task': (userId, p) => taskService.updateStatus(p.task_id, 'DONE', userId),
  'flow_add_subtask': (userId, p) => taskService.createSubtask(p.parent_id, userId, ...),
  'flow_start_pomodoro': (userId, p) => pomodoroService.start(userId, p.task_id, p.duration),
  'flow_create_task_from_nl': (userId, p) => nlParserService.parseAndCreate(userId, p.description),
  // ... 其余工具
};
```

### 4.6 数据模型

```prisma
model Conversation {
  id        String   @id @default(uuid())
  userId    String
  title     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id])
  messages  ChatMessage[]

  @@index([userId, updatedAt])
}

model ChatMessage {
  id             String   @id @default(uuid())
  conversationId String
  role           String   // 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content        String
  metadata       Json?    // toolCallId, toolName, parameters, etc.
  tokenCount     Int?
  createdAt      DateTime @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id])

  @@index([conversationId, createdAt])
}
```

---

## 五、iOS 端实现

### 5.1 UI 方案：浮动 Chat 按钮 + 底部弹出面板

在所有页面（StatusScreen、SettingsScreen）上层叠加一个浮动按钮，点击后从底部滑出 Chat 面板。

```
┌──────────────────────────┐
│     StatusScreen         │
│                          │
│  ┌────────────────────┐  │
│  │  PomodoroStatus    │  │
│  └────────────────────┘  │
│  ┌────────────────────┐  │
│  │  TaskList          │  │
│  └────────────────────┘  │
│                          │
│                    ┌───┐ │
│                    │ AI│ │  ← 浮动按钮（右下角）
│                    └───┘ │
│ ┌──────┐    ┌──────────┐ │
│ │状态  │    │  设置    │ │  ← 底部 Tab Bar
│ └──────┘    └──────────┘ │
└──────────────────────────┘

       点击 AI 按钮后 ↓

┌──────────────────────────┐
│   StatusScreen (暗化)     │
│                          │
├──────────────────────────┤  ← 可拖拽高度（半屏/全屏）
│  ┌────────────────────┐  │
│  │ AI 助手        ✕ ↕ │  │  ← Header（关闭 + 展开/收缩）
│  ├────────────────────┤  │
│  │                    │  │
│  │  消息列表           │  │  ← ScrollView / FlatList
│  │  (对话气泡)         │  │
│  │                    │  │
│  ├────────────────────┤  │
│  │ [  输入框...  ] [➤]│  │  ← TextInput + Send Button
│  └────────────────────┘  │
└──────────────────────────┘
```

**为什么不增加第三个 Tab？**

- Tab 适合独立的全屏页面，Chat 的核心诉求是"随时可用，不离开当前上下文"
- 浮动面板可以在查看任务列表的同时与 AI 对话
- 用户可以一边看 PomodoroStatus，一边让 AI 调整任务
- 半屏模式下可以同时看到底层页面内容

### 5.2 组件结构

```
vibeflow-ios/src/
├── components/
│   ├── chat/
│   │   ├── ChatFAB.tsx              # 浮动按钮（带未读指示）
│   │   ├── ChatPanel.tsx            # 底部弹出面板容器
│   │   ├── ChatMessageList.tsx      # 消息列表（FlatList）
│   │   ├── ChatBubble.tsx           # 单条消息气泡
│   │   ├── ChatInput.tsx            # 输入框 + 发送按钮
│   │   ├── ChatToolCallCard.tsx     # 工具调用确认卡片
│   │   └── ChatToolResultCard.tsx   # 工具执行结果卡片
│   └── ...
├── services/
│   └── chat.service.ts              # Chat WebSocket 事件处理
├── store/
│   └── chat.store.ts                # Zustand chat 状态
└── types/
    └── chat.ts                      # Chat 相关类型定义
```

### 5.3 Zustand Store

```typescript
// vibeflow-ios/src/store/chat.store.ts
interface ChatState {
  // UI
  isPanelOpen: boolean;
  panelHeight: 'half' | 'full';

  // 会话
  activeConversationId: string | null;
  conversations: Conversation[];

  // 消息
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;  // 流式接收中的部分内容

  // 待确认的工具调用
  pendingToolCalls: PendingToolCall[];

  // Actions
  openPanel: () => void;
  closePanel: () => void;
  togglePanelHeight: () => void;
  sendMessage: (content: string, attachments?: ChatAttachment[]) => void;
  confirmToolCall: (toolCallId: string) => void;
  cancelToolCall: (toolCallId: string) => void;
  appendStreamDelta: (delta: string) => void;
  finalizeStreamMessage: (messageId: string, content: string) => void;
  addToolCallMessage: (toolCall: PendingToolCall) => void;
  addToolResultMessage: (result: ToolResult) => void;
}
```

### 5.4 Chat Service

```typescript
// vibeflow-ios/src/services/chat.service.ts
class ChatService {
  initialize(syncService: SyncService) {
    // 监听服务端推送的 Chat 命令
    websocketService.onCommand('CHAT_RESPONSE', this.handleChatResponse);
    websocketService.onCommand('CHAT_TOOL_CALL', this.handleToolCall);
    websocketService.onCommand('CHAT_TOOL_RESULT', this.handleToolResult);
  }

  sendMessage(conversationId: string, content: string, attachments?: ChatAttachment[]) {
    websocketService.sendEvent({
      eventType: 'CHAT_MESSAGE',
      payload: { conversationId, messageId: uuid(), content, attachments },
    });
  }

  confirmToolCall(conversationId: string, toolCallId: string) {
    websocketService.sendEvent({
      eventType: 'CHAT_ACTION',
      payload: { conversationId, toolCallId, action: 'confirm' },
    });
  }

  private handleChatResponse = (payload: ChatResponsePayload) => {
    const store = useChatStore.getState();
    if (payload.type === 'delta') {
      store.appendStreamDelta(payload.content);
    } else {
      store.finalizeStreamMessage(payload.messageId, payload.content);
    }
  };

  private handleToolCall = (payload: ChatToolCallPayload) => {
    const store = useChatStore.getState();
    if (payload.requiresConfirmation) {
      store.addToolCallMessage(payload);
    }
    // 低风险操作会自动执行，等待 TOOL_RESULT
  };

  private handleToolResult = (payload: ChatToolResultPayload) => {
    const store = useChatStore.getState();
    store.addToolResultMessage(payload);
  };
}

export const chatService = new ChatService();
```

### 5.5 Chat 面板与 AppProvider 集成

```typescript
// vibeflow-ios/src/providers/AppProvider.tsx
// 在现有初始化流程中增加 chatService 初始化

useEffect(() => {
  // ... existing init
  chatService.initialize(syncService);
  return () => chatService.cleanup();
}, []);
```

```typescript
// vibeflow-ios/App.tsx — ChatFAB 放在 NavigationContainer 外层
<AppProvider>
  <NavigationContainer>
    <TabNavigator />
  </NavigationContainer>
  <ChatFAB />       {/* 浮动在所有页面之上 */}
  <ChatPanel />     {/* Modal/BottomSheet，根据 isPanelOpen 显示 */}
</AppProvider>
```

---

## 六、Desktop 端实现

### 6.1 方案：Web 端 Chat 组件 + Desktop 增强

Desktop 端通过 BrowserWindow 加载 Web 应用，因此 Chat 功能主要在 Web 端实现，Desktop 端提供增强能力。

#### Web 端（Next.js）

```
src/components/chat/
├── ChatFAB.tsx              # 浮动按钮
├── ChatPanel.tsx            # 侧边/底部弹出面板
├── ChatMessageList.tsx      # 消息列表
├── ChatBubble.tsx           # 消息气泡
├── ChatInput.tsx            # 输入框
├── ChatToolCallCard.tsx     # 工具确认卡片
├── ChatToolResultCard.tsx   # 工具结果卡片
└── ChatProvider.tsx         # Context Provider（管理 WebSocket 监听）
```

Web Chat 通过 tRPC + Socket.io 实现：
- 发送消息：tRPC mutation `chat.sendMessage`
- 流式接收：Socket.io `CHAT_RESPONSE` 事件
- 历史记录：tRPC query `chat.getHistory`

#### Desktop 增强

通过 `window.vibeflow` preload API 暴露额外能力：

```typescript
// electron/preload.ts — 新增 chat 命名空间
chat: {
  // 全局快捷键打开 Chat
  onToggleChat: (callback: () => void) => void,
  // 获取当前聚焦的窗口/App 信息作为上下文
  getActiveWindowContext: () => Promise<{ appName: string; windowTitle: string }>,
}
```

```typescript
// electron/main.ts — 注册全局快捷键
globalShortcut.register('CommandOrControl+Shift+Space', () => {
  mainWindow.webContents.send('toggle-chat');
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
});
```

### 6.2 Tray 集成

在 tray-manager 中增加 Chat 相关菜单项：

```typescript
// 在 tray 右键菜单中增加
{ label: 'AI 对话 (⌘⇧Space)', click: () => toggleChatPanel() }
```

---

## 七、使用场景

按用户一天的工作流程，以及不同系统状态下的典型交互，分场景说明。

### 7.1 晨间规划（LOCKED → PLANNING 阶段）

**场景：用户打开 App 开始一天的工作**

AI 在用户完成 Airlock 进入 PLANNING 状态后，主动推送规划建议。

```
[系统状态: LOCKED → 用户完成 Airlock → PLANNING]

AI (主动推送):
  "早上好。昨天你完成了 5 个番茄钟，专注 2 小时 5 分钟。
   「API 重构」项目还有 3 个未完成任务，其中 1 个逾期。

   今天有 8 个待处理任务，建议 Top 3：
   1. [P1] 完成支付接口联调 — 逾期 1 天，预估 2 个番茄钟
   2. [P1] 修复用户登录超时 Bug — 预估 1 个番茄钟
   3. [P2] 编写部署文档 — 预估 2 个番茄钟

   需要调整吗？"

用户: "把部署文档换成数据库迁移"

AI: "好的，调整为：
   1. [P1] 完成支付接口联调
   2. [P1] 修复用户登录超时 Bug
   3. [P2] 编写数据库迁移脚本

   确认设定？"

用户: "确认"

→ 调用 flow_set_top3
→ "Top 3 已设定。准备开始第一个番茄钟吗？"

用户: "开始"

→ 调用 flow_start_pomodoro（绑定 Top 3 第一个任务）
→ 系统进入 FOCUS 状态
→ "已开始专注「完成支付接口联调」，25 分钟后提醒你。"
```

**调用的 Tools**: `flow_generate_daily_summary` → `flow_get_overdue_tasks` → `flow_get_top3` → `flow_set_top3` → `flow_start_pomodoro`

**上下文依赖**: `vibe://analytics/productivity`, `vibe://tasks/today`, `vibe://history/pomodoros`, `vibe://state/current`

---

### 7.2 专注期间的快速操作（FOCUS 状态）

**场景：用户在番茄钟期间需要快速记录想法或调整**

FOCUS 状态下 AI 应该尽量简短，避免打断用户的心流。

```
[系统状态: FOCUS，当前番茄钟: 完成支付接口联调，剩余 12 分钟]

用户: "突然想到还要加个退款接口，记一下"

AI:
  → 调用 flow_add_subtask (parent: 当前任务)
  "已添加子任务「实现退款接口」到当前任务下。继续专注吧。"
```

```
用户: "这个任务搞不定，卡住了"

AI: "什么阻塞了？简单描述一下。"

用户: "第三方支付 SDK 文档缺失，不确定回调参数格式"

AI:
  → 调用 flow_report_blocker
  "已记录阻塞：「第三方支付 SDK 文档缺失」。
   要切换到下一个任务继续专注吗？"

用户: "切到登录 Bug"

AI:
  → 调用 flow_switch_task
  "已切换到「修复用户登录超时 Bug」，番茄钟继续计时。"
```

```
用户: "这个做完了"

AI:
  → 调用 flow_complete_task (当前番茄钟绑定的任务)
  "「修复用户登录超时 Bug」已完成。番茄钟还剩 8 分钟，
   要切换到其他任务还是继续当前番茄钟？"

用户: "切到数据库迁移"

AI:
  → 调用 flow_switch_task
  "已切换到「编写数据库迁移脚本」。"
```

**调用的 Tools**: `flow_add_subtask`, `flow_report_blocker`, `flow_switch_task`, `flow_complete_task`

**设计要点**: FOCUS 状态下 AI 回复简短，不主动展开话题，不提供分析——保护心流。

---

### 7.3 番茄钟结束 / 休息期间（FOCUS → REST）

**场景：一个番茄钟结束，AI 主动总结并引导下一步**

```
[番茄钟完成，系统进入 REST 状态]

AI (主动推送):
  "番茄钟完成！这轮你在「支付接口联调」上工作了 25 分钟。
   今天进度：2/8 番茄钟，专注 50 分钟。

   休息 5 分钟后，建议下一轮专注「编写数据库迁移脚本」(Top 3 #3)。"
```

```
[REST 状态中]

用户: "刚才那个联调任务差不多了，估计再一个番茄钟能搞定"

AI:
  → 调用 flow_update_task (estimated_minutes: 25)
  "已更新「完成支付接口联调」的预估时间为 1 个番茄钟。"
```

```
用户: "下一轮不做迁移了，先处理一下刚收到的线上 Bug"

AI: "好的。要创建一个新任务还是已有的？"

用户: "新的，线上用户头像上传失败，P1"

AI:
  → 调用 flow_create_task_from_nl
  → 调用 flow_set_plan_date (today)
  "已创建任务「修复线上用户头像上传失败」(P1, 今天)。
   休息结束后开始这个任务？"

用户: "对"

[休息结束]

AI:
  → 调用 flow_start_pomodoro (绑定新创建的任务)
  "已开始专注「修复线上用户头像上传失败」。"
```

**调用的 Tools**: `flow_update_task`, `flow_create_task_from_nl`, `flow_set_plan_date`, `flow_start_pomodoro`

---

### 7.4 任务管理（PLANNING 状态下的深度操作）

**场景 A：自然语言批量创建任务**

```
用户: "我要开始做用户中心改版项目，大概有这些事情：
       - 重新设计个人资料页
       - 实现头像裁剪上传
       - 添加修改密码功能
       - 接入第三方登录（微信、Apple）
       - 写集成测试"

AI:
  → 调用 flow_create_project (title: "用户中心改版")
  → 5 次调用 flow_create_task_from_nl
  "已创建项目「用户中心改版」，包含 5 个任务：

   📁 用户中心改版
   ├── [P2] 重新设计个人资料页
   ├── [P2] 实现头像裁剪上传
   ├── [P2] 添加修改密码功能
   ├── [P2] 接入第三方登录（微信、Apple）
   └── [P2] 编写集成测试

   需要调整优先级或添加子任务吗？"

用户: "第三方登录拆细一点"

AI:
  → 调用 flow_add_subtask × 3
  "已将「接入第三方登录」拆解为：
   ├── 微信 OAuth 接入
   ├── Apple Sign In 接入
   └── 统一登录状态管理"
```

**场景 B：跨项目任务整理**

```
用户: "帮我看看有哪些逾期任务"

AI:
  → 调用 flow_get_overdue_tasks
  "你有 4 个逾期任务：

   📁 API 重构项目
   ├── [P1] 完成支付接口联调 — 逾期 1 天
   └── [P2] 重构错误处理中间件 — 逾期 3 天

   📁 运维自动化
   ├── [P1] 配置 CI/CD Pipeline — 逾期 2 天
   └── [P3] 编写监控告警规则 — 逾期 5 天

   要怎么处理？"

用户: "P3 的推到下周，其他的安排到今明两天"

AI:
  → 发送 CHAT_TOOL_CALL (requiresConfirmation: true):
  "确认以下调整：
   - 完成支付接口联调 → 今天 (2/21)
   - 重构错误处理中间件 → 明天 (2/22)
   - 配置 CI/CD Pipeline → 今天 (2/21)
   - 编写监控告警规则 → 下周一 (2/24)
   [确认] [取消]"

用户点击 [确认]

→ 调用 flow_batch_update_tasks
→ "已更新 4 个任务的计划日期。今天需要处理 2 个逾期任务，要先把它们加到 Top 3 吗？"
```

**场景 C：优先级调整与推理**

```
用户: "感觉最近任务太多了，帮我整理一下优先级"

AI:
  → 读取 vibe://projects/active + vibe://tasks/today + vibe://analytics/productivity
  "当前有 3 个活跃项目，共 18 个待处理任务。按优先级分布：
   - P1: 5 个（其中 2 个逾期）
   - P2: 8 个
   - P3: 5 个

   建议调整：
   1. 「编写部署文档」P2 → P3：非阻塞性，可延后
   2. 「配置 CI/CD Pipeline」保持 P1：阻塞其他开发者
   3. 「重构错误处理中间件」P2 → P1：多个 Bug 与此相关

   要执行这些调整吗？"

用户: "前两个同意，第三个保持 P2"

AI:
  → 调用 flow_batch_update_tasks (2 个任务)
  "已调整：
   - 编写部署文档: P2 → P3
   - 配置 CI/CD Pipeline: 保持 P1
   - 重构错误处理中间件: 保持 P2（按你的判断）"
```

---

### 7.5 项目管理

**场景 A：项目进度分析**

```
用户: "API 重构项目进展怎么样？"

AI:
  → 调用 flow_get_project (include tasks)
  → 调用 flow_analyze_task_dependencies
  "📁 API 重构项目

   进度: 12/20 任务完成 (60%)
   剩余: 5 个 P1, 2 个 P2, 1 个 P3

   依赖关系分析：
   - 「支付接口联调」阻塞「上线发布」和「性能测试」
   - 「错误处理中间件重构」是独立任务，可并行

   按当前速度（每天 ~3 个番茄钟投入此项目），预计还需 4-5 个工作日。

   建议优先完成「支付接口联调」以解除阻塞。"
```

**场景 B：从模板创建项目**

```
用户: "我要开始做一个新的后端服务，用之前的微服务模板"

AI:
  → 读取可用模板列表
  "找到模板「微服务项目模板」，包含以下预设任务：
   - 初始化项目脚手架
   - 配置 CI/CD
   - 实现核心 API
   - 编写单元测试
   - 编写 API 文档
   - 部署到 Staging

   项目名称是什么？"

用户: "订单服务"

AI:
  → 调用 flow_create_project_from_template
  "已创建项目「订单服务」，包含 6 个任务。要关联到某个目标吗？"
```

---

### 7.6 数据回顾与分析

**场景 A：每日总结**

```
[接近下班时间，用户主动询问]

用户: "今天干了什么？"

AI:
  → 调用 flow_generate_daily_summary
  "📊 今日工作总结 (2/21)

   完成: 3 个任务
   ├── ✅ 修复用户登录超时 Bug (1 番茄钟)
   ├── ✅ 修复线上用户头像上传失败 (2 番茄钟)
   └── ✅ 编写数据库迁移脚本 (2 番茄钟)

   番茄钟: 6/8 (75%)
   专注时间: 2 小时 30 分钟

   未完成:
   ├── 🔶 完成支付接口联调 (进行中，还差退款接口)
   └── ⛔ 配置 CI/CD Pipeline (阻塞: 缺少服务器权限)

   与昨天比，多完成了 1 个番茄钟。这周累计 24 个番茄钟。"
```

**场景 B：周度效率分析**

```
用户: "这周效率怎么样？"

AI:
  → 读取 vibe://analytics/productivity
  → 读取 vibe://history/pomodoros
  "📈 本周效率分析 (2/17 - 2/21)

   番茄钟: 24 个 (日均 4.8)
   专注时间: 10 小时
   任务完成: 14 个

   趋势: 📈 上升 (比上周多 3 个番茄钟)
   高效时段: 上午 9-11 点
   低效时段: 下午 2-3 点（午后困倦期）

   项目进度:
   - API 重构: 60% → 75% (+15%)
   - 用户中心改版: 0% → 20% (本周新启动)

   建议: 下午 2 点安排低认知负荷的任务（文档、代码审查），
   把复杂开发放在上午。"
```

---

### 7.7 上下文感知的智能交互

**场景 A：AI 基于当前状态调整行为**

```
[FOCUS 状态，番茄钟进行中]

用户: "帮我整理一下这周的工作计划"

AI: "你当前在专注中（还剩 15 分钟）。
     番茄钟结束后我帮你整理？还是现在就需要？"

用户: "结束后吧"

AI: "好的，我会在这轮番茄钟结束后提醒你。"

[15 分钟后，番茄钟完成]

AI (主动推送):
  "番茄钟完成了。现在帮你整理本周工作计划？"
```

**场景 B：根据任务上下文的智能引用**

用户正在查看 TaskList 页面时，可以通过 attachment 引用当前看到的任务：

```
[用户在 StatusScreen 看到任务列表，长按某个任务 → "问 AI"]

用户: "这个任务应该怎么拆分？"
     [attachment: task_id="xxx", title="接入第三方登录"]

AI:
  → 调用 flow_get_task_context (task_id)
  "「接入第三方登录」建议拆分为 4 个子任务：

   1. 微信 OAuth 接入
      - 注册微信开放平台、配置回调、实现 code 换 token
   2. Apple Sign In 接入
      - 配置 Apple Developer、实现 ASAuthorizationController
   3. 统一登录状态管理
      - 抽象 AuthProvider、token 刷新逻辑
   4. 编写登录流程集成测试
      - 模拟三方回调、验证 token 存储

   要创建这些子任务吗？"

用户: "创建"

→ 调用 flow_add_subtask × 4
→ "已创建 4 个子任务。"
```

---

### 7.8 Desktop 特有场景

**场景 A：全局快捷键快速操作**

```
[用户在 VS Code 中编程，按 ⌘⇧Space 呼出 Chat]

用户: "刚发现一个内存泄漏的 Bug，记个任务"

AI:
  → 通过 window.vibeflow.chat.getActiveWindowContext()
     获取到当前窗口: VS Code, 文件: src/services/cache.service.ts
  → 调用 flow_create_task_from_nl
  "已创建任务「修复内存泄漏 Bug」(P1, 今天)，
   关联上下文: cache.service.ts。"
```

**场景 B：Focus 状态下的干预提示**

```
[FOCUS 状态，Desktop 检测到用户打开了 Twitter]

AI (主动推送, 配合桌面端 enforcement):
  "你正在专注中（还剩 18 分钟），Twitter 已被阻止。
   需要使用 Skip Token 临时解锁吗？(剩余 2 个)"
```

---

### 7.9 场景与 Tool 映射总览

| 场景类别 | 典型指令 | 调用的 Tools |
|---------|---------|-------------|
| **晨间规划** | "帮我规划今天" | `flow_generate_daily_summary`, `flow_get_overdue_tasks`, `flow_set_top3` |
| **开始工作** | "开始专注" | `flow_start_pomodoro` |
| **专注中记录** | "记一下要做 XX" | `flow_add_subtask`, `flow_create_task_from_nl` |
| **切换任务** | "切到另一个任务" | `flow_switch_task` |
| **报告阻塞** | "这个搞不定" | `flow_report_blocker` |
| **完成任务** | "搞定了" | `flow_complete_task`, `flow_complete_current_task` |
| **创建任务** | "创建一个 P1 任务..." | `flow_create_task_from_nl`, `flow_quick_create_inbox_task` |
| **批量创建** | "这个项目有这些事..." | `flow_create_project`, `flow_create_task_from_nl` × N |
| **任务拆分** | "帮我拆分这个任务" | `flow_get_task_context`, `flow_add_subtask` × N |
| **优先级调整** | "把 XX 调到 P1" | `flow_update_task`, `flow_batch_update_tasks` |
| **日期调整** | "逾期任务推到下周" | `flow_get_overdue_tasks`, `flow_batch_update_tasks` |
| **项目进度** | "XX 项目进展怎么样" | `flow_get_project`, `flow_analyze_task_dependencies` |
| **从模板建项目** | "用模板创建项目" | `flow_create_project_from_template` |
| **积压处理** | "看看 Backlog" | `flow_get_backlog_tasks` |
| **任务移动** | "把这个任务移到 XX 项目" | `flow_move_task` |
| **每日总结** | "今天干了什么" | `flow_generate_daily_summary` |
| **效率分析** | "这周效率怎么样" | 读取 `vibe://analytics/productivity` |
| **补录番茄钟** | "刚才忘开了，补一个" | `flow_record_pomodoro` |
| **无任务专注** | "不绑定任务，直接开始" | `flow_start_taskless_pomodoro` |

---

## 八、AI 主动触发系统

除了用户主动发起对话，AI 需要在关键时刻主动推送消息。这是一个通用的事件驱动框架，可灵活扩展触发条件。

### 8.1 架构设计

```
┌──────────────────────────────────────────────────┐
│                  触发源 (Trigger Sources)          │
│                                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ MCP Event│ │ 定时检查  │ │ 状态转换  │          │
│  │ 订阅     │ │ (Cron)   │ │ 钩子     │          │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘          │
│       └─────────────┼───────────┘                  │
│                     ▼                              │
│  ┌──────────────────────────────────────┐         │
│  │        Trigger Router                 │         │
│  │  - 评估触发条件 (shouldFire)          │         │
│  │  - 防抖 / 去重 / 静默期              │         │
│  │  - 用户偏好检查                       │         │
│  └────────────────┬─────────────────────┘         │
│                   ▼                                │
│  ┌──────────────────────────────────────┐         │
│  │        AI Message Generator           │         │
│  │  - 根据 triggerType 选择 prompt 模板  │         │
│  │  - 注入当前上下文                     │         │
│  │  - 调用 LLM 生成个性化消息            │         │
│  └────────────────┬─────────────────────┘         │
│                   ▼                                │
│  ┌──────────────────────────────────────┐         │
│  │        Delivery (Socket.io)           │         │
│  │  - CHAT_RESPONSE 命令推送到客户端      │         │
│  │  - 客户端展示为 Chat 气泡 / 通知      │         │
│  └──────────────────────────────────────┘         │
└──────────────────────────────────────────────────┘
```

### 8.2 触发器类型定义

```typescript
// src/services/ai-trigger.service.ts

interface TriggerDefinition {
  /** 触发器唯一标识 */
  id: string;
  /** 触发源类型 */
  sourceType: 'mcp_event' | 'cron' | 'state_transition' | 'threshold';
  /** 触发条件配置 */
  condition: TriggerCondition;
  /** LLM prompt 模板（用于生成主动消息） */
  promptTemplate: string;
  /** 是否需要调用 LLM，还是用静态模板 */
  useLLM: boolean;
  /** 防抖：同类触发的最小间隔（秒） */
  cooldownSeconds: number;
  /** 用户可配置开关 */
  userConfigurable: boolean;
  /** 默认启用 */
  defaultEnabled: boolean;
  /** 优先级：high 直接推送，low 在用户下次打开 Chat 时展示 */
  priority: 'high' | 'normal' | 'low';
}

type TriggerCondition =
  | { type: 'mcp_event'; eventType: string; filter?: Record<string, unknown> }
  | { type: 'cron'; schedule: string }  // cron 表达式
  | { type: 'state_transition'; from: string; to: string }
  | { type: 'threshold'; metric: string; operator: '>' | '<' | '>='; value: number };
```

### 8.3 内置触发器清单

#### 一、状态转换触发

| 触发器 ID | 触发时机 | AI 行为 | 优先级 | useLLM |
|-----------|---------|---------|--------|--------|
| `on_planning_enter` | LOCKED → PLANNING（完成 Airlock） | 生成每日规划建议，推荐 Top 3 | high | **是** |
| `on_focus_enter` | PLANNING → FOCUS（开始番茄钟） | 简短鼓励 + 任务摘要 | low | 否 |
| `on_rest_enter` | FOCUS → REST（番茄钟完成） | 总结本轮成果 + 推荐下一步 | high | **是** |
| `on_over_rest_enter` | REST → OVER_REST | 提醒回归工作，语气渐强 | high | 否 |
| `on_daily_reset` | 任意 → LOCKED（4AM 重置） | 无（用户通常在睡觉） | — | — |

**`on_planning_enter` 详细设计**：

```
触发: daily_state.changed 事件, newState='planning'

AI 构建上下文:
  - 昨日完成情况 (flow_generate_daily_summary)
  - 逾期任务 (flow_get_overdue_tasks)
  - 今日待处理任务 (vibe://tasks/today)
  - 用户历史效率 (vibe://analytics/productivity)

AI 生成 (LLM):
  "早上好。昨天你完成了 5 个番茄钟，比平均多 1 个。
   有 2 个逾期任务需要关注。

   建议今日 Top 3：
   1. [P1] 完成支付接口联调 — 逾期 1 天
   2. [P1] 修复用户登录超时 — 有 2 个关联 Bug
   3. [P2] 编写数据库迁移脚本

   要调整吗？还是直接确认？"

防抖: 每天只触发一次
```

**`on_rest_enter` 详细设计**：

```
触发: pomodoro.completed 事件

AI 构建上下文:
  - 刚完成的任务名称和用时
  - 今日累计进度 (已完成/总目标)
  - Top 3 任务完成情况
  - 下一个建议任务

AI 生成 (LLM):
  "这轮番茄钟搞定了「支付接口联调」的回调处理部分。
   今天进度 3/8，Top 3 还剩 1 个未完成。

   休息 5 分钟后，建议继续「编写数据库迁移脚本」。"

防抖: 每个番茄钟完成只触发一次
```

#### 二、定时触发

| 触发器 ID | 触发时机 | AI 行为 | 优先级 | useLLM |
|-----------|---------|---------|--------|--------|
| `morning_greeting` | 每天用户配置的工作开始时间（如 9:00） | 如果用户还在 LOCKED 状态，提醒开始工作 | normal | 否 |
| `midday_check` | 12:00-13:00（可配置） | 上午进度回顾 + 下午建议 | normal | **是** |
| `evening_summary` | 每天用户配置的下班时间（如 18:00） | 今日总结 + 明天预告 | normal | **是** |
| `progress_check` | 每 2 小时（可配置 30min-4h） | 如果进度落后目标，温和提醒 | low | 否 |

**`morning_greeting` 详细设计**：

```
触发: cron "0 9 * * 1-5"（工作日 9:00，时间从用户设置读取）
条件: 用户当前状态 == LOCKED（还没开始工作）

AI 生成 (静态模板):
  "新的一天开始了。你有 6 个任务计划在今天，其中 1 个逾期。
   准备好进入 Airlock 了吗？"

防抖: 每天只触发一次
静默: 如果用户已经在 PLANNING/FOCUS 状态，不触发
```

**`progress_check` 详细设计**：

```
触发: 每 2 小时
条件: earlyWarningService.checkProgress(userId).shouldWarn == true

AI 生成 (静态模板):
  "已经过了 {hours} 小时，完成了 {completed}/{target} 个番茄钟。
   比平时慢了一些，要不要调整一下今天的目标？"

防抖: 最少间隔 2 小时
静默: LOCKED 和 FOCUS 状态不打断
```

#### 三、阈值/条件触发

| 触发器 ID | 触发条件 | AI 行为 | 优先级 | useLLM |
|-----------|---------|---------|--------|--------|
| `over_rest_escalation` | 休息超时 > 配置的宽限期 | 第 1 次温和提醒，之后每 5 分钟升级语气 | high | 否 |
| `long_entertainment` | 娱乐模式持续 > 30min（可配置） | 提醒娱乐额度使用情况 | normal | 否 |
| `entertainment_quota_warning` | 娱乐额度消耗 > 80% | 警告快要用完 | normal | 否 |
| `idle_after_rest` | REST 状态超过 15 分钟无操作 | 温和询问是否继续工作 | normal | 否 |
| `daily_cap_approaching` | 已完成番茄钟 >= dailyCap - 1 | 提示即将达到每日上限 | normal | 否 |
| `blocker_stale` | 某个 blocker 超过 24h 未解决 | 提醒关注 stale blocker | low | **是** |
| `task_stuck` | 同一任务连续 3+ 个番茄钟 | 建议拆分任务或报告阻塞 | normal | **是** |

**`over_rest_escalation` 详细设计**：

```
触发: overRestService.checkOverRestStatus(userId).shouldTriggerActions == true
检查频率: 每 30 秒（复用现有的 over-rest 检查循环）

升级策略:
  0-5 min:  "休息结束了，准备回来专注？Top 3 还剩「编写数据库迁移脚本」。"
  5-10 min: "已经超时 {N} 分钟了。开始下一个番茄钟吧。"
  10+ min:  "休息时间已大幅超出。每多休息一分钟，今天的目标就更难达成。"

防抖: 每 5 分钟最多一条消息
配合: Desktop 端同时触发 enforcement（关闭娱乐 App、弹窗）
```

**`task_stuck` 详细设计**：

```
触发: pomodoro.completed 事件
条件: 统计该任务上连续完成的番茄钟数 >= 3

AI 生成 (LLM):
  "你已经在「实现支付回调」上花了 3 个番茄钟（75 分钟）。
   这个任务可能比预期复杂。建议：
   1. 拆分为更小的子任务
   2. 标记一个具体的阻塞点
   3. 先切到其他任务，换个思路

   需要我帮你拆分吗？"

防抖: 同一任务每天只提醒一次
```

### 8.4 服务端实现

```typescript
// src/services/ai-trigger.service.ts

export const aiTriggerService = {
  // 内置触发器注册表
  private triggers: Map<string, TriggerDefinition>,

  // 用户级别的触发器配置（开关、自定义参数）
  // 存储在 UserSettings.aiTriggerConfig (JSON)

  // 防抖状态：userId -> triggerId -> lastFiredAt
  private cooldowns: Map<string, Map<string, number>>,

  /**
   * 初始化：注册所有内置触发器，启动定时检查
   */
  start() {
    // 1. 订阅 MCP 事件
    mcpEventService.subscribe({
      agentId: 'ai-trigger-system',
      userId: '*',  // 所有用户（内部系统订阅）
      eventTypes: [
        'pomodoro.completed',
        'pomodoro.started',
        'daily_state.changed',
        'task.status_changed',
      ],
    });
    mcpEventService.onEvent(this.handleMCPEvent);

    // 2. 启动定时检查（复用现有 setInterval 模式）
    this.cronInterval = setInterval(() => this.runCronTriggers(), 60_000);

    // 3. 扩展现有的 over-rest 循环（每 30s）
    // 在 socket.ts 的 startPeriodicTasks 中增加 aiTriggerService.checkThresholds(userId)
  },

  /**
   * 处理 MCP 事件 → 匹配触发器
   */
  async handleMCPEvent(event: MCPEvent) {
    const userId = event.userId;
    const matchingTriggers = this.findMatchingTriggers('mcp_event', event);

    for (const trigger of matchingTriggers) {
      if (!this.shouldFire(userId, trigger)) continue;
      await this.fire(userId, trigger, { event });
    }
  },

  /**
   * 评估是否应该触发（防抖 + 用户偏好 + 静默条件）
   */
  shouldFire(userId: string, trigger: TriggerDefinition): boolean {
    // 1. 用户是否关闭了此触发器
    if (!this.isEnabledForUser(userId, trigger.id)) return false;

    // 2. 防抖检查
    const lastFired = this.cooldowns.get(userId)?.get(trigger.id);
    if (lastFired && Date.now() - lastFired < trigger.cooldownSeconds * 1000) return false;

    // 3. 静默条件（如 FOCUS 状态下不推送 low 优先级）
    const currentState = await dailyStateService.getCurrentState(userId);
    if (currentState === 'focus' && trigger.priority === 'low') return false;

    return true;
  },

  /**
   * 触发：生成消息 → 推送到客户端
   */
  async fire(userId: string, trigger: TriggerDefinition, context: Record<string, unknown>) {
    // 记录防抖
    this.updateCooldown(userId, trigger.id);

    let message: string;
    if (trigger.useLLM) {
      // 调用 LLM 生成个性化消息
      message = await chatService.generateProactiveMessage(userId, trigger, context);
    } else {
      // 使用静态模板 + 变量替换
      message = await this.renderTemplate(userId, trigger.promptTemplate, context);
    }

    // 推送到用户的 Chat 面板
    socketBroadcastService.broadcastOctopusCommand(userId, {
      commandType: 'CHAT_RESPONSE',
      payload: {
        conversationId: await this.getOrCreateProactiveConversation(userId),
        messageId: uuid(),
        type: 'complete',
        content: message,
        isProactive: true,   // 标记为主动推送，客户端可区分展示
        triggerId: trigger.id,
      },
    });

    // 审计日志
    await mcpAuditService.logToolCall(userId, {
      tool: `ai_trigger:${trigger.id}`,
      source: 'proactive',
      input: context,
      output: { message },
    });
  },
};
```

### 8.5 需要补充发布的 MCP 事件

现有系统有几个关键时刻没有发布 MCP 事件，需要补齐：

| 缺失事件 | 应在何处添加 | 触发器依赖 |
|----------|-------------|-----------|
| `daily_state.over_rest_entered` | `overRestService` 首次检测到 over-rest 时 | `over_rest_escalation` |
| `entertainment.started` / `entertainment.stopped` | `entertainmentService.start/stop()` | `long_entertainment`, `entertainment_quota_warning` |
| `daily_state.daily_reset` | `dailyResetSchedulerService` 4AM 重置时 | `morning_greeting`（可选） |
| `pomodoro.approaching_completion` | `pomodoroSchedulerService` 检测到剩余 < 5min 时 | 未来可扩展 |
| `early_warning.triggered` | `earlyWarningService.checkProgress()` 返回 shouldWarn 时 | `progress_check` |

### 8.6 用户配置

用户可以在设置页面控制每个触发器的开关和参数：

```typescript
// UserSettings.aiTriggerConfig (JSON field)
interface AITriggerConfig {
  /** 全局开关 */
  enabled: boolean;
  /** 静默时段（不推送任何主动消息） */
  quietHours?: { start: string; end: string };  // "22:00" - "08:00"
  /** 各触发器的独立配置 */
  triggers: {
    [triggerId: string]: {
      enabled: boolean;
      /** 覆盖默认参数 */
      params?: Record<string, unknown>;
    };
  };
}

// 默认配置
const DEFAULT_AI_TRIGGER_CONFIG: AITriggerConfig = {
  enabled: true,
  quietHours: { start: '22:00', end: '07:00' },
  triggers: {
    on_planning_enter: { enabled: true },
    on_rest_enter: { enabled: true },
    on_over_rest_enter: { enabled: true },
    morning_greeting: { enabled: true },
    midday_check: { enabled: false },        // 默认关闭，用户主动开启
    evening_summary: { enabled: true },
    progress_check: { enabled: false },       // 默认关闭
    over_rest_escalation: { enabled: true },
    long_entertainment: { enabled: true },
    idle_after_rest: { enabled: true },
    daily_cap_approaching: { enabled: true },
    task_stuck: { enabled: true },
    blocker_stale: { enabled: false },        // 默认关闭
  },
};
```

### 8.7 客户端展示

主动推送的消息在 Chat 面板中以视觉区分展示：

```
┌──────────────────────────────────┐
│  ┌─ 系统消息 ──────────────────┐ │
│  │ 🔔 AI 助手 · 番茄钟完成     │ │  ← isProactive: true
│  │                              │ │     带有触发原因标签
│  │ 这轮搞定了「支付接口联调」   │ │
│  │ 的回调处理。今天 3/8。       │ │
│  │                              │ │
│  │ 休息 5 分钟后继续             │ │
│  │ 「数据库迁移脚本」？         │ │
│  │                              │ │
│  │ [好的，到时开始] [先不了]     │ │  ← 快捷操作按钮
│  └──────────────────────────────┘ │
│                                    │
│  ┌─ 用户消息 ───────────┐        │
│  │ 到时候开始吧          │        │  ← 普通用户消息
│  └───────────────────────┘        │
└──────────────────────────────────┘
```

iOS 端：如果 Chat 面板未打开，主动消息作为系统通知展示，点击后打开 Chat 面板跳转到对应消息。

Desktop 端：如果窗口不在前台，通过 `tray-manager` 显示通知气泡，或 macOS 原生通知。

### 8.8 防抖与优先级策略

```
                      ┌─────────────────┐
                      │  触发条件满足    │
                      └────────┬────────┘
                               │
                      ┌────────▼────────┐
                      │ 全局开关 enabled?│─── No ──→ 丢弃
                      └────────┬────────┘
                               │ Yes
                      ┌────────▼────────┐
                      │ 静默时段内?      │─── Yes ─→ 丢弃（high 优先级除外）
                      └────────┬────────┘
                               │ No
                      ┌────────▼────────┐
                      │ 该触发器 enabled?│─── No ──→ 丢弃
                      └────────┬────────┘
                               │ Yes
                      ┌────────▼────────┐
                      │ 防抖期内?        │─── Yes ─→ 丢弃
                      └────────┬────────┘
                               │ No
                      ┌────────▼────────┐
                      │ 当前状态是 FOCUS │
                      │ 且优先级 = low?  │─── Yes ─→ 入队（FOCUS 结束后投递）
                      └────────┬────────┘
                               │ No
                      ┌────────▼────────┐
                      │ 用户有活跃连接?  │─── No ──→ 存入 CommandQueue（离线投递）
                      └────────┬────────┘
                               │ Yes
                      ┌────────▼────────┐
                      │    推送消息      │
                      └─────────────────┘
```

关键规则：
- **FOCUS 状态保护**：只有 `high` 优先级触发器可以在 FOCUS 状态下推送，`low` 和 `normal` 入队延迟到 REST/PLANNING
- **静默时段**：quiet hours 内只有 `high` 优先级（如 `over_rest_escalation`）可以推送
- **防抖**：同一触发器对同一用户在 `cooldownSeconds` 内不重复触发
- **离线队列**：用户不在线时，消息存入 `CommandQueue`，上线后补投

---

## 九、会话管理

### 9.1 核心原则

- **Invisible UX**：用户不应感知到 "Session" 的概念。打开 Chat 就是连续的"今日助手"，没有会话列表、没有切换操作。
- **Schema 一步到位，逻辑分阶段演进**：数据模型预留 `type` 和 `status` 枚举，支持未来多会话扩展，但 MVP 阶段只使用单一 `DEFAULT` 会话。
- **Security First**：所有 Chat Service 方法以 `userId` 为首参，Tool 执行的 `userId` 由服务端注入，绝不信任客户端或 AI 传入的 ID。

### 9.2 数据模型

Schema 一步到位，预留扩展字段，MVP 只使用 `DEFAULT` 类型：

```prisma
model Conversation {
  id        String   @id @default(uuid())
  userId    String   // 核心隔离字段

  // MVP 阶段只使用 DEFAULT
  // Phase 2 扩展: DAILY (按天归档)
  // Phase 3 扩展: TOPIC (专题讨论)
  type      ConversationType @default(DEFAULT)
  status    ConversationStatus @default(ACTIVE)

  title     String?  @default("VibeFlow Assistant")
  date      String?  // 预留给 DAILY 类型 (YYYY-MM-DD)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  ChatMessage[]

  @@index([userId, type, status])
  @@index([userId, updatedAt])
}

enum ConversationType {
  DEFAULT
  DAILY
  TOPIC
}

enum ConversationStatus {
  ACTIVE
  ARCHIVED
  DELETED
}

model ChatMessage {
  id             String   @id @default(uuid())
  conversationId String
  role           String   // 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content        String
  metadata       Json?    // toolCallId, toolName, parameters, isProactive, triggerId 等
  tokenCount     Int?
  createdAt      DateTime @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
}
```

### 9.3 会话生命周期：三阶段演进

#### Phase 1: MVP — 单一活跃会话 (Single Active Session)

```
用户体验：打开 Chat → 直接进入对话 → 没有"会话"概念

┌────────────────────────────────┐
│  VibeFlow AI 助手         [✕] │
│                                │
│  ┌──────── 2/21 ────────┐     │  ← 日期分割线（纯视觉）
│  │ AI: 早上好...         │     │
│  │ 用户: 帮我规划今天     │     │
│  │ AI: 建议 Top 3...     │     │
│  │ ...                   │     │
│  └───────────────────────┘     │
│  ┌──────── 2/22 ────────┐     │  ← 新的一天，同一个 Session
│  │ AI: 早上好...         │     │
│  │ ...                   │     │
│  └───────────────────────┘     │
│                                │
│ ┌────────────────────────────┐ │
│ │ 输入消息...          [➤]  │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

**后端逻辑**：

```typescript
// 每个用户永远只有一个 type=DEFAULT, status=ACTIVE 的 Conversation
async getOrCreateDefaultConversation(userId: string): Promise<Conversation> {
  const existing = await prisma.conversation.findFirst({
    where: { userId, type: 'DEFAULT', status: 'ACTIVE' },
  });
  if (existing) return existing;

  return prisma.conversation.create({
    data: { userId, type: 'DEFAULT', title: 'VibeFlow Assistant' },
  });
}
```

**日期分割**：每天 04:00 AM 重置时，在 Chat 消息流中插入一条日期标记消息（`role: 'system'`），UI 渲染为分割线。后端 Session 不变。

```typescript
// daily-reset-scheduler 中增加
async insertDayDivider(userId: string) {
  const conversation = await this.getOrCreateDefaultConversation(userId);
  await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'system',
      content: JSON.stringify({ type: 'day_divider', date: getTodayDateString() }),
    },
  });
}
```

**AI 主动触发的消息**：直接写入同一个 DEFAULT 会话，通过 `metadata.isProactive` 和 `metadata.triggerId` 标记来源。客户端可以视觉上区分展示。

**优势**：
- 零 UI 开发成本（无会话列表、无切换逻辑）
- 用户零认知负担
- AI 主动推送和用户对话在同一条时间线上，上下文连贯

#### Phase 2: Daily Archive — 按天归档

**触发条件**：当单个 DEFAULT Session 消息量过大（>200 条或 token 成本过高）时启动。

**逻辑**：
1. 每天 04:00 AM 定时任务：将当前 DEFAULT Session 改为 `type: DAILY, status: ARCHIVED, date: 昨天日期`
2. 新建一个空白 `type: DEFAULT` Session
3. UI 增加"历史记录"入口，查看归档的 DAILY Session

```typescript
// Phase 2 定时任务
async archiveAndRotate(userId: string) {
  const current = await this.getOrCreateDefaultConversation(userId);

  // 归档当前 Session
  await prisma.conversation.update({
    where: { id: current.id },
    data: { type: 'DAILY', status: 'ARCHIVED', date: getYesterdayDateString() },
  });

  // 创建新的 DEFAULT Session
  await prisma.conversation.create({
    data: { userId, type: 'DEFAULT', title: 'VibeFlow Assistant' },
  });
}
```

#### Phase 3: Topic Mode — 专题会话

**触发条件**：用户有跨天长任务规划的需求时启动。

**逻辑**：
1. 用户手动创建 `type: TOPIC` Session（如"用户中心改版规划"）
2. UI 增加会话切换列表
3. 同时保留一个 DEFAULT Session 用于日常对话

### 9.4 上下文窗口管理

#### Token 预算分配

```
单次 LLM 调用 Token 预算目标: ~20K tokens

  System Prompt（固定）                ~1,000 tokens
  Tool Definitions（固定/子集）        ~1,500-3,000 tokens
  Dynamic Context（按需加载）          ~500-1,500 tokens
  Conversation History（滑动窗口）     ~4,000-12,000 tokens
  预留给 LLM 输出                      ~4,000 tokens
```

#### 滑动窗口策略

数据库存储完整历史，但送入 LLM 时仅取最近 N 条：

```typescript
// MVP: N = 20，固定配置
const CONTEXT_WINDOW = {
  recentMessageCount: 20,       // 保留最近 20 条完整消息
  recentMessageMaxTokens: 8000, // token 硬上限
  summarizeThreshold: 40,       // 超过 40 条时对早期消息生成摘要
  summaryMaxTokens: 1000,
};
```

#### 消息构建流程

```typescript
async buildLLMMessages(userId: string, conversationId: string, newMessage: string): Promise<LLMMessage[]> {
  // 1. 从 DB 取最近 N 条消息
  const recentMessages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: CONTEXT_WINDOW.recentMessageCount,
  });
  recentMessages.reverse(); // 按时间正序

  // 2. 如果历史消息很多（Phase 2），获取早期摘要
  const totalCount = await prisma.chatMessage.count({ where: { conversationId } });
  let summaryBlock = '';
  if (totalCount > CONTEXT_WINDOW.summarizeThreshold) {
    summaryBlock = await this.getOrCreateSummary(conversationId, totalCount);
  }

  // 3. 组装消息列表
  const messages: LLMMessage[] = [];

  if (summaryBlock) {
    messages.push({ role: 'user', content: `[之前对话摘要]\n${summaryBlock}` });
    messages.push({ role: 'assistant', content: '好的，我了解之前的内容。' });
  }

  // 4. 加入最近消息（跳过 system 类型的日期分割线）
  for (const msg of recentMessages) {
    if (msg.role === 'system') continue; // 日期分割线不送入 LLM
    messages.push(this.toLLMMessage(msg));
  }

  // 5. 加入新消息
  messages.push({ role: 'user', content: newMessage });

  // 6. Token 裁剪：如果超出预算，从最早的 recent 消息开始移除
  return this.trimToTokenBudget(messages, CONTEXT_WINDOW.recentMessageMaxTokens);
}
```

#### Tool Result 压缩

Tool 返回的大量数据（如任务列表）在两层处理：

```typescript
// 存入 DB：保留完整 JSON（可审计、可回溯）
await prisma.chatMessage.create({
  data: {
    conversationId,
    role: 'tool_result',
    content: JSON.stringify(fullToolResult),      // 完整数据
    metadata: { toolCallId, toolName },
  },
});

// 构建 LLM Prompt 时：压缩为摘要
toLLMMessage(msg: ChatMessage): LLMMessage {
  if (msg.role === 'tool_result') {
    const result = JSON.parse(msg.content);
    // 如果 tool result 超过 500 tokens，截断或摘要
    const compressed = this.compressToolResult(result, 500);
    return { role: 'user', content: `[Tool Result: ${msg.metadata.toolName}]\n${compressed}` };
  }
  return { role: msg.role, content: msg.content };
}
```

#### 摘要生成（Phase 2 启用）

```typescript
async getOrCreateSummary(conversationId: string, messageCount: number): Promise<string> {
  // 用 Haiku 生成摘要（快速、便宜）
  const earlyMessages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: messageCount - CONTEXT_WINDOW.recentMessageCount,
  });

  return generateText({
    model: anthropic('claude-haiku-4-20250514'),
    system: '总结以下对话的关键信息：执行了哪些操作、做了哪些决定、未完成的事项。不超过 300 字。',
    messages: earlyMessages.map(m => ({ role: m.role, content: m.content })),
  }).then(r => r.text);
}
```

### 9.5 Dynamic Context 注入策略

不是每次都加载全部 14 个 Resource。按意图选择性加载：

```typescript
async buildDynamicContext(userId: string, userMessage: string) {
  // 1. 始终加载（~150 tokens）
  const baseContext = await contextProviderService.getFullContext(userId);

  // 2. 简单关键词意图预判（不需要 LLM）
  const intent = classifyIntent(userMessage);

  // 3. 按意图加载额外 Resource
  const extra: string[] = [];
  if (intent === 'planning')    extra.push(await load('vibe://tasks/today'), await load('vibe://analytics/productivity'));
  if (intent === 'review')      extra.push(await load('vibe://history/pomodoros'), await load('vibe://analytics/productivity'));
  if (intent === 'task_mgmt')   extra.push(await load('vibe://tasks/today'), await load('vibe://projects/active'));
  if (intent === 'project')     extra.push(await load('vibe://projects/all'));
  // quick_action: 不需要额外上下文

  return { baseContext, extra };
}
```

### 9.6 Tool 子集策略

根据系统状态只传入相关工具子集，节省 ~800-1,500 tokens：

| 状态 | 核心工具 (9 个，始终包含) | 额外工具 |
|------|------------------------|---------|
| FOCUS | `complete_task`, `create_task_from_nl`, `add_subtask`, `update_task`, `get_task`, `get_top3`, `set_top3`, `quick_create_inbox_task`, `start_pomodoro` | `switch_task`, `complete_current_task`, `report_blocker` |
| REST | 同上 | `start_pomodoro`, `record_pomodoro` |
| PLANNING | 同上 | `get_overdue_tasks`, `get_backlog_tasks`, `batch_update_tasks`, `set_plan_date`, `move_task` |
| 意图=project | 同上 | `create_project`, `update_project`, `get_project`, `create_project_from_template`, `analyze_task_dependencies` |
| 意图=review | 同上 | `generate_daily_summary` |

典型结果：12-18 个工具，~1,500-2,200 tokens。

### 9.7 并发与多端同步

#### 并发锁

对同一 `conversationId` 的 LLM 调用加互斥锁，防止并发消息导致上下文错乱：

```typescript
// 内存锁（单实例），生产环境可换 Redis
const conversationLocks = new Map<string, Promise<void>>();

async handleMessage(userId: string, content: string, ...) {
  const conversation = await this.getOrCreateDefaultConversation(userId);
  const lockKey = conversation.id;

  // 等待前一个请求完成
  while (conversationLocks.has(lockKey)) {
    await conversationLocks.get(lockKey);
  }

  // 占锁
  let releaseLock: () => void;
  conversationLocks.set(lockKey, new Promise(r => { releaseLock = r; }));

  try {
    await this.processMessage(userId, conversation, content, ...);
  } finally {
    conversationLocks.delete(lockKey);
    releaseLock!();
  }
}
```

#### 多端消息同步

用户在 iOS 发送的消息，Desktop 端应实时看到。Chat 事件通过 Socket.io 广播给该用户的所有在线设备：

```typescript
// socket.ts 中处理 CHAT_MESSAGE 后
// 1. 向发送者推送 CHAT_RESPONSE（流式）
// 2. 向同一用户的其他设备广播完整的用户消息 + AI 回复
this.broadcastToUserExcept(userId, senderSocketId, {
  commandType: 'CHAT_SYNC',
  payload: { conversationId, messages: [userMsg, assistantMsg] },
});
```

### 9.8 会话清理

```typescript
// 挂在 daily-reset-scheduler 上
async cleanupConversations() {
  // 超过 30 天的消息 → 删除（保留 Conversation 记录）
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.chatMessage.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
}

---

## 十、Socket.io 事件扩展

### 10.1 服务端 socket.ts 改动

在现有的 `processOctopusEvent` 中增加对 `CHAT_MESSAGE` 和 `CHAT_ACTION` 事件的处理：

```typescript
// src/server/socket.ts
case 'CHAT_MESSAGE':
  await chatService.handleMessage(
    userId,
    event.payload.conversationId,
    event.payload.content,
    event.payload.attachments,
    // 回调：通过 socket 推流到客户端
    (command) => this.sendOctopusCommand(userId, clientId, command)
  );
  break;

case 'CHAT_ACTION':
  await chatService.handleToolConfirmation(
    userId,
    event.payload.conversationId,
    event.payload.toolCallId,
    event.payload.action,
    (command) => this.sendOctopusCommand(userId, clientId, command)
  );
  break;
```

### 10.2 类型扩展

```typescript
// src/types/octopus.ts — 追加
type EventType = ... | 'CHAT_MESSAGE' | 'CHAT_ACTION';
type CommandType = ... | 'CHAT_RESPONSE' | 'CHAT_TOOL_CALL' | 'CHAT_TOOL_RESULT';
```

---

## 十一、LLM 模型配置与路由

LLM 需要支持多供应商、多模型配置，并在不同场景下自动选择合适的模型。

### 11.1 多 Provider 架构

利用 Vercel AI SDK 的 provider 抽象层，将模型供应商配置与业务逻辑解耦：

```typescript
// src/config/llm.config.ts

import { anthropic } from '@ai-sdk/anthropic';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

/**
 * 国产 LLM Provider（OpenAI-compatible API）
 * Qwen / Kimi 等国产模型均提供 OpenAI 兼容接口，
 * 通过 createOpenAI 指定 baseURL 即可接入，无需独立 SDK。
 */
const qwen = createOpenAI({
  baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.QWEN_API_KEY || '',
});

const kimi = createOpenAI({
  baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
  apiKey: process.env.KIMI_API_KEY || '',
});

/**
 * 模型注册表：统一管理所有可用模型
 * 新增供应商只需 npm install @ai-sdk/xxx + 在此注册
 * 国产 OpenAI-compatible 供应商用 createOpenAI({ baseURL }) 即可
 */
const MODEL_REGISTRY = {
  // Anthropic
  'claude-sonnet':   () => anthropic('claude-sonnet-4-20250514'),
  'claude-haiku':    () => anthropic('claude-haiku-4-20250514'),
  'claude-opus':     () => anthropic('claude-opus-4-20250514'),

  // OpenAI
  'gpt-4o':          () => openai('gpt-4o'),
  'gpt-4o-mini':     () => openai('gpt-4o-mini'),
  'o3-mini':         () => openai('o3-mini'),

  // Google
  'gemini-2-flash':  () => google('gemini-2.0-flash'),
  'gemini-2-pro':    () => google('gemini-2.0-pro'),

  // Qwen（通义千问 — 阿里云 DashScope）
  'qwen-max':        () => qwen('qwen-max'),
  'qwen-plus':       () => qwen('qwen-plus'),
  'qwen-turbo':      () => qwen('qwen-turbo'),

  // Kimi（Moonshot AI）
  'kimi-128k':       () => kimi('moonshot-v1-128k'),
  'kimi-32k':        () => kimi('moonshot-v1-32k'),
  'kimi-8k':         () => kimi('moonshot-v1-8k'),
} as const;

type ModelId = keyof typeof MODEL_REGISTRY;

function getModel(modelId: ModelId) {
  const factory = MODEL_REGISTRY[modelId];
  if (!factory) throw new Error(`Unknown model: ${modelId}`);
  return factory();
}
```

### 11.2 场景路由配置

不同场景使用不同模型，通过配置文件管理（非硬编码），运维/管理员可动态调整：

```typescript
// src/config/llm.config.ts

/**
 * 场景 → 模型的映射配置
 * 可通过环境变量或数据库 (SystemSettings) 覆盖
 */
interface SceneModelConfig {
  /** 模型 ID */
  model: ModelId;
  /** 最大输出 token */
  maxTokens: number;
  /** 温度（0-1） */
  temperature: number;
  /** 该场景是否启用 tool use */
  toolsEnabled: boolean;
}

const DEFAULT_SCENE_CONFIG: Record<string, SceneModelConfig> = {
  // ── 用户主动对话 ────────────────────────────────
  /** 默认对话：平衡速度与能力 */
  'chat:default': {
    model: 'claude-sonnet',
    maxTokens: 4096,
    temperature: 0.7,
    toolsEnabled: true,
  },

  /** 快速操作："搞定了"、"开始番茄钟"、"切换任务" */
  'chat:quick_action': {
    model: 'claude-haiku',
    maxTokens: 1024,
    temperature: 0.3,
    toolsEnabled: true,
  },

  /** 复杂规划：每日规划、优先级分析、项目分析 */
  'chat:planning': {
    model: 'claude-sonnet',
    maxTokens: 4096,
    temperature: 0.7,
    toolsEnabled: true,
  },

  /** 数据分析/回顾：效率分析、周报 */
  'chat:review': {
    model: 'claude-sonnet',
    maxTokens: 4096,
    temperature: 0.5,
    toolsEnabled: true,
  },

  // ── AI 主动触发 ────────────────────────────────
  /** 番茄钟完成后的建议 */
  'trigger:on_rest_enter': {
    model: 'claude-haiku',
    maxTokens: 1024,
    temperature: 0.5,
    toolsEnabled: false,   // 主动推送通常只生成文本
  },

  /** 晨间规划建议 */
  'trigger:on_planning_enter': {
    model: 'claude-sonnet',
    maxTokens: 2048,
    temperature: 0.7,
    toolsEnabled: false,
  },

  /** 超时休息提醒（无需 LLM，模板渲染） */
  'trigger:over_rest_escalation': {
    model: 'claude-haiku',
    maxTokens: 256,
    temperature: 0.3,
    toolsEnabled: false,
  },

  /** 任务卡住建议 */
  'trigger:task_stuck': {
    model: 'claude-sonnet',
    maxTokens: 2048,
    temperature: 0.7,
    toolsEnabled: true,   // 可能需要调用拆分工具
  },

  // ── 内部辅助 ────────────────────────────────────
  /** 对话摘要生成 */
  'internal:summarize': {
    model: 'claude-haiku',
    maxTokens: 512,
    temperature: 0.3,
    toolsEnabled: false,
  },

  /** 意图分类（如果从关键词升级到 LLM） */
  'internal:classify_intent': {
    model: 'claude-haiku',
    maxTokens: 64,
    temperature: 0,
    toolsEnabled: false,
  },
};
```

### 11.3 意图 → 场景路由

用户发送消息时，先通过轻量级意图分类确定场景，再查配置获取模型：

```typescript
// src/services/llm-adapter.service.ts

async resolveModelForChat(userId: string, userMessage: string): Promise<{
  model: LanguageModel;
  config: SceneModelConfig;
  scene: string;
}> {
  // 1. 意图分类（关键词匹配，零成本）
  const intent = classifyIntent(userMessage);

  // 2. 意图 → 场景映射
  const sceneMap: Record<string, string> = {
    quick_action: 'chat:quick_action',
    planning:     'chat:planning',
    review:       'chat:review',
    task_mgmt:    'chat:default',
    project:      'chat:default',
  };
  const scene = sceneMap[intent] || 'chat:default';

  // 3. 查配置（支持用户级别覆盖）
  const config = await this.getSceneConfig(userId, scene);

  // 4. 实例化模型
  const model = getModel(config.model);

  return { model, config, scene };
}

/**
 * 配置优先级：用户设置 > 系统设置 > 默认配置
 */
async getSceneConfig(userId: string, scene: string): Promise<SceneModelConfig> {
  // 1. 用户级别覆盖（UserSettings.aiModelConfig JSON 字段）
  const userSettings = await prisma.userSettings.findUnique({ where: { userId } });
  const userOverride = userSettings?.aiModelConfig?.[scene];
  if (userOverride) return { ...DEFAULT_SCENE_CONFIG[scene], ...userOverride };

  // 2. 系统级别设置（环境变量或 SystemSettings 表）
  const envOverride = process.env[`LLM_MODEL_${scene.toUpperCase().replace(/[:.]/g, '_')}`];
  if (envOverride && envOverride in MODEL_REGISTRY) {
    return { ...DEFAULT_SCENE_CONFIG[scene], model: envOverride as ModelId };
  }

  // 3. 默认配置
  return DEFAULT_SCENE_CONFIG[scene];
}
```

### 11.4 在 Chat Service 中的使用

```typescript
// src/services/chat.service.ts

async handleMessage(userId: string, content: string, onDelta: (cmd: OctopusCommand) => void) {
  const conversation = await this.getOrCreateDefaultConversation(userId);

  // 1. 路由模型
  const { model, config, scene } = await llmAdapterService.resolveModelForChat(userId, content);

  // 2. 构建消息和工具
  const messages = await this.buildLLMMessages(userId, conversation.id, content);
  const tools = config.toolsEnabled
    ? this.getToolSubset(await this.getSystemState(userId), scene)
    : undefined;

  // 3. 流式调用（Vercel AI SDK 统一接口，不管底层是 Anthropic/OpenAI/Google）
  const result = streamText({
    model,                          // ← 由路由决定
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    system: await this.buildSystemPrompt(userId),
    messages,
    tools,
    maxSteps: 5,
    onChunk: ({ chunk }) => { /* 推流 */ },
    onFinish: async ({ text, usage }) => {
      // 持久化消息
      const msg = await this.persistMessage(conversation.id, 'assistant', text);

      // 记录 token 使用 & 上下文可观测性
      await llmAdapterService.trackUsage(
        userId, conversation.id, msg.id, scene, config.model, messages, usage
      );
    },
  });
}
```

### 11.5 配置管理方式

三个层级，从低到高优先级递增：

```
代码默认值 (DEFAULT_SCENE_CONFIG)
    ↓ 可被覆盖
环境变量 (LLM_MODEL_CHAT_DEFAULT=gpt-4o)
    ↓ 可被覆盖
用户设置 (UserSettings.aiModelConfig JSON)
```

#### 环境变量示例

```bash
# .env — 全局默认供应商切换
LLM_MODEL_CHAT_DEFAULT=gpt-4o           # 默认对话用 GPT-4o
LLM_MODEL_CHAT_QUICK_ACTION=gpt-4o-mini # 快速操作用 GPT-4o mini
LLM_MODEL_CHAT_PLANNING=claude-sonnet   # 规划仍用 Claude
LLM_MODEL_INTERNAL_SUMMARIZE=gpt-4o-mini # 摘要用 GPT-4o mini

# API Keys（各供应商）
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
GOOGLE_GENERATIVE_AI_API_KEY=xxx
QWEN_API_KEY=sk-xxx                          # 阿里云 DashScope
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
KIMI_API_KEY=sk-xxx                           # Moonshot AI
KIMI_BASE_URL=https://api.moonshot.cn/v1
```

#### 用户级别配置

```typescript
// UserSettings.aiModelConfig (JSON 字段)
// 用户可以在设置页面选择偏好模型
{
  "chat:default": { "model": "gpt-4o" },        // 该用户偏好 GPT-4o
  "chat:planning": { "model": "claude-opus" }    // 规划用 Opus
}
```

#### 管理后台 / 设置页面 UI

```
┌─────────────────────────────────────┐
│ AI 模型设置                         │
│                                     │
│ 默认对话模型:                       │
│ ┌─────────────────────────────┐    │
│ │ Claude Sonnet (推荐)     ▾  │    │
│ └─────────────────────────────┘    │
│                                     │
│ 快速操作模型:                       │
│ ┌─────────────────────────────┐    │
│ │ Claude Haiku             ▾  │    │
│ └─────────────────────────────┘    │
│                                     │
│ 高级设置 ▸                          │
│                                     │
│  ┌─ 展开 ─────────────────────┐   │
│  │ 规划: Claude Sonnet      ▾ │   │
│  │ 分析: Claude Sonnet      ▾ │   │
│  │ 摘要: Claude Haiku       ▾ │   │
│  └────────────────────────────┘   │
└─────────────────────────────────────┘
```

### 11.6 新增供应商的扩展方式

#### 方式一：有官方 Provider Package 的供应商

```bash
# 1. 安装 provider package
npm install @ai-sdk/mistral

# 2. 在 MODEL_REGISTRY 注册
# src/config/llm.config.ts
import { mistral } from '@ai-sdk/mistral';
const MODEL_REGISTRY = {
  ...existing,
  'mistral-large': () => mistral('mistral-large-latest'),
};

# 3. 配置 API Key
# .env
MISTRAL_API_KEY=xxx
```

#### 方式二：OpenAI-compatible API 的供应商（国产模型通用模式）

大部分国产 LLM（Qwen、Kimi、DeepSeek、百川、智谱等）都提供 OpenAI 兼容接口，无需独立 SDK：

```typescript
// src/config/llm.config.ts
import { createOpenAI } from '@ai-sdk/openai';

// 只需指定 baseURL 和 apiKey
const deepseek = createOpenAI({
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
});

const MODEL_REGISTRY = {
  ...existing,
  'deepseek-chat': () => deepseek('deepseek-chat'),
  'deepseek-coder': () => deepseek('deepseek-coder'),
};
```

无需修改 `chatService`、`llmAdapterService`、Socket.io 层或任何客户端代码。Vercel AI SDK 的 provider 抽象保证了 `streamText()` / `generateText()` 的调用方式完全一致。

### 11.7 模型能力差异处理

不同供应商的 Tool Use 支持程度不同，需要做兼容处理：

| 能力 | Anthropic | OpenAI | Google | Qwen | Kimi |
|------|-----------|--------|--------|------|------|
| Tool Use | 原生支持 | 原生支持 (function calling) | 原生支持 | 原生支持 (OpenAI 兼容) | 原生支持 (OpenAI 兼容) |
| 流式 Tool Use | 支持 | 支持 | 支持 | 支持 | 支持 |
| 并行 Tool 调用 | 支持 | 支持 | 支持 | 支持 | 部分支持 |
| System Prompt | 独立 `system` 字段 | `system` role message | `system` 字段 | `system` role (OpenAI 兼容) | `system` role (OpenAI 兼容) |
| 最大上下文 | 200K | 128K | 2M | 128K (max) | 128K |

Vercel AI SDK 在 provider 层屏蔽了这些差异（Tool 定义用 Zod → 自动转换为各供应商格式）。Qwen 和 Kimi 通过 OpenAI-compatible API 接入，Vercel AI SDK 的 `createOpenAI` 可以无缝对接。但需要注意：

```typescript
// 某些模型不支持 tool use 时的 fallback
async callLLM(model: LanguageModel, config: SceneModelConfig, ...) {
  try {
    return await streamText({ model, tools: config.toolsEnabled ? tools : undefined, ... });
  } catch (error) {
    if (isToolUseNotSupportedError(error)) {
      // Fallback: 不传 tools，让 AI 以文本形式描述要执行的操作
      // 然后由服务端解析文本意图 → 执行工具
      return await streamText({ model, tools: undefined, ... });
    }
    throw error;
  }
}
```

### 11.8 上下文长度感知与可观测性

前期不限制对话轮次和使用频率，但需要全链路记录 token 使用情况，为后续精细化管理提供数据基础。

#### Token 使用记录

```typescript
// 每次 LLM 调用后记录（Prisma model）
model LLMUsageLog {
  id              String   @id @default(uuid())
  userId          String
  conversationId  String
  messageId       String?
  scene           String                // 'chat:default', 'trigger:xxx', etc.
  model           String                // MODEL_REGISTRY key
  inputTokens     Int
  outputTokens    Int
  totalTokens     Int                   // inputTokens + outputTokens
  contextLength   Int                   // 本次调用实际使用的上下文长度（所有 messages token 之和）
  maxContextLimit Int                   // 该模型的上下文窗口上限
  contextUsagePercent Float             // contextLength / maxContextLimit * 100
  createdAt       DateTime @default(now())

  user          User         @relation(fields: [userId], references: [id])
  conversation  Conversation @relation(fields: [conversationId], references: [id])

  @@index([userId, createdAt])
  @@index([conversationId])
}
```

#### 模型上下文窗口注册

```typescript
// 各模型的上下文窗口大小和能力元数据
const MODEL_META: Record<ModelId, {
  contextWindow: number;       // 最大上下文 token 数
  maxOutputTokens: number;     // 最大输出 token 数
  provider: string;            // 供应商标识
  displayName: string;         // UI 展示名称
}> = {
  'claude-sonnet':   { contextWindow: 200_000, maxOutputTokens: 8192,  provider: 'anthropic',  displayName: 'Claude Sonnet' },
  'claude-haiku':    { contextWindow: 200_000, maxOutputTokens: 8192,  provider: 'anthropic',  displayName: 'Claude Haiku' },
  'claude-opus':     { contextWindow: 200_000, maxOutputTokens: 8192,  provider: 'anthropic',  displayName: 'Claude Opus' },
  'gpt-4o':          { contextWindow: 128_000, maxOutputTokens: 16384, provider: 'openai',     displayName: 'GPT-4o' },
  'gpt-4o-mini':     { contextWindow: 128_000, maxOutputTokens: 16384, provider: 'openai',     displayName: 'GPT-4o Mini' },
  'o3-mini':         { contextWindow: 128_000, maxOutputTokens: 65536, provider: 'openai',     displayName: 'o3-mini' },
  'gemini-2-flash':  { contextWindow: 1_000_000, maxOutputTokens: 8192, provider: 'google',   displayName: 'Gemini 2 Flash' },
  'gemini-2-pro':    { contextWindow: 2_000_000, maxOutputTokens: 8192, provider: 'google',   displayName: 'Gemini 2 Pro' },
  'qwen-max':        { contextWindow: 128_000, maxOutputTokens: 8192,  provider: 'qwen',      displayName: 'Qwen Max' },
  'qwen-plus':       { contextWindow: 128_000, maxOutputTokens: 8192,  provider: 'qwen',      displayName: 'Qwen Plus' },
  'qwen-turbo':      { contextWindow: 128_000, maxOutputTokens: 8192,  provider: 'qwen',      displayName: 'Qwen Turbo' },
  'kimi-128k':       { contextWindow: 128_000, maxOutputTokens: 8192,  provider: 'kimi',      displayName: 'Kimi 128K' },
  'kimi-32k':        { contextWindow: 32_000,  maxOutputTokens: 8192,  provider: 'kimi',      displayName: 'Kimi 32K' },
  'kimi-8k':         { contextWindow: 8_000,   maxOutputTokens: 4096,  provider: 'kimi',      displayName: 'Kimi 8K' },
};
```

#### 上下文使用率计算与记录

```typescript
// src/services/llm-adapter.service.ts

async trackUsage(
  userId: string,
  conversationId: string,
  messageId: string,
  scene: string,
  modelId: ModelId,
  messages: CoreMessage[],
  usage: { promptTokens: number; completionTokens: number },
) {
  const meta = MODEL_META[modelId];
  const contextLength = usage.promptTokens;  // 实际输入 token 即上下文长度
  const contextUsagePercent = (contextLength / meta.contextWindow) * 100;

  await prisma.lLMUsageLog.create({
    data: {
      userId,
      conversationId,
      messageId,
      scene,
      model: modelId,
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      totalTokens: usage.promptTokens + usage.completionTokens,
      contextLength,
      maxContextLimit: meta.contextWindow,
      contextUsagePercent,
    },
  });

  // 上下文使用率预警（>80% 时触发摘要压缩）
  if (contextUsagePercent > 80) {
    await this.triggerContextCompression(userId, conversationId, contextUsagePercent);
  }
}
```

#### 会话级 Token 统计聚合

```typescript
// 提供给前端和 MCP 的统计接口
interface ConversationTokenStats {
  conversationId: string;
  /** 本会话累计输入 token */
  totalInputTokens: number;
  /** 本会话累计输出 token */
  totalOutputTokens: number;
  /** 本会话累计总 token */
  totalTokens: number;
  /** 最近一次调用的上下文使用率 */
  latestContextUsagePercent: number;
  /** 本会话消息轮次数 */
  messageCount: number;
  /** 当前使用的模型及其上下文窗口 */
  currentModel: { id: ModelId; contextWindow: number; displayName: string };
}

async getConversationStats(userId: string, conversationId: string): Promise<ConversationTokenStats> {
  const [aggregate, latestLog, messageCount] = await Promise.all([
    prisma.lLMUsageLog.aggregate({
      where: { conversationId, userId },
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
    }),
    prisma.lLMUsageLog.findFirst({
      where: { conversationId, userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.chatMessage.count({
      where: { conversationId, conversation: { userId } },
    }),
  ]);

  return {
    conversationId,
    totalInputTokens: aggregate._sum.inputTokens ?? 0,
    totalOutputTokens: aggregate._sum.outputTokens ?? 0,
    totalTokens: aggregate._sum.totalTokens ?? 0,
    latestContextUsagePercent: latestLog?.contextUsagePercent ?? 0,
    messageCount,
    currentModel: {
      id: latestLog?.model as ModelId ?? 'claude-sonnet',
      contextWindow: MODEL_META[latestLog?.model as ModelId ?? 'claude-sonnet'].contextWindow,
      displayName: MODEL_META[latestLog?.model as ModelId ?? 'claude-sonnet'].displayName,
    },
  };
}
```

#### 上下文使用率 UI 指示器

在 Chat 面板底部展示上下文使用率条，让用户感知当前对话的 "容量"：

```
┌──────────────────────────────────────┐
│ (...对话内容...)                      │
│                                      │
├──────────────────────────────────────┤
│ 📊 上下文: ████████░░ 78%  (156K/200K tokens)  │
│ 💬 轮次: 42  ·  模型: Claude Sonnet              │
├──────────────────────────────────────┤
│ [输入框...]                    [发送] │
└──────────────────────────────────────┘
```

当使用率超过阈值时自动提示：

| 使用率 | 行为 |
|--------|------|
| < 70% | 正常，绿色指示 |
| 70-80% | 黄色警告，提示 "对话较长，建议归档后开启新话题" |
| 80-90% | 橙色，自动触发历史消息摘要压缩 |
| > 90% | 红色，强制压缩 + 建议开启新会话 |

> **设计理念**：前期不设任何硬性限制（无每日额度、无对话轮次上限），对话可以无限长。但通过 token 使用可观测性为后续精细化管理（如分级额度、成本预算）预埋数据基础。

---

## 十二、分阶段实施计划

### Phase 1: MVP — 单一会话 + 基础对话

会话模型：Single Active Session，用户无感知。

- 服务端：`chatService` + `llmAdapterService`（Vercel AI SDK）
- Prisma schema：`Conversation`（含 enum 预留）、`ChatMessage`
- Socket.io：`CHAT_MESSAGE` / `CHAT_RESPONSE` / `CHAT_TOOL_CALL` / `CHAT_TOOL_RESULT` 事件
- 会话管理：每用户一个 `type: DEFAULT` Session，并发锁，滑动窗口 N=20
- iOS Chat UI：FAB + Panel + 消息列表 + 输入框
- 基础 Tool 绑定（9 个核心工具）
- 多端消息同步：`CHAT_SYNC` 广播

验收标准：
- [ ] 用户打开 Chat 直接进入对话（无会话列表）
- [ ] 可通过对话创建任务、标记完成、开始番茄钟
- [ ] 流式输出正常工作
- [ ] 消息持久化到 DB，重新打开 Chat 可看到历史
- [ ] iOS 和 Desktop 消息实时同步
- [ ] 并发消息不会导致上下文错乱

### Phase 2: 完整工具 + 确认机制 + 主动触发

- 绑定全部 28 个 MCP Tools + Tool 子集策略
- 高风险操作确认流程（`ChatToolCallCard`）
- Web 端 Chat 组件（Desktop 自动获得）+ 全局快捷键 ⌘⇧Space
- Dynamic Context 按意图加载
- `aiTriggerService` 框架：状态转换触发（`on_planning_enter`、`on_rest_enter`）+ 阈值触发（`over_rest_escalation`、`task_stuck`）
- 补充缺失的 MCP 事件
- 用户触发器配置 UI（设置页面）

验收标准：
- [ ] 所有 MCP Tool 可通过对话调用
- [ ] 高风险操作展示确认卡片
- [ ] Desktop ⌘⇧Space 打开 Chat
- [ ] 完成 Airlock 后 AI 主动推送规划建议
- [ ] 番茄钟完成后 AI 主动总结 + 推荐下一步
- [ ] FOCUS 状态下 low 优先级触发器不打断

### Phase 3: Daily Archive + 智能增强

会话模型升级：引入 `type: DAILY` 按天归档。

- 每天 04:00 AM 自动归档当前 Session，创建新 Session
- UI 增加"历史记录"入口
- 意图预分类 + 模型路由（Haiku/Sonnet）
- 早期消息摘要生成（Haiku）
- 定时触发器：`morning_greeting`、`evening_summary`、`progress_check`
- 每日额度控制
- Tool Result 压缩

验收标准：
- [ ] 每日自动归档，新一天看到空白对话 + 历史入口
- [ ] Haiku 处理简单操作，Sonnet 处理复杂规划
- [ ] 长对话（>40 条）不超出 token 限制
- [ ] 定时触发器按配置工作
- [ ] 额度耗尽时提示

### Phase 4: Topic Mode（按需）

会话模型升级：引入 `type: TOPIC` 专题会话。

- 用户可手动创建 Topic Session（跨天长任务规划）
- UI 增加会话切换列表
- Topic Session 独立上下文窗口（recentMessageCount=30）
- 对话历史搜索

---

## 十三、与现有 MCP 集成的关系

```
                   ┌─────────────────────┐
                   │    Claude Code /     │
                   │    Cursor (IDE)      │
                   │                      │
                   │  通过 MCP stdio      │
                   │  直接调用 MCP Server  │
                   └──────────┬──────────┘
                              │ stdio
                   ┌──────────┴──────────┐
                   │   MCP Server         │
                   │   (src/mcp/)         │
                   │   28 Tools           │
                   │   13 Resources       │
                   └──────────┬──────────┘
                              │ 直接调用 Service 层
                              │
┌─────────────┐    ┌──────────┴──────────┐    ┌─────────────┐
│ iOS Chat    │    │   Service Layer      │    │ Desktop     │
│             │    │   (src/services/)    │    │ Chat        │
│ 通过         │    │   50+ services       │    │             │
│ Socket.io   ├───→│                      │←───┤ 通过         │
│ + Chat Svc  │    │   Task, Pomodoro,    │    │ tRPC +      │
│             │    │   Project, NL...     │    │ Socket.io   │
└─────────────┘    └──────────────────────┘    └─────────────┘
```

两条路径并行：
1. **MCP stdio 路径** — 给 IDE（Cursor、Claude Code）使用，不变
2. **Chat Service 路径** — 给 iOS/Desktop/Web 使用，内部复用同一套 Service 层

不需要修改现有 MCP Server 的代码。

---

## 十四、多用户数据隔离

### 14.1 现有隔离架构

VibeFlow 已有成熟的四层隔离体系：

```
认证层 (NextAuth JWT / Dev Header / API Token / MCP Token)
    ↓ 解析出 userId
上下文层 (tRPC Context / socket.data / MCP Context)
    ↓ userId 作为首参数传入
服务层 (50+ Service 全部以 userId 为首参，每条 Prisma WHERE 包含 userId)
    ↓
数据库层 (所有模型含 userId FK，@@unique([userId, date])，@@index([userId]))
```

Chat 功能沿用此模式，但有以下 Chat 特有的隔离问题需要专门处理。

### 14.2 Chat 特有的隔离关注点

#### A. LLM 上下文隔离

服务端为每个用户构建 System Prompt 时注入该用户的任务、项目、番茄钟数据。这些数据通过 Service 层获取，本身已按 userId 隔离。但需要额外注意：

**内存缓存必须按 userId 隔离 key**：

```typescript
// 正确 ✓
const cacheKey = `system-prompt:${userId}`;

// 错误 ✗ — 共享缓存导致用户 B 看到用户 A 的上下文
const cacheKey = 'system-prompt';
```

**LLM 调用实例不能跨用户复用对话上下文**：如果使用 Agent SDK 的会话管理功能，每个 conversation 必须绑定到单一 userId，不能在内存中混合不同用户的 message history。

#### B. 对话所有权验证

```typescript
// chat.service.ts — 所有操作先验证 conversation 归属
async getHistory(userId: string, conversationId: string) {
  // 必须包含 userId，防止通过 conversationId 猜测访问他人数据
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });
  if (!conversation) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } };
  }
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });
  return { success: true, data: messages };
}
```

关键规则：**不能仅凭 `conversationId` 查询消息，必须先验证 conversation 的 userId 归属**。

#### C. Tool 执行的 userId 来源

AI 调用工具时，`userId` 必须从 Chat Session 的已认证上下文中获取，**绝不能从 AI 生成的 tool 参数中读取**（防止 prompt injection 篡改 userId）：

```typescript
// 正确 ✓ — userId 来自服务端会话上下文
async executeToolCall(userId: string, toolName: string, params: unknown) {
  return toolHandlers[toolName](userId, params);
}

// 错误 ✗ — userId 来自 AI 输出
async executeToolCall(toolCall: ToolCall) {
  const { userId, ...params } = toolCall.parameters;  // 不要这样做
  return toolHandlers[toolCall.name](userId, params);
}
```

#### D. Socket.io 层的 Chat 隔离

现有机制已提供保障：
- Socket 连接时认证 userId 并存入 `socket.data.userId`
- 事件处理校验 `event.userId !== socket.data.userId` 则拒绝
- Chat 响应通过 `user:{userId}` room 推送，天然隔离

#### E. 可选的防御性措施

```typescript
// Prisma 扩展 — 开发阶段检测遗漏的 userId 过滤
prisma.$extends({
  query: {
    conversation: {
      async findMany({ args, query }) {
        if (!args.where?.userId) {
          console.warn('[SECURITY] Conversation query without userId filter');
        }
        return query(args);
      },
    },
    chatMessage: {
      async findMany({ args, query }) {
        // chatMessage 通过 conversationId 间接隔离，但直接查询需检查
        if (!args.where?.conversationId && !args.where?.conversation?.userId) {
          console.warn('[SECURITY] ChatMessage query without conversation scope');
        }
        return query(args);
      },
    },
  },
});
```

### 14.3 Chat 数据模型的隔离设计

```prisma
model Conversation {
  id        String   @id @default(uuid())
  userId    String                          // ← 归属用户
  title     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  ChatMessage[]

  @@index([userId, updatedAt])              // ← 按用户查询 + 排序
}

model ChatMessage {
  id             String   @id @default(uuid())
  conversationId String
  role           String   // 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content        String
  metadata       Json?
  tokenCount     Int?
  createdAt      DateTime @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
}
```

消息通过 `conversationId` → `Conversation.userId` 间接隔离。Cascade 删除保证用户注销时清理所有对话数据。

---

## 十五、Agent SDK 选型

Chat 的底层需要一个 Agent 运行时来编排 LLM 调用、工具执行、上下文管理和会话管理。以下是主流方案对比。

### 15.1 方案对比

#### 方案 A: Vercel AI SDK

```
npm: ai (@ai-sdk/anthropic, @ai-sdk/openai, ...)
```

| 维度 | 评价 |
|------|------|
| **核心能力** | `streamText` / `generateText` 函数式 API，内置 agent loop（`maxSteps` 参数控制多轮工具调用），tool 定义用 Zod schema |
| **流式支持** | 原生支持，`streamText` 返回 `ReadableStream`，有 `onChunk` / `onFinish` 回调 |
| **工具系统** | 用 Zod 定义 tool parameters（VibeFlow 已大量使用 Zod），支持 `execute` 回调、`maxSteps` 自动多轮工具调用 |
| **会话管理** | 无内置持久化，消息数组由调用方管理，需要自己做 DB 存储 |
| **上下文管理** | 无内置 memory/RAG，System Prompt 手动拼接 |
| **MCP 集成** | 原生支持 `experimental_toToolResultContent`，可直接连接 MCP server |
| **Provider 切换** | 多 provider 统一接口（Anthropic/OpenAI/Google/Mistral），换模型改一行 |
| **React 集成** | `useChat` hook（Web 端直接用），但 React Native 不支持 `useChat`（需要通过服务端 API） |
| **与 Next.js 集成** | 原生设计，API Route handler 一行代码返回流 |
| **成熟度** | Vercel 维护，社区活跃，VibeFlow 已用 Next.js，生态契合 |

**适配 VibeFlow 的方式**：

```typescript
// src/services/chat.service.ts
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

async handleMessage(userId: string, conversationId: string, content: string,
  onDelta: (command: OctopusCommand) => void
) {
  const history = await this.getHistory(userId, conversationId);
  const systemPrompt = await this.buildSystemPrompt(userId);

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: systemPrompt,
    messages: history.data.map(m => ({ role: m.role, content: m.content })),
    tools: this.getVibeFlowTools(userId),  // Zod-defined tools
    maxSteps: 5,  // 允许最多 5 轮工具调用
    onChunk: ({ chunk }) => {
      if (chunk.type === 'text-delta') {
        onDelta(buildChatResponseCommand(conversationId, chunk.textDelta, 'delta'));
      }
    },
    onFinish: async ({ text, usage }) => {
      await this.persistMessage(conversationId, 'assistant', text, usage);
      onDelta(buildChatResponseCommand(conversationId, text, 'complete'));
    },
  });
}

// Tool 定义直接复用 Zod schema
getVibeFlowTools(userId: string) {
  return {
    flow_complete_task: tool({
      description: '标记任务为完成',
      parameters: z.object({ task_id: z.string().uuid(), summary: z.string().optional() }),
      execute: async ({ task_id, summary }) => {
        const result = await taskService.updateStatus(task_id, 'DONE', userId);
        return result;
      },
    }),
    // ...其余 27 个工具
  };
}
```

#### 方案 B: Anthropic Claude SDK 直接使用

```
npm: @anthropic-ai/sdk
```

| 维度 | 评价 |
|------|------|
| **核心能力** | `messages.create` / `messages.stream`，原生 Claude API 封装，支持 `tool_use` content block |
| **流式支持** | `stream()` 方法返回 SSE 流，有 `on('text')` / `on('contentBlockStart')` 事件 |
| **工具系统** | Claude 原生 tool use 格式，需要自己写 agent loop（收到 `tool_use` → 执行 → 拼回 `tool_result` → 再次调用） |
| **会话管理** | 无，纯 API 调用，消息数组完全自管理 |
| **上下文管理** | 无内置，手动拼接 |
| **MCP 集成** | SDK 本身不集成 MCP，但 Claude Agent SDK（`@anthropic-ai/agent-sdk`）有原生 MCP 支持 |
| **Provider 切换** | 锁定 Anthropic，无法切换到其他 provider |
| **React 集成** | 无 |
| **Agent Loop** | 需要自己实现 while 循环处理多轮 tool_use |
| **成熟度** | Anthropic 官方维护，API 稳定 |

**适配 VibeFlow 的方式**：

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async handleMessage(userId: string, conversationId: string, content: string,
  onDelta: (command: OctopusCommand) => void
) {
  const history = await this.getHistory(userId, conversationId);
  const messages = history.data.map(m => ({ role: m.role, content: m.content }));
  messages.push({ role: 'user', content });

  // 手动 agent loop
  let continueLoop = true;
  while (continueLoop) {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: await this.buildSystemPrompt(userId),
      messages,
      tools: this.getClaudeToolDefinitions(),
    });

    let assistantContent = [];
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onDelta(buildChatResponseCommand(conversationId, event.delta.text, 'delta'));
      }
    }

    const response = await stream.finalMessage();
    assistantContent = response.content;
    messages.push({ role: 'assistant', content: assistantContent });

    // 检查是否有 tool_use
    const toolUses = assistantContent.filter(b => b.type === 'tool_use');
    if (toolUses.length === 0) {
      continueLoop = false;
    } else {
      // 执行工具，拼回 tool_result
      const toolResults = await Promise.all(
        toolUses.map(async (tu) => ({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(await this.executeTool(userId, tu.name, tu.input)),
        }))
      );
      messages.push({ role: 'user', content: toolResults });
    }
  }
}
```

#### 方案 C: Anthropic Agent SDK

```
npm: @anthropic-ai/agent-sdk（Python 为主，TypeScript 版本较新）
```

| 维度 | 评价 |
|------|------|
| **核心能力** | 专为构建 Agent 设计，内置 agent loop、工具编排、guardrails |
| **流式支持** | 支持 |
| **工具系统** | 原生 MCP 集成，可以直接挂载 MCP Server 作为工具源 |
| **会话管理** | 有基础的 conversation turn 管理 |
| **上下文管理** | 支持 MCP Resources 作为上下文来源 |
| **MCP 集成** | **最强** — Agent 可直接连接 MCP Server，自动发现 tools 和 resources |
| **Provider 切换** | 锁定 Anthropic |
| **TypeScript 支持** | TypeScript 版本相对较新，API 稳定性不如 Python 版 |
| **成熟度** | Anthropic 官方出品，但 TS 版生态尚在早期 |

**适配 VibeFlow 的方式**：

```typescript
import { Agent } from '@anthropic-ai/agent-sdk';

// 可以直接连接现有 MCP Server
const agent = new Agent({
  model: 'claude-sonnet-4-20250514',
  mcpServers: [{
    command: 'node',
    args: ['src/mcp/run.ts'],
    env: { MCP_USER_EMAIL: userEmail },
  }],
  systemPrompt: await buildSystemPrompt(userId),
});

// Agent 自动处理多轮工具调用
const result = await agent.run(userMessage);
```

注意：这种方式通过 MCP stdio 调用工具，每个用户的 agent 需要独立的 MCP Server 进程（因为 MCP auth 是进程级的），不适合多用户场景。更实际的做法是注册自定义 tools 而不走 MCP。

#### 方案 D: Mastra

```
npm: mastra
```

| 维度 | 评价 |
|------|------|
| **核心能力** | TypeScript-first Agent 框架，内置 Agent / Tool / Memory / RAG / Workflow |
| **流式支持** | 支持 `streamText`，基于 Vercel AI SDK 底层 |
| **工具系统** | `createTool` 函数，Zod schema 定义参数，支持 MCP 作为工具源 |
| **会话管理** | **内置 memory 层** — 支持多种存储后端（Postgres、SQLite、向量数据库），自动管理对话历史 |
| **上下文管理** | 内置 RAG、知识图谱、语义检索 |
| **MCP 集成** | 原生支持 MCP Tools，可以直接导入现有 MCP Server |
| **Provider 切换** | 多 provider 支持（基于 Vercel AI SDK 的 provider 系统） |
| **React 集成** | 无原生 React hooks |
| **成熟度** | 较新的框架，社区在快速增长，API 可能有 breaking changes |

**适配 VibeFlow 的方式**：

```typescript
import { Agent, createTool } from 'mastra';

const vibeFlowAgent = new Agent({
  name: 'vibeflow-assistant',
  model: anthropic('claude-sonnet-4-20250514'),
  instructions: systemPrompt,
  tools: {
    completeTask: createTool({
      id: 'flow_complete_task',
      description: '标记任务为完成',
      inputSchema: z.object({ task_id: z.string().uuid() }),
      execute: async ({ context, ...params }) => {
        return taskService.updateStatus(params.task_id, 'DONE', context.userId);
      },
    }),
  },
  memory: new PostgresMemory({ connectionString: DATABASE_URL }),  // 自动持久化对话
});

// 调用
const response = await vibeFlowAgent.stream(userMessage, {
  context: { userId },
  threadId: conversationId,
});
```

#### 方案 E: LangGraph.js

```
npm: @langchain/langgraph
```

| 维度 | 评价 |
|------|------|
| **核心能力** | 基于状态图的 Agent 编排框架，适合复杂工作流（条件分支、并行执行、循环） |
| **流式支持** | 支持，通过 stream events |
| **工具系统** | `@langchain/core` 的 `tool` 函数，Zod schema |
| **会话管理** | **内置 checkpointing** — 支持 Postgres/SQLite/Memory 状态持久化，自动断点续传 |
| **上下文管理** | 通过 graph state 管理，可存储任意上下文 |
| **MCP 集成** | 通过 `@langchain/mcp-adapters` 支持 |
| **Provider 切换** | 通过 LangChain provider 系统支持多模型 |
| **复杂度** | **最重** — 引入 LangChain 全家桶，概念多（Graph、State、Node、Edge、Checkpoint） |
| **成熟度** | LangChain 生态成熟，但抽象层级多，调试成本高 |

### 15.2 评估矩阵

| 维度 | Vercel AI SDK | Claude SDK 直调 | Claude Agent SDK | Mastra | LangGraph.js |
|------|:---:|:---:|:---:|:---:|:---:|
| Agent Loop（多轮工具调用） | 内置 (`maxSteps`) | **需自建** | 内置 | 内置 | 内置 |
| 流式输出 | 原生 | 原生 | 支持 | 原生 | 支持 |
| Tool 定义（Zod） | **原生** | 需转换 | 支持 | **原生** | **原生** |
| 会话持久化 | 需自建 | 需自建 | 基础 | **内置 (Postgres)** | **内置 (Checkpoint)** |
| 上下文管理 | 需自建 | 需自建 | MCP Resources | **内置 (Memory+RAG)** | Graph State |
| MCP 集成 | 支持 | 无 | **原生** | 支持 | 适配器 |
| Provider 灵活性 | **多 provider** | 仅 Claude | 仅 Claude | **多 provider** | **多 provider** |
| Next.js 集成 | **最优** | 一般 | 一般 | 一般 | 一般 |
| 依赖复杂度 | 低 | **最低** | 低 | 中 | **高** |
| 学习成本 | 低 | 低 | 中 | 中 | 高 |
| 社区 / 稳定性 | 成熟 | 成熟 | 早期 | 早期 | 成熟 |

### 15.3 推荐方案

#### 推荐：Vercel AI SDK（方案 A）

理由：

1. **与技术栈契合度最高** — VibeFlow 已用 Next.js 14 + React 19 + Zod，Vercel AI SDK 是这套栈的原生 AI 层。Tool 定义直接用 Zod schema，无需格式转换。

2. **轻量且可控** — 不引入重框架，Agent Loop 通过 `maxSteps` 参数实现，会话和上下文管理由 VibeFlow 已有的 Service + Prisma 层处理。这与 VibeFlow 的 "不做过度抽象" 原则一致。

3. **会话管理自建是优势而非劣势** — VibeFlow 需要将对话持久化到已有的 Prisma + PostgreSQL 中（与用户体系、审计日志、数据隔离统一），框架内置的 memory 反而需要二次适配。自建 Conversation/ChatMessage 模型与现有的 userId 隔离体系无缝衔接。

4. **Provider 灵活性** — 短期用 Claude Sonnet，后续可以低成本切换到 Haiku（简单意图）或其他 provider，只改一行 `model` 参数。

5. **Web 端可直接用 `useChat`** — Desktop 端（Web 加载到 Electron）直接受益。iOS 端通过 Socket.io 走服务端 API，不依赖 React hooks。

**需要自建的部分**：

| 能力 | 自建方式 | 复杂度 |
|------|---------|--------|
| 会话持久化 | Prisma Conversation / ChatMessage 模型 | 低 — 标准 CRUD |
| 上下文构建 | 复用 `contextProviderService`，拼接 System Prompt | 低 — 已有基础 |
| 消息裁剪 | 保留最近 N 条 + 早期摘要 | 中 |
| Tool 结果广播 | 工具执行后调用 `socketBroadcastService` | 低 — 已有机制 |

#### 备选：Mastra（方案 D）

如果后续需要更复杂的 AI 能力（RAG、知识图谱、多 Agent 协作），Mastra 是更好的选择。它的 memory 层和 RAG 能力可以减少自建工作量。但目前 VibeFlow 的需求（工具调用 + 流式输出 + 对话管理）用 Vercel AI SDK 足够覆盖，引入 Mastra 属于过度设计。

#### 不推荐：LangGraph.js（方案 E）

抽象层级太重，VibeFlow 的 Agent 不需要复杂的状态图编排（没有条件分支、并行 Agent 等场景）。引入 LangChain 全家桶会显著增加依赖和调试成本。

### 15.4 实施时的依赖安装

```bash
# Phase 1 安装
npm install ai @ai-sdk/anthropic

# 如果需要 OpenAI 作为备选 provider
npm install @ai-sdk/openai
```

无需修改现有的构建配置（Vercel AI SDK 兼容 Next.js 14 + TypeScript 5.7）。

---

## 十六、安全考虑

| 关注点 | 措施 |
|-------|------|
| API Key 安全 | Claude API Key 仅存在于服务端环境变量 |
| 输入注入 | System Prompt 中声明角色边界，不执行超出 VibeFlow 范围的操作 |
| 数据隔离 | Chat Service 复用现有 userId 隔离体系（见第十二章） |
| Tool userId 来源 | 从服务端会话上下文注入，禁止从 AI 输出中读取 |
| 对话所有权 | 查询消息前必须验证 Conversation.userId 归属 |
| LLM 上下文缓存 | 缓存 key 包含 userId，禁止跨用户共享 |
| 操作审计 | 所有 Tool 调用记录到 MCPAuditLog，标记 source='chat' |
| 成本可观测 | Token 使用全链路记录 + 上下文使用率监控（无硬性限制） |
| 敏感操作 | 高风险操作需二次确认 |
