# AI Chat 分阶段开发 — 会话 Prompt 模板

> 每个模块一个 Claude Code 对话。完成后 commit，然后开下一个对话。
>
> 分支: `feature/f2-llm-engine`

---

## 已完成

| 模块 | 状态 | Commit |
|------|------|--------|
| F2 LLM 引擎 | ✅ | `cc4aca9` `a6827a0` |
| F1 数据层 | ✅ | `ad75901` |
| F0 测试基础设施 | ✅ | `870619b` |

---

## Foundation 阶段 (串行)

### 会话 3: F3 会话管理

```
切到 feature/f2-llm-engine 分支。
阅读 docs/ai-chat-design/tasks.md 中的「F3. 会话管理」部分 (F3.1-F3.4)。
阅读 docs/ai-chat-design/design.md 中 Section 5 (Chat Service) 了解技术设计。

实现:
- F3.1 chat.service.ts: getOrCreateDefaultConversation, persistMessage, getHistory
- F3.2 handleMessage 主流程: 获取会话 → 并发锁 → 构建消息 → 调用 LLM → 持久化 → 记录 token
- F3.3 conversationLocks 并发锁
- F3.4 所有测试 (tests/services/chat.service.test.ts, chat-concurrency.test.ts, chat-data-isolation.property.ts)

注意:
- 使用 tests/helpers/chat-test-setup.ts 和 tests/helpers/llm-mock.ts (F0 已提供)
- Service 遵循 ServiceResult<T> 模式，参考现有 service 写法
- 注册到 src/services/index.ts

确保 npx tsc --noEmit 通过，npm test 中新测试全绿后 commit。
```

### 会话 4: F4 Tool 框架

```
切到 feature/f2-llm-engine 分支。
阅读 docs/ai-chat-design/tasks.md 中的「F4. Tool 框架」部分 (F4.1-F4.4)。
阅读 docs/ai-chat-design/design.md 中 Section 6 (Tool Framework) 了解技术设计。

实现:
- F4.1 Tool 注册机制: MCP Tool 定义 → Vercel AI SDK tool() 格式，userId 注入闭包
- F4.2 首批 3 个 Tool: flow_complete_task, flow_create_task_from_nl, flow_start_pomodoro
- F4.3 Tool 确认机制框架: requiresConfirmation 标记 + handleToolConfirmation
- F4.4 所有测试 (tests/services/chat-tools.test.ts, chat-tool-userid-injection.property.ts)

注意:
- Tool execute 闭包中 userId 从服务端上下文获取，不信任 AI 传入
- 复用 tests/helpers/llm-mock.ts 中的 mockStreamTextWithToolUse

确保 npx tsc --noEmit 通过，npm test 中新测试全绿后 commit。
```

### 会话 5: F5 传输层

```
切到 feature/f2-llm-engine 分支。
阅读 docs/ai-chat-design/tasks.md 中的「F5. 传输层」部分 (F5.1-F5.3)。
阅读 docs/ai-chat-design/design.md 中 Section 7 (Transport Layer) 了解技术设计。
阅读 src/server/socket.ts 了解现有 processOctopusEvent 模式。

实现:
- F5.1 socket.ts: processOctopusEvent 新增 CHAT_MESSAGE → chatService.handleMessage, CHAT_ACTION → handleToolConfirmation
- F5.2 多端消息同步: AI 回复完成后广播 CHAT_SYNC
- F5.3 E2E 测试 (e2e/tests/chat-basic.spec.ts, chat-sync.spec.ts)

注意:
- 流式回调 onDelta → sendOctopusCommand 推送 CHAT_RESPONSE
- 使用 e2e/fixtures/chat.fixture.ts (F0 已提供)

确保 npx tsc --noEmit 通过，npm test 中新测试全绿后 commit。
```

### 会话 6: F6 上下文管理

```
切到 feature/f2-llm-engine 分支。
阅读 docs/ai-chat-design/tasks.md 中的「F6. 上下文管理」部分 (F6.1-F6.3)。
阅读 docs/ai-chat-design/design.md 中 Section 8 (Context Management) 了解技术设计。

实现:
- F6.1 buildSystemPrompt(userId): 静态模板 + contextProviderService.getFullContext 动态上下文
- F6.2 buildLLMMessages: DB 取最近 N=20 条，跳过 role='system'，Token 裁剪
- F6.3 所有测试 (tests/services/chat-context.test.ts, chat-sliding-window.property.ts)

确保 npx tsc --noEmit 通过，npm test 中新测试全绿后 commit。
```

### 会话 7: F7 可观测性

```
切到 feature/f2-llm-engine 分支。
阅读 docs/ai-chat-design/tasks.md 中的「F7. 可观测性」部分 (F7.1-F7.3)。
阅读 docs/ai-chat-design/design.md 中 Section 11 (Observability) 了解技术设计。

实现:
- F7.1 trackUsage: 写入 LLMUsageLog，计算 contextUsagePercent
- F7.2 getConversationStats: 累计 tokens / 上下文使用率 / 消息数 / 当前模型
- F7.3 所有测试 (tests/services/chat-observability.test.ts, chat-token-tracking.property.ts)

确保 npx tsc --noEmit 通过，npm test 中新测试全绿后 commit。
```

### 会话 8: F8 端侧框架 (iOS)

```
切到 feature/f2-llm-engine 分支。
阅读 docs/ai-chat-design/tasks.md 中的「F8. 端侧框架」部分 (F8.1-F8.6)。
阅读 docs/ai-chat-design/design.md 中 Section 12 (iOS Client) 了解技术设计。
阅读 vibeflow-ios/CLAUDE.md 了解 iOS 项目约定。

实现:
- F8.1 vibeflow-ios/src/types/chat.ts: ChatMessage, PendingToolCall 等类型
- F8.2 Chat Store (Zustand): messages, isStreaming, pendingToolCalls, actions
- F8.3 Chat Service: Socket.io 命令监听 + 事件发送
- F8.4 Chat UI 骨架: ChatFAB, ChatPanel, ChatMessageList, ChatBubble, ChatInput
- F8.5 AppProvider 集成
- F8.6 所有测试 (vibeflow-ios/__tests__/chat-store.test.ts, chat-service.test.ts)

确保 npx tsc --noEmit 通过，cd vibeflow-ios && npx jest 新测试全绿后 commit。
```

---

## Scenarios 阶段 (可按顺序或并行)

### 会话 9: S1 Tool 全量绑定

```
切到 feature/f2-llm-engine 分支。
阅读 docs/ai-chat-design/tasks.md 中的「S1. 核心 Tool 全量绑定」部分。

实现 S1.1-S1.6: 将剩余 MCP tools (共 23 个，分任务管理/番茄钟/批量规划/项目管理/其他) 全部绑定为 Chat Tool。
测试: tests/services/chat-tools-full.test.ts, tests/property/chat-tool-completeness.property.ts

确保 npm test 中新测试全绿后 commit。
```

### 会话 10: S2 确认 UI + S3 Web/Desktop Chat

```
切到 feature/f2-llm-engine 分支。
阅读 docs/ai-chat-design/tasks.md 中的「S2. 高风险操作确认 UI」和「S3. Web / Desktop Chat」部分。

实现:
- S2: ChatToolCallCard, ChatToolResultCard (iOS), 确认规则定义, E2E 测试
- S3: Web Chat 组件, tRPC chat router, Desktop 快捷键 ⌘⇧Space

确保 npm test 全绿后 commit。
```

### 会话 11: S4 主动触发框架 + S5 状态转换触发器

```
切到 feature/f2-llm-engine 分支。
阅读 docs/ai-chat-design/tasks.md 中的「S4. AI 主动触发框架」和「S5. 状态转换触发器」部分。

实现:
- S4: ai-trigger.service.ts (TriggerDefinition, shouldFire, fire), MCP 事件发布补齐
- S5: on_planning_enter, on_rest_enter, on_over_rest_enter, over_rest_escalation, task_stuck

确保 npm test 全绿后 commit。
```

### 会话 12: S6 意图路由 + S7 长对话保障

```
切到 feature/f2-llm-engine 分支。
阅读 docs/ai-chat-design/tasks.md 中的「S6. 意图路由与 Dynamic Context」和「S7. 上下文长对话保障」部分。

实现:
- S6: classifyIntent, Tool 子集策略, Dynamic Context 按意图加载, 场景路由配置
- S7: 摘要生成 (消息>40条), Tool Result 压缩, 上下文使用率 UI, 自动压缩触发

确保 npm test 全绿后 commit。
```

### 会话 13: S8 会话归档 + S9 定时触发器 + S10 用户配置

```
切到 feature/f2-llm-engine 分支。
阅读 docs/ai-chat-design/tasks.md 中的「S8. 会话归档与历史」「S9. 定时触发器」「S10. 用户配置」部分。

实现:
- S8: Daily Archive (04:00 AM), 历史记录 UI, 30 天会话清理
- S9: morning_greeting, evening_summary, progress_check, midday_check
- S10: 触发器配置 UI, 模型偏好设置 UI

确保 npm test 全绿后 commit。
```

---

## 每个会话完成后要做的事

1. **确认 commit 成功**: `git log --oneline -3` 检查最新 commit
2. **更新 tasks.md**: 将完成的任务标记为 `[x]` 并附上 commit hash（Claude 通常会自动做）
3. **跑一次全量测试**: `npm test` 确保没有回归
4. **开下一个会话**: 复制下一个模块的 prompt，粘贴到新对话

## Foundation 完成后的验收

所有 F0-F8 完成后，跑完整验收:

```bash
npm test                        # 服务端全量测试
cd vibeflow-ios && npx jest     # iOS 测试
```

全绿后，进入 QA-F1 到 QA-F10 的人工验收（见 tasks.md「Foundation 人工验收」部分）。

## 最终合并

所有模块完成并验收通过后:

```bash
git checkout main
git merge feature/f2-llm-engine
```
