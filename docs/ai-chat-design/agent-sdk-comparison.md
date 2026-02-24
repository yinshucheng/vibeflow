# Agent SDK 选型对比

> VibeFlow AI Chat 底层 Agent 运行时选型分析。重点评估各 SDK 在 **Skills/MCP/Tools 集成**、多模型支持、流式输出和工程化方面的能力。

---

## 一、评估维度

VibeFlow 的 Agent 需求：

1. **Tool Orchestration** — 编排 28+ 个 MCP Tools（任务管理、番茄钟控制、项目操作等），支持多轮工具调用
2. **MCP 集成** — 能直接连接现有 MCP Server 或复用其 Tool/Resource 定义
3. **Skills 扩展** — 支持自定义 Skill 包（组合多个工具+上下文形成高阶能力）
4. **多 Provider** — Anthropic / OpenAI / Google / Qwen / Kimi，且可灵活切换
5. **流式输出** — 通过 Socket.io 推送到 iOS/Desktop 客户端
6. **会话 & 上下文管理** — 消息持久化、上下文裁剪、摘要压缩
7. **Next.js 集成** — 与 VibeFlow 的 Next.js 14 技术栈兼容
8. **可控性** — 不过度抽象，可以精确控制 System Prompt、Tool 子集、模型路由

---

## 二、候选方案

| 方案 | Package | 维护者 | 定位 |
|------|---------|--------|------|
| **A. Vercel AI SDK** | `ai` + `@ai-sdk/*` | Vercel | 轻量函数式 AI 工具库，多 Provider |
| **B. Anthropic Claude SDK** | `@anthropic-ai/sdk` | Anthropic | Claude API 直接封装 |
| **C. Anthropic Agent SDK** | `@anthropic-ai/agent-sdk` | Anthropic | Agent 框架，原生 MCP |
| **D. Mastra** | `mastra` | Mastra Inc. | TypeScript-first Agent 框架 |
| **E. LangGraph.js** | `@langchain/langgraph` | LangChain | 状态图编排框架 |

---

## 三、逐方案深度分析

### 方案 A: Vercel AI SDK

```
npm install ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google
```

#### 核心架构

```
streamText / generateText (函数式调用)
    ↓
Provider 层 (@ai-sdk/anthropic, @ai-sdk/openai, ...)
    ↓
各供应商 API
```

#### Tool 系统

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const flowCompleteTask = tool({
  description: '标记任务为完成',
  parameters: z.object({
    task_id: z.string().uuid(),
    summary: z.string().optional(),
  }),
  execute: async ({ task_id, summary }) => {
    return taskService.updateStatus(task_id, 'DONE', userId);
  },
});

// Agent Loop: maxSteps 控制多轮工具调用
const result = streamText({
  model: anthropic('claude-sonnet-4-20250514'),
  tools: { flowCompleteTask, flowCreateTask, flowStartPomodoro, ... },
  maxSteps: 5,  // 最多 5 轮 LLM → Tool → LLM 循环
  ...
});
```

**Tool 定义方式**：Zod schema — 与 VibeFlow 现有的 tRPC + Zod 验证体系一致，无格式转换。

**Agent Loop**：通过 `maxSteps` 参数控制，SDK 内部自动处理 tool_use → execute → tool_result → 再次调用的循环。无需手动写 while 循环。

#### MCP 集成

```typescript
import { experimental_createMCPClient } from 'ai';

// 方式 1: 通过 MCP Client 导入现有 MCP Server 的工具
const mcpClient = await experimental_createMCPClient({
  transport: { type: 'stdio', command: 'node', args: ['src/mcp/run.ts'] },
});
const mcpTools = await mcpClient.tools();

// 方式 2: 直接定义工具（推荐 — 跳过 MCP stdio 序列化开销）
const tools = buildVibeFlowTools(userId);

const result = streamText({
  model,
  tools: { ...mcpTools, ...tools },  // 可混合使用
  ...
});
```

**MCP 支持现状**：`experimental_createMCPClient` 处于实验阶段，支持 stdio 和 SSE 两种传输方式。可以直接导入现有 MCP Server 的 tools 和 resources。但对于 VibeFlow 场景，更推荐直接定义 tools（避免 MCP stdio 进程开销，且可以精确注入 userId）。

#### Skills 扩展模式

Vercel AI SDK 本身没有 "Skill" 概念，但可以通过组合模式实现：

```typescript
// src/skills/daily-planning.skill.ts
// Skill = System Prompt 片段 + Tool 子集 + 上下文构建逻辑

interface Skill {
  name: string;
  /** 追加到 System Prompt 的指令 */
  systemPromptSegment: string;
  /** 该 Skill 需要的 Tool 子集 */
  tools: Record<string, CoreTool>;
  /** 构建该 Skill 所需的上下文 */
  buildContext: (userId: string) => Promise<string>;
}

const dailyPlanningSkill: Skill = {
  name: 'daily_planning',
  systemPromptSegment: `
    你正在帮助用户进行每日规划。
    优先选择用户的 Top 3 任务，结合历史完成率给出建议。
    可以使用 flow_get_top3、flow_set_top3、flow_get_backlog_tasks 工具。
  `,
  tools: {
    flow_get_top3: ...,
    flow_set_top3: ...,
    flow_get_backlog_tasks: ...,
    flow_update_task: ...,
  },
  buildContext: async (userId) => {
    const [top3, backlog, stats] = await Promise.all([
      taskService.getTop3(userId),
      taskService.getBacklog(userId),
      analyticsService.getCompletionRate(userId, 7),
    ]);
    return `当前 Top 3: ${JSON.stringify(top3)}\n待办池: ${JSON.stringify(backlog)}\n近 7 日完成率: ${stats.rate}%`;
  },
};

// 在 Chat Service 中根据意图激活 Skill
async handleMessage(userId, content, ...) {
  const intent = classifyIntent(content);
  const skill = skillRegistry.get(intent);

  const result = streamText({
    model,
    system: baseSystemPrompt + (skill ? '\n' + skill.systemPromptSegment : ''),
    tools: skill ? skill.tools : allTools,
    ...
  });
}
```

#### 多 Provider 支持

| Provider | Package | 接入方式 |
|----------|---------|---------|
| Anthropic | `@ai-sdk/anthropic` | 原生 |
| OpenAI | `@ai-sdk/openai` | 原生 |
| Google | `@ai-sdk/google` | 原生 |
| Mistral | `@ai-sdk/mistral` | 原生 |
| Qwen / Kimi / DeepSeek | `@ai-sdk/openai` → `createOpenAI({ baseURL })` | OpenAI-compatible |
| Ollama (本地) | `@ai-sdk/openai` → `createOpenAI({ baseURL: 'http://localhost:11434/v1' })` | OpenAI-compatible |

**切换成本**：一行代码。`streamText({ model: newProvider('model-name') })` — 其余 tools、messages、callbacks 完全不变。

#### 优势

- 与 VibeFlow 技术栈（Next.js + Zod + TypeScript）契合度最高
- 函数式 API，不引入 class 体系，与现有 Service 模式一致
- `maxSteps` 内置 Agent Loop，代码最简洁
- Provider 切换零成本
- 社区活跃，Vercel 持续投入

#### 劣势

- 无内置会话持久化（需自建 Prisma 模型）
- 无内置 Memory / RAG
- MCP Client 处于 experimental 阶段
- 无 Skill 抽象（需自建 Skill Registry 模式）
- React Native 无法使用 `useChat` hook（不影响 VibeFlow，因为 iOS 走 Socket.io）

---

### 方案 B: Anthropic Claude SDK 直接使用

```
npm install @anthropic-ai/sdk
```

#### 核心架构

```
client.messages.create / client.messages.stream
    ↓
Anthropic API (仅限 Claude)
```

#### Tool 系统

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// 工具定义格式：JSON Schema（非 Zod — 需要格式转换）
const tools: Anthropic.Tool[] = [{
  name: 'flow_complete_task',
  description: '标记任务为完成',
  input_schema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: '任务 UUID' },
      summary: { type: 'string', description: '完成摘要' },
    },
    required: ['task_id'],
  },
}];

// Agent Loop 需要手动实现
async function agentLoop(messages: Anthropic.Message[], tools) {
  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter(b => b.type === 'tool_use');
    if (toolUses.length === 0) break;

    // 手动执行工具 → 拼回 tool_result → 继续循环
    const toolResults = await Promise.all(toolUses.map(async (tu) => ({
      type: 'tool_result' as const,
      tool_use_id: tu.id,
      content: JSON.stringify(await executeTool(tu.name, tu.input)),
    })));
    messages.push({ role: 'user', content: toolResults });
  }
}
```

#### MCP 集成

无。SDK 只是 API 封装，不集成 MCP。

#### Skills 扩展

无内置支持，需完全自建。

#### 多 Provider 支持

锁定 Anthropic。要支持 OpenAI/Google/Qwen 需要引入额外 SDK 并手动做接口适配。

#### 优势

- 依赖最少，最接近原始 API
- Anthropic 官方维护，API 稳定
- 完全控制每一步（适合需要深度定制的场景）

#### 劣势

- **Agent Loop 需手动实现** — ~50 行 while 循环代码
- **Tool 定义用 JSON Schema** — 不兼容 VibeFlow 的 Zod 体系，需要 zod-to-json-schema 转换
- **锁定单一供应商** — 无法切换到 OpenAI/Qwen/Kimi
- 无流式 Agent Loop（需要手动组合 stream + tool 循环）

---

### 方案 C: Anthropic Agent SDK

```
npm install @anthropic-ai/agent-sdk
```

#### 核心架构

```
Agent (class)
  ├── MCP Server 连接（stdio / SSE）
  ├── 自定义 Tools
  ├── Guardrails
  └── 内置 Agent Loop
```

#### Tool 系统

```typescript
import { Agent, tool } from '@anthropic-ai/agent-sdk';

const agent = new Agent({
  model: 'claude-sonnet-4-20250514',
  tools: [
    tool({
      name: 'flow_complete_task',
      description: '标记任务为完成',
      schema: z.object({ task_id: z.string().uuid() }),
      handler: async ({ task_id }) => {
        return taskService.updateStatus(task_id, 'DONE', userId);
      },
    }),
  ],
});
```

#### MCP 集成 — 最强

```typescript
// 直接挂载 MCP Server，自动发现 tools 和 resources
const agent = new Agent({
  model: 'claude-sonnet-4-20250514',
  mcpServers: [
    {
      // VibeFlow 现有 MCP Server
      command: 'node',
      args: ['src/mcp/run.ts'],
      env: { MCP_AUTH_TOKEN: `dev_${userEmail}` },
    },
    {
      // 可以挂载额外的 MCP Server（如日历、邮件等外部 Skill）
      url: 'https://calendar-mcp.example.com/sse',
      headers: { Authorization: `Bearer ${token}` },
    },
  ],
});

// Agent 自动发现 MCP Server 暴露的所有 tools + resources
// 无需手动注册每个工具
const result = await agent.run(userMessage);
```

**关键问题**：MCP Server 的 Auth 是进程级别的（`MCP_AUTH_TOKEN` 包含 userId）。多用户场景下，每个用户需要独立的 MCP Server 进程 — 这在服务端不可扩展。

**变通方案**：不走 MCP stdio，而是注册自定义 Tools（手动定义），此时 Agent SDK 退化为一个带 Agent Loop 的 Claude API 封装。

#### Skills 扩展

通过 `Agent` 子类化或 MCP Server 组合实现。每个 MCP Server 本质上就是一个 "Skill Pack"：

```typescript
// 日历 Skill = 一个 MCP Server
const calendarSkill = { url: 'https://calendar-mcp.example.com/sse' };

// 邮件 Skill = 另一个 MCP Server
const emailSkill = { url: 'https://email-mcp.example.com/sse' };

// Agent 组合多个 Skills
const agent = new Agent({
  mcpServers: [vibeflowMCP, calendarSkill, emailSkill],
});
```

#### 多 Provider 支持

锁定 Anthropic（Claude 专用）。

#### 优势

- **MCP 集成最原生** — 直接挂载 MCP Server，自动工具发现
- Guardrails 内置（输入/输出验证）
- Agent Loop 内置
- Anthropic 官方出品

#### 劣势

- **TypeScript 版本较新**，API 可能有 breaking changes
- **锁定 Claude** — 无法使用 OpenAI/Qwen/Kimi
- **MCP 多用户问题** — 进程级 Auth 不适合多用户服务端部署
- 不走 MCP 时，优势大幅削减（退化为 Claude SDK + Agent Loop）

---

### 方案 D: Mastra

```
npm install mastra @mastra/core
```

#### 核心架构

```
Agent (class)
  ├── Tools (Zod schema)
  ├── Memory (Postgres / SQLite / Vector)
  ├── RAG (Knowledge / Embeddings)
  ├── Workflows (DAG 编排)
  └── MCP Adapter
```

#### Tool 系统

```typescript
import { Agent, createTool } from '@mastra/core';

const completeTask = createTool({
  id: 'flow_complete_task',
  description: '标记任务为完成',
  inputSchema: z.object({ task_id: z.string().uuid() }),
  execute: async ({ context, ...params }) => {
    return taskService.updateStatus(params.task_id, 'DONE', context.userId);
  },
});

const agent = new Agent({
  name: 'vibeflow-assistant',
  model: anthropic('claude-sonnet-4-20250514'),
  tools: { completeTask, createTask, startPomodoro, ... },
});
```

#### MCP 集成

```typescript
import { MCPConfiguration } from '@mastra/mcp';

const mcp = new MCPConfiguration({
  servers: {
    vibeflow: {
      command: 'node',
      args: ['src/mcp/run.ts'],
      env: { MCP_AUTH_TOKEN: token },
    },
  },
});

const agent = new Agent({
  tools: {
    ...mcp.getTools(),       // 自动导入 MCP Tools
    ...customTools,          // 混合自定义 Tools
  },
});
```

#### Skills 扩展

Mastra 没有显式的 "Skill" 概念，但可以通过 Workflow 实现多步 Skill：

```typescript
import { Workflow, Step } from '@mastra/core';

const dailyPlanningWorkflow = new Workflow({
  name: 'daily_planning',
  steps: [
    new Step({
      id: 'gather_context',
      execute: async ({ context }) => {
        const tasks = await taskService.getOverdue(context.userId);
        const backlog = await taskService.getBacklog(context.userId);
        return { tasks, backlog };
      },
    }),
    new Step({
      id: 'ai_suggest',
      execute: async ({ context, previousStepResult }) => {
        return agent.generate(`请根据以下信息规划今天的任务: ${JSON.stringify(previousStepResult)}`);
      },
    }),
  ],
});
```

#### Memory 系统

```typescript
import { PostgresMemory } from '@mastra/memory';

const agent = new Agent({
  memory: new PostgresMemory({
    connectionString: process.env.DATABASE_URL,
  }),
});

// 自动持久化对话历史，自动上下文裁剪
const response = await agent.stream(userMessage, {
  threadId: conversationId,
  context: { userId },
});
```

**注意**：Mastra 的 Memory 使用独立的表结构，与 VibeFlow 现有的 Prisma schema 不兼容。需要做数据映射或放弃使用 Mastra Memory 而自建。

#### 多 Provider 支持

基于 Vercel AI SDK 的 Provider 层，支持所有 `@ai-sdk/*` providers。

#### 优势

- **内置 Memory + RAG** — 会话持久化、知识检索开箱即用
- **Workflow 编排** — 适合复杂多步骤 Skill
- **MCP 集成完善** — 通过 `@mastra/mcp` 适配器
- 多 Provider 支持（继承自 Vercel AI SDK）
- TypeScript-first，类型安全

#### 劣势

- **框架较重** — 引入 Agent/Workflow/Memory/RAG 全家桶
- **Memory 表结构与 Prisma 不兼容** — 二选一：用 Mastra Memory（放弃 Prisma 统一管理）或自建（放弃 Mastra Memory 优势）
- **API 不稳定** — 较新的框架，breaking changes 风险
- **过度抽象** — VibeFlow 的 Agent 场景相对简单（工具调用 + 流式），不需要 Workflow/RAG
- 社区尚小，文档和示例不如 Vercel AI SDK 丰富

---

### 方案 E: LangGraph.js

```
npm install @langchain/langgraph @langchain/core @langchain/anthropic
```

#### 核心架构

```
StateGraph
  ├── Nodes (Agent / Tool / Custom)
  ├── Edges (条件路由)
  ├── State (可持久化)
  └── Checkpointer (Postgres / SQLite)
```

#### Tool 系统

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const completeTask = tool(
  async ({ task_id }) => {
    return JSON.stringify(await taskService.updateStatus(task_id, 'DONE', userId));
  },
  {
    name: 'flow_complete_task',
    description: '标记任务为完成',
    schema: z.object({ task_id: z.string().uuid() }),
  }
);
```

#### MCP 集成

```typescript
import { MCPToolkit } from '@langchain/mcp-adapters';

const toolkit = new MCPToolkit({
  servers: {
    vibeflow: {
      command: 'node',
      args: ['src/mcp/run.ts'],
    },
  },
});

await toolkit.initialize();
const mcpTools = toolkit.getTools();
```

#### Skills 扩展

通过 SubGraph 实现复杂 Skill：

```typescript
import { StateGraph, START, END } from '@langchain/langgraph';

// 每日规划 Skill = 一个子图
const planningGraph = new StateGraph({ channels: planningState })
  .addNode('gather', gatherContextNode)
  .addNode('analyze', aiAnalyzeNode)
  .addNode('suggest', aiSuggestNode)
  .addEdge(START, 'gather')
  .addEdge('gather', 'analyze')
  .addConditionalEdges('analyze', routeByComplexity, {
    simple: 'suggest',
    complex: 'deep_analyze',
  })
  .addEdge('suggest', END);

// 主 Agent 图可以调用子图作为 Skill
const mainGraph = new StateGraph({ channels: mainState })
  .addNode('agent', agentNode)
  .addNode('planning_skill', planningGraph.compile())
  .addConditionalEdges('agent', routeToSkill, {
    planning: 'planning_skill',
    default: END,
  });
```

#### 会话管理

```typescript
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

const checkpointer = new PostgresSaver({ connectionString: process.env.DATABASE_URL });
const graph = mainGraph.compile({ checkpointer });

// 自动持久化状态，支持断点续传
const result = await graph.invoke(
  { messages: [{ role: 'user', content: userMessage }] },
  { configurable: { thread_id: conversationId } }
);
```

#### 多 Provider 支持

通过 LangChain provider 系统：`@langchain/anthropic`, `@langchain/openai`, `@langchain/google-genai`。

#### 优势

- **状态图编排能力最强** — 条件分支、并行执行、子图嵌套
- **Checkpointer 内置** — 会话状态自动持久化到 Postgres
- **MCP 适配器成熟** — `@langchain/mcp-adapters`
- LangChain 生态成熟，社区庞大

#### 劣势

- **抽象层级过重** — Graph/State/Node/Edge/Checkpoint 概念链长
- **依赖庞大** — LangChain 全家桶（core + langgraph + 各 provider）
- **调试成本高** — 图执行的 trace 不如函数调用直观
- **过度设计** — VibeFlow 不需要条件分支、并行 Agent、状态图编排
- **性能开销** — LangChain 中间层增加序列化/反序列化成本

---

## 四、Skills / MCP / Tools 集成专项对比

这是 VibeFlow 最关键的评估维度。

### 4.1 Tool 定义与注册

| 维度 | Vercel AI SDK | Claude SDK | Agent SDK | Mastra | LangGraph.js |
|------|:---:|:---:|:---:|:---:|:---:|
| 定义格式 | **Zod** | JSON Schema | Zod | **Zod** | **Zod** |
| 与 VibeFlow Zod 体系兼容 | **原生** | 需转换 | 兼容 | **原生** | **原生** |
| 注册方式 | 对象字面量 | 数组 | 数组 / MCP | 对象字面量 | 数组 |
| 动态 Tool 子集 | 手动过滤 | 手动过滤 | MCP 动态发现 | 手动过滤 | 手动过滤 |
| Tool 执行上下文 (userId) | 闭包注入 | 闭包注入 | MCP env / 闭包 | context 参数 | 闭包注入 |

### 4.2 MCP Server 集成

| 维度 | Vercel AI SDK | Claude SDK | Agent SDK | Mastra | LangGraph.js |
|------|:---:|:---:|:---:|:---:|:---:|
| 集成方式 | `experimental_createMCPClient` | 无 | **原生 mcpServers** | `@mastra/mcp` | `@langchain/mcp-adapters` |
| 成熟度 | 实验阶段 | — | **生产就绪** | 稳定 | 稳定 |
| 传输方式 | stdio, SSE | — | stdio, SSE, HTTP | stdio, SSE | stdio, SSE |
| 多 MCP Server 组合 | 手动合并 tools | — | **原生数组** | 配置声明 | 手动合并 |
| MCP Resources 读取 | 支持 | — | **原生** | 支持 | 通过适配器 |
| 多用户 Auth 隔离 | 手动管理 | — | 进程级（问题） | 手动管理 | 手动管理 |

### 4.3 Skill 组合能力

| 维度 | Vercel AI SDK | Claude SDK | Agent SDK | Mastra | LangGraph.js |
|------|:---:|:---:|:---:|:---:|:---:|
| Skill 抽象 | 无（需自建） | 无（需自建） | MCP Server = Skill | Workflow | **SubGraph** |
| 多步 Skill 编排 | maxSteps 循环 | 手动循环 | Agent Loop | **Workflow DAG** | **StateGraph** |
| Skill 间通信 | 无 | 无 | MCP protocol | Step context | Graph State |
| 动态 Skill 激活 | 手动路由 | 手动路由 | MCP 动态发现 | 手动路由 | 条件边路由 |
| Skill 组合复杂度 | 低 | 最低 | 中 | 中高 | **高** |

### 4.4 外部工具/服务接入

后续 VibeFlow 可能需要接入日历、邮件、Notion、GitHub 等外部服务。

| 维度 | Vercel AI SDK | Claude SDK | Agent SDK | Mastra | LangGraph.js |
|------|:---:|:---:|:---:|:---:|:---:|
| 接入新服务 | 写 tool + execute | 写 tool + execute | **挂 MCP Server** | 写 tool / integration | 写 tool |
| 现成集成数量 | 无 | 无 | MCP 生态 | **200+ integrations** | LangChain tools |
| MCP 生态接入 | 实验性 | 不支持 | **原生** | 适配器 | 适配器 |
| 自定义 API 封装 | tool + fetch | tool + fetch | tool + fetch | **integration builder** | tool + fetch |

---

## 五、综合评估矩阵

| 维度 (权重) | Vercel AI SDK | Claude SDK | Agent SDK | Mastra | LangGraph.js |
|------|:---:|:---:|:---:|:---:|:---:|
| **Tool 系统 (25%)** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **MCP 集成 (20%)** | ⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **多 Provider (20%)** | ⭐⭐⭐⭐⭐ | ⭐ | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **流式输出 (10%)** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Skill 扩展 (10%)** | ⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Next.js 集成 (5%)** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **依赖轻量 (5%)** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐ |
| **API 稳定性 (5%)** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **加权总分** | **4.2** | **2.3** | **3.2** | **4.0** | **3.3** |

---

## 六、推荐方案

### 首选：Vercel AI SDK（方案 A）

**核心理由**：

1. **Zod + Tool 体系与 VibeFlow 100% 兼容** — 现有 28 个 MCP Tool 的 Zod schema 可直接复用为 AI Tool 定义，零转换成本。

2. **多 Provider 是硬需求** — VibeFlow 需要支持 Claude/GPT/Gemini/Qwen/Kimi，且后续可能继续扩展。Vercel AI SDK 的 Provider 抽象层是唯一做到"换模型改一行代码"的方案。

3. **"不做过度抽象"原则** — VibeFlow 的 Agent 场景是 "LLM + 工具调用 + 流式输出"，不需要状态图、DAG Workflow、Graph 编排。`streamText()` + `maxSteps` 足够覆盖。

4. **会话管理自建反而是优势** — VibeFlow 已有 Prisma + PostgreSQL + userId 隔离体系，自建 Conversation/ChatMessage 模型与现有架构无缝衔接。框架内置的 Memory 反而需要额外适配。

5. **MCP 集成路径清晰** — 短期直接定义 Tools（最高效），中期可通过 `experimental_createMCPClient` 对接外部 MCP Server（日历、邮件等）。

**需要自建的部分**：

| 能力 | 实现方式 | 复杂度 |
|------|---------|--------|
| Skill Registry | Tool 子集 + System Prompt 片段 + Context Builder | 低 |
| 会话持久化 | Prisma Conversation / ChatMessage 模型 | 低 |
| 上下文裁剪 | 滑动窗口 + 摘要压缩 | 中 |
| 外部 MCP Server 接入 | `experimental_createMCPClient` | 中（实验 API） |

### 备选：Mastra（方案 D）

**升级条件**：当 VibeFlow 需要以下能力时考虑迁移到 Mastra：

- 内置 RAG / 知识图谱（如用户想让 AI 基于历史数据做深度分析）
- 复杂多步 Workflow（如跨多个外部服务的自动化流程）
- 需要 200+ 现成 Integration（日历/Slack/Notion 等）

**迁移成本**：Mastra 底层使用 Vercel AI SDK 的 Provider 系统，Tool 定义格式兼容（Zod），迁移主要是将函数式调用改为 Agent class 实例化。

### 不推荐

| 方案 | 不推荐原因 |
|------|-----------|
| **Claude SDK 直调** | 锁定单一供应商，Agent Loop 手动实现，Tool 格式不兼容 Zod |
| **Agent SDK** | 锁定 Claude，TS 版本不成熟，MCP 多用户问题未解决 |
| **LangGraph.js** | 抽象过重，VibeFlow 不需要状态图编排，依赖庞大 |

---

## 七、实施建议

### Phase 1: Vercel AI SDK 基础集成

```bash
npm install ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google
```

- 实现 `chatService` + `llmAdapterService`
- 28 个 MCP Tools 转为 Vercel AI SDK tool 定义
- `streamText` + `maxSteps` 实现 Agent Loop
- Prisma 会话持久化

### Phase 2: Skill Registry

- 抽象 `Skill` 接口（System Prompt 片段 + Tool 子集 + Context Builder）
- 实现 5 个核心 Skills：daily_planning / quick_action / task_analysis / review / trigger
- 意图分类 → Skill 路由

### Phase 3: 外部 MCP Server 接入

- `experimental_createMCPClient` 对接外部 MCP Server
- 日历集成 / Notion 集成 / GitHub 集成
- MCP Tool 动态发现 + 权限控制

### Phase 4: 评估是否升级到 Mastra

- 根据 Phase 1-3 的实际需求评估
- 如果 Skill 编排需求超出 `maxSteps` 能力 → 考虑 Mastra Workflow
- 如果需要 RAG / Knowledge Graph → 考虑 Mastra Memory + RAG
