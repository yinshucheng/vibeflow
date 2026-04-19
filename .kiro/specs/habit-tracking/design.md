# Habit Tracking — Design

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Habit 独立实体 vs 重复 Task | 独立实体 | 生命周期、衡量方式、心理模型根本不同；Things 3/Todoist 证明重复任务是死胡同 |
| 频率模型 | 分数 freqNum/freqDen | Loop Habit Tracker 验证，最灵活（1/1=每天, 3/7=每周3次, 1/2=隔天） |
| Habit-Goal 关系 | 多对多（HabitGoal 中间表） | 与 ProjectGoal 模式一致；一个习惯可服务多个目标 |
| Habit-Project 关系 | 可选外键（一对多） | "每天写代码1h"可关联开发项目；大部分习惯无 Project |
| Score 存储 vs 计算 | 按需计算（不存储） | 单用户规模无性能问题，避免多客户端同步复杂度 |
| Streak 计算中 SKIP 处理 | SKIP = 主动跳过，不中断也不计入 | 参考 Loop："忘了打卡"≠SKIP，需用户显式操作。补打卡(R3.4)覆盖"昨天做了但忘记录"场景 |
| HabitEntry 粒度 | 每习惯每天一条 | Boolean/Timed 天然日粒度；Measurable 每天累加而非多条 |
| 番茄钟集成范围 | 仅 TIMED 类型 | BOOLEAN/MEASURABLE 与番茄钟无逻辑关系 |
| 番茄钟时间计算 | 使用实际时长而非计划 duration | COMPLETED 用 endTime-startTime，ABORTED 不计入习惯 |
| 日视图融合方式 | 习惯 section + 任务 section | 参考 Sunsama 共享日视图，但保持视觉区分 |
| "今天"定义 | 复用 getTodayDate()（04:00 AM 重置） | 与 DailyState 保持一致，凌晨 0-4 点算"昨天" |
| 提醒架构 | 服务端独立 cron + iOS 本地定时备份 | chatTriggersCronService 的 cron 未实现，需在 socket.ts startPeriodicTasks 中新建 60s interval |
| Streak 保护提醒 | 睡前 N 分钟紧急通知 | 高情感价值；sleepTimeEnabled=false 时 fallback 到 habitDailySummaryTime |
| 提醒去重 | 服务端检查 + iOS 收到推送后取消本地 | 避免 Web+iOS+Desktop 同时弹 3 条 |
| Streak 自然周定义 | ISO 周（周一起始） | 与大多数效率工具一致 |
| 暂停后恢复 streak | 暂停期间视为"不存在"，streak 接续 | UI 显示"暂停了 N 天后恢复"提示 |
| MEASURABLE 部分完成 | strict 模式：value >= targetValue 才算达标 | 与 Loop 一致；后续可加 lenient 模式 |
| 频率模型已知局限 | freqNum/freqDen 无法表达"仅工作日" | MVP 不处理，后续可扩展 freqDays?: number[] |
| entryType | Prisma Enum 而非 Int | 与项目中 GoalStatus/TaskStatus 等一致 |

## Data Model

### Prisma Schema 新增

```prisma
model Habit {
  id          String      @id @default(uuid())
  userId      String
  user        User        @relation(fields: [userId], references: [id])

  title       String
  description String?
  question    String?     // "今天做了吗？" — 用于通知和 AI 提示

  // 类型与目标
  type        HabitType   // BOOLEAN | MEASURABLE | TIMED
  targetValue Float?      // MEASURABLE: 目标数量, TIMED: 目标分钟数, BOOLEAN: null
  targetUnit  String?     // "杯", "页", "分钟" 等

  // 频率（分数模型）
  freqNum     Int         @default(1)  // 分子：周期内需完成次数
  freqDen     Int         @default(1)  // 分母：周期长度（天）

  // 关联
  projectId   String?
  project     Project?    @relation(fields: [projectId], references: [id])
  goals       HabitGoal[]

  // 显示
  icon        String?     // Lucide icon name
  color       String?     // hex color
  sortOrder   Int         @default(0)
  status      HabitStatus @default(ACTIVE) // ACTIVE | PAUSED | ARCHIVED

  // 提醒设置
  reminderEnabled  Boolean  @default(false)
  reminderTime     String?  // "HH:mm" 格式，如 "08:00"

  entries     HabitEntry[]

  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@index([userId, status])
  @@index([userId, projectId])
}

model HabitEntry {
  id         String          @id @default(uuid())
  habitId    String
  habit      Habit           @relation(fields: [habitId], references: [id], onDelete: Cascade)
  userId     String
  date       DateTime        @db.Date    // 使用 getTodayDate() 计算（04:00 AM 重置），客户端传 YYYY-MM-DD
  value      Float                       // BOOLEAN: 必须为 1, MEASURABLE: 实际数(>0), TIMED: 分钟数(>0)
  entryType  HabitEntryType  @default(YES_MANUAL)
  note       String?
  pomodoroIds String[]       @default([]) // TIMED 类型：累计贡献的番茄钟 ID 列表（可溯源）

  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@unique([habitId, date])
  @@index([habitId, date])
  @@index([userId, date])
}

model HabitGoal {
  id      String @id @default(uuid())
  habitId String
  goalId  String
  habit   Habit  @relation(fields: [habitId], references: [id], onDelete: Cascade)
  goal    Goal   @relation(fields: [goalId], references: [id], onDelete: Cascade)

  @@unique([habitId, goalId])
}

enum HabitType {
  BOOLEAN     // 打卡型：做了/没做
  MEASURABLE  // 计数型：喝了几杯水
  TIMED       // 时长型：冥想了多少分钟
}

enum HabitStatus {
  ACTIVE
  PAUSED
  ARCHIVED
}

enum HabitEntryType {
  NO           // 明确标记未完成
  UNKNOWN      // 未操作（历史空白天）
  YES_MANUAL   // 用户手动打卡
  YES_AUTO     // 番茄钟自动累计
  SKIP         // 主动跳过（不中断 streak）
}
```

### 现有模型改动

```prisma
// User model 添加
model User {
  // ... existing fields
  habits      Habit[]
  habitEntries HabitEntry[]
}

// Goal model 添加
model Goal {
  // ... existing fields
  habits HabitGoal[]
}

// Project model 添加
model Project {
  // ... existing fields
  habits Habit[]
}
```

### 域层级更新

```
Goal (1 week–5 years)
├── Project (task container) ─── via ProjectGoal (M:N)
│     ├── Tasks → Pomodoros
│     └── Habits (可选关联) ─── via projectId FK
└── Habit (持续行为) ─────────── via HabitGoal (M:N)
      └── HabitEntry (每日记录)
            └── Pomodoro? (时长型可关联)
```

## Architecture

### Service Layer

**`src/services/habit.service.ts`** — 习惯 CRUD + 业务逻辑

```typescript
// 核心方法
const habitService = {
  // CRUD
  create(userId, data): ServiceResult<Habit>
  update(userId, habitId, data): ServiceResult<Habit>
  updateStatus(userId, habitId, status): ServiceResult<Habit>
  delete(userId, habitId): ServiceResult<void>
  reorder(userId, habitIds): ServiceResult<void>

  // 查询
  getById(userId, habitId): ServiceResult<HabitWithStats>
  listByUser(userId, filter?): ServiceResult<Habit[]>
  getTodayHabits(userId): ServiceResult<TodayHabit[]>

  // 完成记录
  recordEntry(userId, habitId, date, value, note?): ServiceResult<HabitEntry>
  skipEntry(userId, habitId, date): ServiceResult<HabitEntry>
  deleteEntry(userId, habitId, date): ServiceResult<void>

  // 番茄钟集成
  recordPomodoroContribution(userId, pomodoroId, habitId, minutes): ServiceResult<HabitEntry>
}
```

**`src/services/habit-stats.service.ts`** — 统计计算（纯函数，无副作用）

```typescript
const habitStatsService = {
  // 按需计算，不存储
  calculateStreak(entries, frequency): { current: number, best: number }
  calculateScore(entries, frequency): number  // 0-100，指数衰减
  calculateCompletionRate(entries, frequency, days): number  // 近 N 天完成率
  isDueToday(habit): boolean  // 根据频率判断今天是否需要完成
  getCalendarData(entries, startDate, endDate): CalendarDay[]  // 热力图数据
}
```

### Score 算法（参考 Loop Habit Tracker）

```typescript
function calculateScore(entries: HabitEntry[], freq: { num: number, den: number }): number {
  // 指数衰减：半衰期 = freq.den * 24 天
  // 每天习惯(1/1): decay = 0.5^(1/24) ≈ 0.9715（约 24 天不做分数减半）
  // 每周习惯(3/7): decay = 0.5^(1/168) ≈ 0.9959（更宽容）
  const halfLifeDays = freq.den * 24
  const decay = Math.pow(0.5, 1.0 / halfLifeDays)

  let score = 0
  // period = freq.den 天（每天习惯=1天，每周习惯=7天）
  // 遍历范围：最近 365 天或 52 个 period（取较小值）
  const maxPeriods = Math.min(52, Math.ceil(365 / freq.den))
  for (const period of getRecentPeriods(maxPeriods, freq.den)) {
    const completed = countCompletionsInPeriod(entries, period)
    const target = freq.num
    const completionPct = Math.min(completed / target, 1.0)
    score = score * decay + (1 - decay) * completionPct
  }
  return Math.round(score * 100) // 0-100
}
```

### Streak 算法

```typescript
function calculateStreak(
  entries: HabitEntry[],
  freq: { num: number, den: number },
  habitStatus: HabitStatus,
  pausedRanges?: Array<{ start: Date, end?: Date }>  // 暂停期间
): { current: number, best: number } {
  // 将日期按频率周期分组
  // 每天习惯(1/1)：每天一个周期
  // 每周3次(3/7)：按 ISO 周（周一起始）分组，检查该周完成次数 >= freqNum
  // 隔天(1/2)：每 2 天一个周期
  //
  // SKIP 日不中断 streak，也不计入完成
  // 暂停期间视为"不存在"——暂停的天/周不计入周期，streak 从暂停前接续
  //
  // 从今天（getTodayDate()）往回扫描：
  // - 跳过暂停区间
  // - 每个周期检查是否达标（完成次数 >= freq.num，SKIP 不计入完成次数）
  // - 遇到第一个不达标的周期停止，得到 current streak
  // - 继续扫描找所有连续段，取最长为 best streak
}
```

### isDueToday 逻辑

```typescript
function isDueToday(habit: Habit, todayEntries: HabitEntry[]): boolean {
  // 暂停/归档的习惯 → false
  // 每天习惯(1/1) → true（除非今天已完成）
  // 隔天(1/2) → 根据 createdAt 起算的奇偶天判定
  // 每周N次(N/7) → 检查本周（ISO 周）已完成次数：
  //   如果已完成 >= freqNum 次 → false（本周已达标，不再显示）
  //   否则 → true
  // 注意：使用 getTodayDate() 确定"今天"
}
```

### tRPC Router

**`src/server/routers/habit.ts`** — 薄路由层

```typescript
const habitRouter = router({
  // CRUD
  create: protectedProcedure.input(CreateHabitSchema).mutation(...)
  update: protectedProcedure.input(UpdateHabitSchema).mutation(...)
  updateStatus: protectedProcedure.input(UpdateStatusSchema).mutation(...)
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(...)
  reorder: protectedProcedure.input(ReorderSchema).mutation(...)

  // 查询
  getById: protectedProcedure.input(z.object({ id: z.string() })).query(...)
  list: protectedProcedure.input(ListFilterSchema).query(...)
  getToday: protectedProcedure.query(...)

  // 完成记录
  recordEntry: protectedProcedure.input(RecordEntrySchema).mutation(...)
  skipEntry: protectedProcedure.input(SkipEntrySchema).mutation(...)
  deleteEntry: protectedProcedure.input(DeleteEntrySchema).mutation(...)

  // 统计
  getStats: protectedProcedure.input(GetStatsSchema).query(...)
  getCalendar: protectedProcedure.input(GetCalendarSchema).query(...)
})
```

### 番茄钟集成点

在 `pomodoro.service.ts` 的 `complete()` 方法末尾添加 hook（仅 COMPLETED 状态，ABORTED 不计入）：

```typescript
// pomodoro.service.ts → complete()
// 已有逻辑完成后...

// 检查是否有关联的时长型习惯需要自动记录
if (pomodoro.task?.projectId && pomodoro.endTime) {
  // 使用实际工作时长，非计划 duration
  const actualMinutes = Math.round((pomodoro.endTime.getTime() - pomodoro.startTime.getTime()) / 60000)
  const timedHabits = await habitService.getTimedHabitsByProject(userId, pomodoro.task.projectId)
  for (const habit of timedHabits) {
    await habitService.recordPomodoroContribution(userId, pomodoro.id, habit.id, actualMinutes)
  }
}
```

### Web UI 组件结构

```
src/app/
├── habits/                     # 习惯管理页面
│   ├── page.tsx               # 习惯列表（活跃/暂停/归档 tab）
│   └── [id]/
│       └── page.tsx           # 习惯详情（热力图 + 趋势图 + 统计）
├── components/
│   ├── habits/
│   │   ├── habit-list.tsx     # 习惯列表组件
│   │   ├── habit-card.tsx     # 习惯卡片（含 streak 徽章）
│   │   ├── habit-form.tsx     # 创建/编辑表单
│   │   ├── habit-entry.tsx    # 打卡/计数/时长 输入组件
│   │   ├── habit-calendar.tsx # 日历热力图
│   │   └── habit-stats.tsx    # 统计卡片
│   └── dashboard/
│       └── today-habits.tsx   # 日视图中的习惯 section
```

### iOS 组件（与 Web 对齐）

```
vibeflow-ios/src/
├── screens/
│   ├── HabitsScreen.tsx              # 习惯列表页（活跃/暂停/归档 tab）
│   ├── HabitDetailScreen.tsx         # 习惯详情（热力图 + 统计）
│   └── HabitFormScreen.tsx           # 创建/编辑习惯表单
├── components/habits/
│   ├── HabitRow.tsx                  # 习惯行（打卡按钮 + streak）
│   ├── TodayHabits.tsx              # Dashboard 中的今日习惯 section
│   ├── HabitCalendar.tsx            # 日历热力图
│   ├── HabitStatsCards.tsx          # 统计卡片（streak, score, 完成率）
│   ├── HabitEntryInput.tsx          # 打卡/计数/时长 输入组件
│   └── FrequencyPicker.tsx          # 频率选择器（每天/每周N次/自定义）
├── stores/
│   └── habit.store.ts               # Zustand store（完整 CRUD + 缓存）
```

## Notification & Reminder Architecture

### 提醒层级

| 层级 | 触发条件 | 何时实现 |
|------|---------|---------|
| L1: 固定时间提醒 | 习惯的 reminderTime 到达且当天未完成 | Phase 1 |
| L2: 每日未完成汇总 | habitDailySummaryTime（默认 20:00）且有未完成习惯 | Phase 2 |
| L3: Streak 保护 | 睡前 N 分钟，有 streak>=2 且当天未完成 | Phase 2 |
| L4: 番茄钟联动 | 番茄钟完成时，有同 Project 的未完成习惯 | Phase 4 |

### UserSettings 新增字段

```prisma
model UserSettings {
  // ... existing fields

  // 习惯提醒全局设置
  habitReminderEnabled       Boolean  @default(true)   // 全局开关
  habitStreakProtectEnabled   Boolean  @default(true)   // streak 保护提醒
  habitStreakProtectBefore    Int      @default(120)    // 睡前多少分钟提醒（默认 2 小时）
  habitDailySummaryEnabled   Boolean  @default(true)   // 每日未完成汇总
  habitDailySummaryTime      String   @default("20:00") // 汇总提醒时间 "HH:mm"
}
```

### 服务端提醒服务

> **重要**：`chatTriggersCronService.runCronTriggers()` 虽已定义但从未被调用（死代码）。
> 习惯提醒需要在 `socket.ts` 的 `startPeriodicTasks()` 中新建一个 60s interval。

**`src/services/habit-reminder.service.ts`** — 提醒调度

```typescript
const habitReminderService = {
  // 每分钟由 socket.ts startPeriodicTasks 中的新 interval 调用
  // 遍历所有在线用户的 userId
  async tick(connectedUserIds: string[]): Promise<void> {
    const currentTime = formatHHmm(new Date())  // 注意：使用服务端时间
    for (const userId of connectedUserIds) {
      await this.checkAndSendReminders(userId, currentTime)
      await this.checkDailySummary(userId, currentTime)
      await this.checkStreakProtect(userId, currentTime)
    }
  }

  async checkAndSendReminders(userId: string, currentTime: string): Promise<void> {
    // 1. 检查全局开关 habitReminderEnabled
    // 2. 查找 reminderEnabled=true 且 reminderTime=currentTime 的活跃习惯
    // 3. 过滤掉今天已完成（entryType 为 YES_MANUAL/YES_AUTO）的习惯
    // 4. 过滤掉 isDueToday=false 的习惯（含"每周N次本周已达标"的判定）
    // 5. 对剩余习惯发送提醒通知
    // 注意："今天"使用 getTodayDate()（04:00 AM 重置）
  }

  async checkDailySummary(userId: string, currentTime: string): Promise<void> {
    // 1. 检查 habitDailySummaryEnabled
    // 2. 检查 currentTime == habitDailySummaryTime
    // 3. 收集今日所有未完成的到期习惯
    // 4. 发送批量汇总通知："你今天还有 N 个习惯未完成：冥想、运动..."
  }

  async checkStreakProtect(userId: string, currentTime: string): Promise<void> {
    // 1. 检查 habitStreakProtectEnabled
    // 2. 计算触发时间：
    //    - sleepTimeEnabled=true → sleepTimeStart - habitStreakProtectBefore
    //    - sleepTimeEnabled=false → fallback 到 habitDailySummaryTime
    // 3. 查找 streak >= 2 且今天未完成的到期习惯
    // 4. 发送紧急提醒："你的「冥想」已连续 15 天，今天还没打卡！"
  }
}
```

### 通知分发路径

```
habitReminderService.checkAndSendReminders()
  │
  ├── Web（在线）: socketServer.sendExecuteCommand(userId, { action: 'HABIT_REMINDER', payload })
  │                → Web 端监听 → Browser Notification
  │
  ├── Desktop（在线）: socketServer.sendExecuteCommand(userId, { action: 'HABIT_REMINDER', payload })
  │                    → Desktop notificationManager.showReminder()（已有方法，未使用）
  │
  └── iOS（混合策略）:
      ├── 在线: WebSocket 推送即时通知
      └── 离线备份: 习惯创建/更新时预约 expo-notifications 本地定时通知
                     （scheduleNotificationAsync with trigger: { date }）
```

### iOS 本地定时通知策略

> **iOS 限制**：每个 App 最多 64 个 scheduled local notifications。
> 10 个习惯 × 7 天 = 70 个，超限！改为 3 天滚动窗口（10 × 3 = 30 个，安全）。

```typescript
// vibeflow-ios/src/services/habit-notification.service.ts
const habitNotificationService = {
  // 习惯创建/更新时调用，预约未来 3 天的本地提醒
  async scheduleReminders(habit: Habit): Promise<void> {
    // 1. 取消该习惯所有旧的 scheduled notifications
    // 2. 根据 freqNum/freqDen + reminderTime 计算未来 3 天的提醒时间
    // 3. 为每个时间点调用 scheduleNotificationAsync({ trigger: { date } })
    // 4. 用 AsyncStorage 存储 notification IDs（key: habit:<id>:notifications）

  // 打卡后取消当天的提醒（去重：防止 WebSocket 推送 + 本地通知双重触发）
  async cancelTodayReminder(habitId: string): Promise<void>

  // 收到 WebSocket HABIT_REMINDER 推送后，取消对应习惯的当天本地通知
  async onRemotePushReceived(habitId: string): Promise<void>

  // 每天刷新：取消过期的，补充新的（保持 3 天滚动窗口）
  // 也在 App 启动/登录成功时调用（恢复重装后丢失的通知）
  async refreshScheduledReminders(): Promise<void>
}
```

## Zod Schemas

```typescript
// src/services/habit.service.ts 内定义

const CreateHabitSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  question: z.string().max(200).optional(),
  type: z.enum(['BOOLEAN', 'MEASURABLE', 'TIMED']),
  targetValue: z.number().positive().optional(),
  targetUnit: z.string().max(20).optional(),
  freqNum: z.number().int().min(1).max(31).default(1),
  freqDen: z.number().int().min(1).max(31).default(1),
  icon: z.string().optional(),
  color: z.string().optional(),
  goalIds: z.array(z.string().uuid()).optional(),
  projectId: z.string().uuid().optional(),
})

const RecordEntrySchema = z.object({
  habitId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),  // YYYY-MM-DD
  value: z.number().min(0),
  note: z.string().max(200).optional(),
})
```

## Real-time Updates

习惯完成后通过 Socket.io 广播，确保多客户端同步：

```typescript
// habit.service.ts recordEntry() 末尾
socketBroadcastService.broadcastHabitUpdate(userId, { habitId, date, entry })
```

Socket 事件：
- `habit:entry_updated` — 习惯完成/修改/删除
- `habit:created` — 新建习惯
- `habit:updated` — 习惯信息修改
- `habit:deleted` — 习惯删除

## Migration Strategy

1. 新增 3 个 Prisma 模型 + 3 个 enum（HabitType, HabitStatus, HabitEntryType），不影响现有表
2. User / Goal / Project 模型仅添加关系字段，无破坏性变更
3. 无数据迁移需求（纯新增功能）
