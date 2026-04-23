# Work Rhythm Analytics — Requirements

## 核心理念

**该工作的时候好好工作，该休息的时候好好休息。**

不做硬性规则判断，不算评分。把工作节奏的事实数据组织好，喂给 LLM，让它结合上下文自然地给出建议（"今天效率不错，准时下班吧" / "下午有点散，要不要来个番茄钟？" / "连续三天加班了，今晚早点休息"）。

## App 内 AI Chat 的定位

VibeFlow 的 AI Chat 不是通用助手，是**目标管理领域的专属教练**。它的独特价值：

1. **持续状态感知** — 一直在，知道你 20 分钟没动了、刚放弃了第三个番茄钟、连续三天加班
2. **设备级干预能力** — 不只是"建议"，能动手：锁屏幕、屏蔽 app、弹通知、调整工作模式
3. **垂直领域深度** — 只管"目标 → 执行 → 复盘"，不做通用个人助手

App 通过 MCP Skill 暴露全部数据、操作乃至设备原生能力给外部 Agent。外部 Agent 可以完全通过 Skill 使用 App 的一切功能，无需经过 App 内 Chat。**核心是帮助到用户，无论从哪个入口使用。**

App 的不可替代性不在 AI Chat，在于它是一个**带 UI 的设备级 Agent Runtime**：
- **必须装** — 设备原生能力（Screen Time、窗口管理、锁屏、app 屏蔽）需要常驻进程和原生权限，不管谁来调都需要 App 在跑
- **Chat 是可选便捷入口** — 手机上没终端，App Chat 最方便；电脑上用 Claude Code 调 Skill 也完全 OK
- **专属 UI 是差异化体验** — 番茄钟倒计时、仪表盘、任务看板，这些可视化交互纯 chat 做不好

终局展望：通用个人助手（系统级 AI）会融合这类垂直能力，App 作为 Skill 提供者被集成是自然演化方向。保持开放心态，把 Skill 接口做好。

## 设计原则

1. **数据层只做事实整理，不做价值判断** — 不定义"摸鱼"阈值，不算健康评分，不生成固定话术
2. **LLM 做所有决策** — 什么时候该提醒、该说什么、语气如何，全部交给 LLM
3. **硬性规则尽可能少** — app 的机械规则（如 OVER_REST 计时器）是必要之恶，能用 LLM 柔性替代的就不要硬编码
4. **完全复用已有数据** — 不新增数据库模型或采集机制

## 已有数据基础

| 数据源 | 位置 | 提供什么 |
|--------|------|----------|
| UserSettings.workTimeSlots | schema.prisma | 预期工作时间窗口 |
| UserSettings.expectedWorkMinutes | schema.prisma | 每日预期工作分钟数 |
| UserSettings.weekdayExpectations | schema.prisma | 按星期的差异化目标 |
| UserSettings.sleepTimeStart/End | schema.prisma | 睡眠时间边界 |
| UserSettings.healthLimit2Hours/Daily | schema.prisma | 健康上限配置 |
| WorkStartRecord | work-start.service.ts | 实际开工 vs 配置开工时间、延迟分钟数 |
| Pomodoro (startTime/endTime/status) | pomodoro.service.ts | 每个番茄钟的精确时间和结果 |
| FocusSession (overridesWorkHours) | focus-session.service.ts | 加班 session 标记 |
| DailyReview | review.service.ts | 预期 vs 实际的每日汇总 |
| StateTransitionLog | schema.prisma | 状态机转换记录（含 OVER_REST 进出） |
| TimelineEvent | schema.prisma | 完整时间轴事件流 |
| TimeContext | progress-calculation.service.ts | 实时时间上下文分类 |
| EfficiencyAnalysis | efficiency-analysis.service.ts | 时段效率、小时热力图、星期统计 |

## Requirements

### R1: 工作节奏快照（Today Context）

为 LLM 提供"今天到目前为止"的工作节奏事实，用于实时对话和主动建议。

- **R1.1**: 组装当日快照数据，包含：
  - 当前 TimeContext（work_time / adhoc_focus / free_time / sleep_time）
  - 配置的工作时间窗口 + 已过去多少、还剩多少
  - 今日已完成番茄钟数 / 目标数 / 完成率
  - 今日实际工作分钟数（番茄钟 duration 之和）
  - 开工时间 vs 配置时间（延迟了多久，或还没开工）
  - 加班情况：off-hours 的番茄钟/FocusSession 分钟数
  - 当前连续工作时长（距上次休息过了多久）
  - 最近一次番茄钟的结束时间（判断是否在摸鱼/长时间空闲）
  - 健康上限接近度（2 小时窗口已用/上限，全天已用/上限）
- **R1.2**: 数据全部为事实性字段（数字、时间戳、枚举），不包含评价或建议
- **R1.3**: 响应时间 < 100ms（纯内存计算 + 少量 DB 查询）

#### 验收标准
- 返回一个扁平的结构体，所有字段含义自解释
- LLM 能仅凭这个快照理解用户当前的工作状态并给出合理建议
- 不含任何 "score"、"level"、"warning" 等判断性字段

### R2: 历史节奏摘要（Period Summary）

为 LLM 提供一段时间的工作节奏事实汇总，用于回顾分析和趋势判断。

- **R2.1**: 支持查询任意日期范围（单日 / 本周 / 本月 / 自定义）
- **R2.2**: 汇总数据包含：
  - 每日：工作分钟数、番茄钟数（完成/中断/放弃）、加班分钟数、开工延迟
  - 聚合：总工作分钟、日均工作分钟、总加班分钟、平均开工延迟
  - 时段分布：上午/下午/晚上各完成了多少番茄钟（复用 EfficiencyAnalysis）
  - 按星期分布：每周几的平均产出（复用 EfficiencyAnalysis.dayOfWeekStats）
- **R2.3**: 包含 sleepTime 内的工作记录（如果有）— 事实，不标记 warning
- **R2.4**: 包含连续加班天数（连续 N 天有 off-hours 工作）— 事实，不判断好坏

#### 验收标准
- 查询 7 天数据响应 < 300ms
- 查询 30 天数据响应 < 500ms
- LLM 能仅凭此摘要判断出趋势（"这周比上周效率高了" / "最近连续加班"）

### R3: Service 层接口

提供统一的 service 函数，供 tRPC / MCP / Socket 各 transport 调用。

- **R3.1**: `getWorkRhythmSnapshot(userId): WorkRhythmSnapshot` — R1 的实时快照
- **R3.2**: `getWorkRhythmSummary(userId, startDate, endDate): WorkRhythmSummary` — R2 的历史汇总
- **R3.3**: 两个函数内部尽量复用已有 service（progressCalculationService、reviewService、workStartService、efficiencyAnalysisService、focusSessionService），作为数据聚合层而非重新计算
- **R3.4**: 返回类型为纯数据 TS interface，无 class、无方法，方便序列化传输

#### 验收标准
- 新增一个 `work-rhythm.service.ts`，不超过 300 行
- 不重复已有 service 的计算逻辑，只做聚合和组装
- 单元测试覆盖核心聚合逻辑

## 不在范围内

- **LLM 提示词 / 建议生成逻辑** — 由 AI 层（MCP tools / chat）消费数据后自行决定
- **通知 / 干预机制** — 后续 spec，LLM 决定何时推送什么
- **评分 / 阈值 / 规则** — 不做。LLM 不需要我们替它打分
- **新增数据采集** — 完全复用已有数据源
- **UI 展示** — 数据怎么可视化是 UI spec 的事
- **阈值自定义** — 没有阈值，就不需要自定义
