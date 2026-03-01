# 国产 LLM 兼容性矩阵

> 更新日期: 2026-03-02
> 测试文件: `tests/integration/llm-providers.test.ts`

## 兼容性矩阵

| Provider | 测试模型 | 基本对话 | 流式输出 | Tool Use | 中文处理 | 备注 |
|----------|---------|---------|---------|----------|---------|------|
| **Qwen** (通义千问) | qwen-turbo | ✅ | ✅ | ✅ | ✅ | OpenAI 兼容 API，DashScope 端点 |
| **Kimi** (月之暗面) | kimi-8k | ✅ | ✅ | ⚠️ | ✅ | moonshot-v1 系列 tool use 支持有限 |
| **SiliconFlow** (硅基流动) | sf-qwen-32b | ✅ | ✅ | ⚠️ | ✅ | 聚合平台，tool use 取决于底层模型 |

### 图例

- ✅ 完全支持
- ⚠️ 部分支持（有已知限制）
- ❌ 不支持

## 各 Provider 详细模型列表

### Qwen (阿里云 DashScope)

| ModelId | 显示名 | 上下文窗口 | 最大输出 | 推荐场景 |
|---------|--------|-----------|---------|---------|
| `qwen-max` | Qwen Max | 32K | 8K | 复杂推理、长文分析 |
| `qwen-plus` | Qwen Plus | 128K | 8K | **默认 chat 模型**，平衡性能/成本 |
| `qwen-turbo` | Qwen Turbo | 128K | 8K | 快速操作、意图识别 |

**环境变量**: `QWEN_API_KEY`, `QWEN_BASE_URL` (默认 `https://dashscope.aliyuncs.com/compatible-mode/v1`)

### Kimi (月之暗面 Moonshot)

| ModelId | 显示名 | 上下文窗口 | 最大输出 | 推荐场景 |
|---------|--------|-----------|---------|---------|
| `kimi-k2` | Kimi K2 (Preview) | 128K | 8K | 最新模型，能力最强 |
| `kimi-128k` | Kimi 128K | 128K | 8K | 长文档处理 |
| `kimi-32k` | Kimi 32K | 32K | 8K | 通用对话 |
| `kimi-8k` | Kimi 8K | 8K | 4K | 轻量快速 |

**环境变量**: `KIMI_API_KEY`, `KIMI_BASE_URL` (默认 `https://api.moonshot.cn/v1`)

### SiliconFlow (硅基流动)

| ModelId | 显示名 | 上下文窗口 | 最大输出 | 推荐场景 |
|---------|--------|-----------|---------|---------|
| `sf-deepseek-v3` | DeepSeek V3 | 64K | 8K | 高质量生成 |
| `sf-deepseek-v3.2` | DeepSeek V3.2 | 64K | 8K | DeepSeek V3 别名 |
| `sf-deepseek-r1` | DeepSeek R1 | 64K | 8K | 推理增强 |
| `sf-qwen-72b` | Qwen 2.5 72B | 32K | 8K | 大参数通用 |
| `sf-qwen-32b` | Qwen 2.5 32B | 32K | 8K | 平衡性能/成本 |

**环境变量**: `SILICONFLOW_API_KEY`, `SILICONFLOW_BASE_URL` (默认 `https://api.siliconflow.cn/v1`)

## 已知限制与注意事项

### Tool Use 兼容性

1. **Qwen**: 通过 DashScope OpenAI 兼容模式完整支持 function calling / tool use。`qwen-plus` 和 `qwen-max` 效果最好，`qwen-turbo` 偶尔不遵循 tool schema。

2. **Kimi**: `kimi-k2` 对 tool use 支持较好。`moonshot-v1-*` 系列（kimi-128k/32k/8k）tool use 支持有限，可能无法可靠触发 tool call。`llm-adapter.service.ts` 已实现 fallback 机制：tool use 失败时自动降级到纯文本模式。

3. **SiliconFlow**: 作为聚合平台，tool use 取决于底层模型。DeepSeek V3 对 tool use 有一定支持，但不如 Qwen 稳定。Qwen 2.5 系列通过 SiliconFlow 调用时 tool use 行为与原生 DashScope 一致。

### 流式输出

- 所有三个 provider 均支持流式输出（SSE 格式）
- SiliconFlow 可能在高负载时出现 chunk 延迟较大的情况
- Kimi 流式输出稳定，但 `kimi-k2` 作为 preview 模型偶尔有中断

### 中文处理

- 所有模型均原生支持中文，不存在编码问题
- Qwen 和 Kimi 的中文理解能力强于 SiliconFlow 代理的 DeepSeek 系列
- 所有模型使用 UTF-8 编码，无乱码风险

### 生产环境推荐

| 场景 | 推荐模型 | 原因 |
|------|---------|------|
| 默认 Chat | `qwen-plus` | Tool Use 稳定，128K 上下文，成本适中 |
| 快速操作 | `qwen-turbo` | 响应快，成本低 |
| 用户可选备用 | `kimi-k2` | 能力强，但作为 preview 稳定性待观察 |
| 成本敏感 | `sf-qwen-32b` | SiliconFlow 聚合价格优势 |

## 运行集成测试

```bash
# 设置 API keys
export QWEN_API_KEY=your_key
export KIMI_API_KEY=your_key
export SILICONFLOW_API_KEY=your_key

# 运行测试
npx vitest run tests/integration/llm-providers.test.ts
```

无 API key 时测试自动跳过，不阻塞 CI。
