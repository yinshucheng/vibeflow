# AI Chat System Prompt 架构分析

## 当前状态（问题）

### 调用链路

```
用户发消息
  → socket.ts: processChatMessageEvent()
    → chat.service.ts: handleMessage(userId, content, onDelta)
      → chat.service.ts: getHistory() → 构建 llmMessages[]
      → llmAdapterService.callLLM({ scene, messages })  ← ❌ 没有传 system 参数
        → ai SDK streamText({ model, messages })         ← LLM 没有 system prompt
```

### 核心问题

1. **`chat.service.ts:handleMessage()` 没有调用 `chatContextService.buildSystemPrompt()`**
   - `callLLM()` 的 `system` 参数为 `undefined`
   - LLM 不知道自己是 VibeFlow 助手、不知道当前日期、不知道用户状态
   - 导致回复泛泛、无法关联任务数据

2. **`chatContextService.buildSystemPrompt()` 只被 `ai-trigger.service.ts` 使用**
   - 这是自动触发场景（非用户主动聊天）
   - 主聊天链路完全跳过

3. **时间信息放在 system prompt 的 `serializeToMarkdown()` 中不合理**
   - System prompt 应是相对稳定的角色定义
   - 时间每轮对话都在变，应注入到 user message 或 context message 中

## 相关文件

| 文件 | 职责 | 状态 |
|------|------|------|
| `src/services/chat.service.ts` | 主聊天处理 `handleMessage()` | ❌ 未接入 system prompt |
| `src/services/chat-context.service.ts` | 构建 system prompt + LLM messages | ⚠️ 已实现但未被主链路使用 |
| `src/services/context-provider.service.ts` | 动态上下文（状态、任务、番茄钟） | ✅ 实现完整 |
| `src/services/llm-adapter.service.ts` | LLM 调用封装 | ✅ 支持 `system` 参数 |
| `src/services/ai-trigger.service.ts` | 自动触发场景 | ✅ 正确使用 buildSystemPrompt |
| `src/services/chat-tools.service.ts` | Tool 定义（28个工具） | ✅ 已实现 |

## 建议改进方案

### 方案：分层注入

```
System Prompt（稳定，per-conversation）:
  - 角色定义（VibeFlow AI 助手）
  - 行为准则
  - 工具使用说明

Context Message（每轮更新，作为 user message 前缀或独立 system message）:
  - 当前时间: 2026-03-08 14:30
  - 当前状态: PLANNING
  - 活跃番茄钟信息
  - Top 3 任务
  - 今日进度
```

### 具体改动

1. **`chat.service.ts:handleMessage()`** — 接入 system prompt:
   ```typescript
   // 在 callLLM 前构建 system prompt
   const systemResult = await chatContextService.buildSystemPrompt(userId);
   const system = systemResult.success ? systemResult.data : undefined;

   const result = await llmAdapterService.callLLM({
     scene: 'chat:default',
     system,          // ← 加上这个
     messages: llmMessages,
     tools: chatToolSet,  // ← 也应该接入 tools
   });
   ```

2. **时间注入** — 从 `serializeToMarkdown()` 移到每轮 user message 的前缀:
   ```typescript
   // 在 llmMessages 构建时，给最新的 user message 加上时间前缀
   const timePrefix = `[${new Date().toLocaleString('zh-CN')}]\n`;
   messages.push({ role: 'user', content: timePrefix + userContent });
   ```

3. **`context-provider.service.ts:serializeToMarkdown()`** — 移除时间注入
   - 时间不再属于 system prompt 的动态上下文

### 优先级

- P0: `handleMessage` 接入 `buildSystemPrompt` — 没有这个，LLM 完全不知道自己的角色
- P1: 时间从 system prompt 移到每轮 message
- P2: 接入 chat tools（让 AI 能查询/操作任务数据）
