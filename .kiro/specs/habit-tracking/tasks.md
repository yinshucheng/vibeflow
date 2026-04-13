# Implementation Tasks

> 每个 Task 设计为可在独立 Claude Code session 中执行。
> 依赖关系通过 `依赖:` 标注，pipeline 按依赖顺序调度。
> 每个 Task 自带验证步骤，session 完成后立即可检查。

## Phase 1: 最小可用版本 — 打卡型习惯 + Web & iOS

> 目标：用户可以在 Web 和 iOS 上创建打卡型（BOOLEAN）习惯，每天打卡，看到 streak，收到提醒。
> 暂不实现：MEASURABLE/TIMED 类型、Goal/Project 关联、热力图、score 算法、番茄钟集成。

### Task 1.1: Prisma Schema + DB

> 依赖: 无
> 改动范围: `prisma/schema.prisma`
> 验证: `npm run db:generate && npx tsc --noEmit`

- [x] 添加 `HabitType` enum（BOOLEAN, MEASURABLE, TIMED）
- [x] 添加 `HabitStatus` enum（ACTIVE, PAUSED, ARCHIVED）
- [x] 添加 `Habit` model，字段参考 design.md Data Model 章节（含 reminderEnabled + reminderTime）
- [x] 添加 `HabitEntryType` enum（NO, UNKNOWN, YES_MANUAL, YES_AUTO, SKIP）
- [x] 添加 `HabitEntry` model（id, habitId, userId, date, value, entryType:HabitEntryType, note, pomodoroIds:String[], createdAt, updatedAt + unique[habitId,date] + index）
- [x] 添加 `HabitGoal` model（id, habitId, goalId + unique[habitId,goalId]）
- [x] 在 User model 添加 `habits Habit[]`
- [x] 在 Goal model 添加 `habits HabitGoal[]`
- [x] 在 Project model 添加 `habits Habit[]`
- [x] 在 UserSettings model 添加字段：`habitReminderEnabled Boolean @default(true)`, `habitStreakProtectEnabled Boolean @default(true)`, `habitStreakProtectBefore Int @default(120)`, `habitDailySummaryEnabled Boolean @default(true)`, `habitDailySummaryTime String @default("20:00")`
- [x] 运行 `npm run db:generate` 和 `npm run db:push` <!-- 1.1 done -->

### Task 1.2: HabitStatsService — 纯函数统计计算

> 依赖: Task 1.1
> 改动范围: `src/services/habit-stats.service.ts`（新建）, `src/services/habit-stats.service.test.ts`（新建）
> 验证: `npx vitest run src/services/habit-stats.service.test.ts && npx tsc --noEmit`

- [x] 创建 `src/services/habit-stats.service.ts`
- [x] 定义 TypeScript 类型：`HabitFrequency = { num: number, den: number }`, `StreakResult = { current: number, best: number }`, `CalendarDay = { date: string, value: number, entryType: HabitEntryType, completed: boolean }`
- [x] 实现 `isDueToday(habit, thisWeekEntries, today?): boolean`（使用 `getTodayDate()` 作为"今天"）
  - freqNum/freqDen=1/1 → 每天 due
  - freqNum/freqDen=1/2 → 隔天 due（从 createdAt 起算奇偶天）
  - freqNum/freqDen=3/7 → 检查本周（ISO 周，周一起始）已完成次数：已完成 >= freqNum → false（本周已达标），否则 true
- [x] 实现 `calculateStreak(entries, freq): StreakResult`
  - 每天习惯：从今天（getTodayDate()）往回扫描；SKIP 跳过不中断也不计入
  - 每周 N 次习惯：按 ISO 周（周一起始）分组，检查每周完成次数 >= freqNum
  - 返回 current（当前连续）和 best（历史最长）
- [x] 单元测试覆盖：
  - 每天习惯：连续 5 天 → current=5
  - 每天习惯：连续 3 天 + SKIP + 连续 2 天 → current=5（SKIP 不中断）
  - 每天习惯：连续 3 天 + 一天缺失 + 连续 2 天 → current=2, best=3
  - 每周 3 次习惯：本周完成 3 次 + 上周完成 4 次 → current=2 周
  - 空 entries → current=0, best=0
  - isDueToday 测试：每日/隔天/每周3次（含本周已完成3次→返回false） <!-- 1.2 done -->

### Task 1.3: HabitService — CRUD + 完成记录

> 依赖: Task 1.1, Task 1.2
> 改动范围: `src/services/habit.service.ts`（新建）, `src/services/habit.service.test.ts`（新建）, `src/services/index.ts`
> 验证: `npx vitest run src/services/habit.service.test.ts && npx tsc --noEmit`

- [x] 创建 `src/services/habit.service.ts`
- [x] 定义 Zod schemas（在文件内）：
  - `CreateHabitSchema`: title(string,1-100), type(enum,默认BOOLEAN), freqNum(int,1-31,默认1), freqDen(int,1-31,默认1), description?(string,0-500), question?(string,0-200), icon?(string), color?(string), reminderEnabled?(boolean), reminderTime?(string,HH:mm regex)
  - `UpdateHabitSchema`: 所有字段 optional
  - `RecordEntrySchema`: habitId(uuid), date(string,YYYY-MM-DD), value(number,>=0), note?(string,0-200)
- [x] 实现 CRUD 方法（所有方法返回 `ServiceResult<T>`，验证 userId 所有权）：
  - `create(userId, data)` — 创建习惯，返回含 id 的完整对象
  - `update(userId, habitId, data)` — 更新，验证所有权
  - `updateStatus(userId, habitId, status: HabitStatus)` — 变更状态
  - `delete(userId, habitId)` — 删除（级联删除 entries）
  - `listByUser(userId, filter?: { status?: HabitStatus })` — 列表
  - `getById(userId, habitId)` — 单个详情
- [x] 实现查询方法：
  - `getTodayHabits(userId)` — 查询所有 ACTIVE 习惯，调用 `habitStatsService.isDueToday` 过滤，附带今天的 HabitEntry 和 streak
- [x] 实现完成记录方法：
  - `recordEntry(userId, habitId, date, value, note?)` — upsert：若已存在则更新 value，entryType=YES_MANUAL
  - 按类型校验 value：BOOLEAN → 必须为 1；MEASURABLE → >0；TIMED → >0
  - date 参数由客户端传入 YYYY-MM-DD，服务端校验不超过 7 天前、不是未来日期（对比 getTodayDate()）
  - `skipEntry(userId, habitId, date)` — upsert entryType=SKIP
  - `deleteEntry(userId, habitId, date)` — 删除当天记录
- [x] 在 `src/services/index.ts` 导出 habitService
- [x] 单元测试：create → list → recordEntry → getTodayHabits → skipEntry → delete 完整 happy path <!-- 1.3 done -->

### Task 1.4: tRPC Router + 注册

> 依赖: Task 1.3
> 改动范围: `src/server/routers/habit.ts`（新建）, `src/server/routers/_app.ts`
> 验证: `npx tsc --noEmit && npm run lint`

- [x] 创建 `src/server/routers/habit.ts`，遵循项目 router pattern（薄路由，委托 service）
- [x] 实现 mutations（全部 protectedProcedure）：
  - `create`: input=CreateHabitSchema → habitService.create
  - `update`: input={id: string, ...UpdateHabitSchema} → habitService.update
  - `updateStatus`: input={id: string, status: HabitStatus} → habitService.updateStatus
  - `delete`: input={id: string} → habitService.delete
  - `recordEntry`: input=RecordEntrySchema → habitService.recordEntry
  - `skipEntry`: input={habitId: string, date: string} → habitService.skipEntry
  - `deleteEntry`: input={habitId: string, date: string} → habitService.deleteEntry
- [x] 实现 queries：
  - `list`: input={status?: HabitStatus} → habitService.listByUser
  - `getToday`: 无 input → habitService.getTodayHabits
- [x] 在 `_app.ts` 导入并注册 `habit: habitRouter`
- [x] 在 router 的 mutation 方法中，成功后调用 socketBroadcastService 广播（如果已实现；如未实现，留 TODO 注释标明文件路径和方法名） <!-- 1.4 done -->

### Task 1.5: Socket 广播 + EXECUTE 命令

> 依赖: Task 1.4
> 改动范围: `src/server/socket.ts`（ExecuteAction 类型 + 事件类型）, `src/server/routers/habit.ts`（替换 TODO 为广播调用）
> 验证: `npx tsc --noEmit`

- [x] 在 `src/server/socket.ts` 中的 `ExecuteAction` type union 添加 `'HABIT_REMINDER'`
- [x] 在 socket 事件类型中添加：`habit:entry_updated`, `habit:created`, `habit:updated`, `habit:deleted`
- [x] 添加 `broadcastHabitUpdate(userId, payload)` 广播方法（参考现有 broadcastStateChange 实现）
- [x] HABIT_REMINDER payload 类型：`{ habitId: string, title: string, question?: string, streak: number, reminderType: 'fixed_time' | 'streak_protect' | 'daily_summary' }`
- [x] 在 `src/server/routers/habit.ts` 中，将 TODO 广播注释替换为实际的 `broadcastHabitUpdate()` 调用 <!-- 1.5 done -->

### Task 1.6: 提醒服务（服务端 cron）

> 依赖: Task 1.3, Task 1.5
> 改动范围: `src/services/habit-reminder.service.ts`（新建）, `src/services/habit-reminder.service.test.ts`（新建）, `src/server/socket.ts`（在 startPeriodicTasks 中新增 60s interval）
> 验证: `npx vitest run src/services/habit-reminder.service.test.ts && npx tsc --noEmit`
> 重要: `chatTriggersCronService.runCronTriggers()` 是死代码（从未被调用），不可复用。需在 socket.ts 新建 interval。

- [x] 创建 `src/services/habit-reminder.service.ts`
- [x] 实现 `tick(connectedUserIds: string[]): Promise<void>` — 遍历在线用户，调用 checkAndSendReminders
- [x] 实现 `checkAndSendReminders(userId: string, currentTimeHHmm: string): Promise<void>`
  - 查询 UserSettings.habitReminderEnabled，为 false 则跳过
  - 查询所有 ACTIVE 且 reminderEnabled=true 且 reminderTime=currentTimeHHmm 的习惯
  - 调用 isDueToday 过滤（含"每周N次本周已达标"判定），使用 getTodayDate() 作为"今天"
  - 查询今天的 HabitEntry，排除已完成（entryType 为 YES_MANUAL 或 YES_AUTO）的习惯
  - 对剩余习惯，通过 sendExecuteCommand 发送 HABIT_REMINDER
- [x] 在 `src/server/socket.ts` 的 `startPeriodicTasks()` 方法中新增 `habitReminderInterval = setInterval(() => habitReminderService.tick(getConnectedUserIds()), 60_000)`
- [x] 在 `stopPeriodicTasks()` 中清除该 interval
- [x] 在 `src/services/index.ts` 导出
- [x] 单元测试：
  - 全局开关关闭 → 不发送
  - reminderTime 不匹配 → 不发送
  - 今天已完成 → 不发送
  - 暂停的习惯 → 不发送
  - 非到期日 → 不发送
  - 正常 case → 调用 sendExecuteCommand <!-- 1.6 done -->

### Task 1.7: Web UI — Dashboard 今日习惯 + 创建

> 依赖: Task 1.4
> 改动范围: `src/components/dashboard/today-habits.tsx`（新建）, `src/components/habits/habit-create-dialog.tsx`（新建）, Dashboard 页面（嵌入组件）
> 验证: `npm run build && npm run lint`
> 参考: 查看现有 Dashboard 页面结构和 UI 组件风格，保持一致

- [x] 创建 `src/components/dashboard/today-habits.tsx`
  - 调用 `trpc.habit.getToday.useQuery()` 获取今日习惯列表
  - 每个习惯显示：Lucide 图标（默认 circle-check）+ 标题 + streak 数字 + 打卡按钮
  - 打卡按钮：点击调用 `trpc.habit.recordEntry.useMutation()`，date=今天，value=1
  - 已完成的习惯显示已勾选状态，可点击取消（调用 deleteEntry）
  - 空状态：显示"创建你的第一个习惯"引导
- [x] 创建 `src/components/habits/habit-create-dialog.tsx`
  - 最简表单：标题输入 + 频率选择（每天/隔天/每周N次 下拉 → 转换为 freqNum/freqDen）+ 提醒时间（可选 time picker）
  - 类型固定 BOOLEAN（Phase 1 不暴露类型选择）
  - 调用 `trpc.habit.create.useMutation()`
- [x] 在 Dashboard 页面中嵌入 `<TodayHabits />`，位于任务列表上方
- [x] 监听 Socket 事件 `habit:entry_updated` 刷新列表 <!-- 1.7 done -->

### Task 1.8: Web UI — 习惯列表页 + 提醒通知

> 依赖: Task 1.7
> 改动范围: `src/app/habits/page.tsx`（新建）, 导航菜单
> 验证: `npm run build && npm run lint`

- [x] 创建 `src/app/habits/page.tsx` — 习惯管理列表页
  - 调用 `trpc.habit.list.useQuery()` 列出所有 ACTIVE 习惯
  - 每个习惯卡片：标题 + 类型 + 频率文本 + streak + 提醒时间
  - 支持编辑（弹出编辑 dialog，复用 create dialog 组件）
  - 支持删除（确认弹窗 → `trpc.habit.delete.useMutation()`）
  - 创建按钮复用 `habit-create-dialog.tsx`
- [x] 在侧边栏/导航菜单中添加"习惯"入口链接
- [x] 监听 EXECUTE 命令 `HABIT_REMINDER`，展示 Browser Notification（参考现有 pomodoro complete 通知的实现方式） <!-- 1.8 done -->

### Task 1.9: iOS — Store + API + 今日习惯

> 依赖: Task 1.4, Task 1.5
> 改动范围: `vibeflow-ios/src/stores/habit.store.ts`（新建）, `vibeflow-ios/src/components/habits/TodayHabits.tsx`（新建）, Dashboard 页面
> 验证: `cd vibeflow-ios && npx jest && npx tsc --noEmit`
> 参考: 查看 `vibeflow-ios/src/stores/app.store.ts` 的 pattern，保持 store 风格一致

- [x] 创建 `vibeflow-ios/src/stores/habit.store.ts` — Zustand store
  - state: `{ todayHabits: TodayHabit[], habits: Habit[], loading: boolean }`
  - actions: `fetchTodayHabits()`, `fetchHabits()`, `recordEntry(habitId, date, value)`, `deleteEntry(habitId, date)`, `createHabit(data)`, `updateHabit(id, data)`, `deleteHabit(id)`
  - 使用 tRPC client（参考现有 store 中 tRPC 调用方式）
- [x] 处理 Socket 事件 `habit:entry_updated`, `habit:created`, `habit:updated`, `habit:deleted`，刷新对应数据
- [x] 创建 `vibeflow-ios/src/components/habits/TodayHabits.tsx`
  - 调用 store 的 `todayHabits`
  - 每个习惯行：图标 + 标题 + streak 数字 + 打卡按钮（tap 完成/取消）
  - 空状态提示
- [x] 在 Dashboard 页面中嵌入 `<TodayHabits />` <!-- 1.9 done -->

### Task 1.10: iOS — 创建/列表/编辑 + 本地提醒

> 依赖: Task 1.9
> 改动范围: `vibeflow-ios/src/screens/HabitsScreen.tsx`（新建）, `vibeflow-ios/src/screens/HabitFormScreen.tsx`（新建）, `vibeflow-ios/src/services/habit-notification.service.ts`（新建）, 导航配置
> 验证: `cd vibeflow-ios && npx jest && npx tsc --noEmit`

- [x] 创建 `vibeflow-ios/src/screens/HabitsScreen.tsx` — 习惯列表页
  - 列出所有活跃习惯，卡片式布局
  - 左滑删除（确认弹窗）
  - 创建按钮（导航到 HabitFormScreen）
- [x] 创建 `vibeflow-ios/src/screens/HabitFormScreen.tsx` — 创建/编辑
  - 标题输入
  - 频率选择（每天/隔天/每周N次 picker → freqNum/freqDen）
  - 提醒时间（可选 TimePicker）
  - 类型固定 BOOLEAN（Phase 1）
  - 创建/更新 → store action
- [x] 在 Tab 导航或 Dashboard 添加入口跳转到 HabitsScreen
- [x] 创建 `vibeflow-ios/src/services/habit-notification.service.ts`
  - `scheduleReminders(habit)` — 预约未来 **3 天**（非 7 天）本地定时通知（iOS 上限 64 个 scheduled notifications）
  - `cancelTodayReminder(habitId)` — 打卡后取消当天提醒
  - `onRemotePushReceived(habitId)` — 收到 WebSocket 推送后取消对应本地通知（防重复）
  - `refreshScheduledReminders()` — 刷新 3 天滚动窗口；**App 启动和登录成功时必须调用**（恢复重装后丢失的通知）
  - 在习惯创建/更新/打卡时自动调用对应方法
- [x] 监听 WebSocket `HABIT_REMINDER` EXECUTE 命令 → 展示即时通知 + 调用 `onRemotePushReceived` <!-- 1.10 done -->

### Task 1.11: Phase 1 集成测试

> 依赖: Task 1.6, Task 1.8, Task 1.10
> 改动范围: `src/services/habit.service.test.ts`（补充）, `src/services/habit-reminder.service.test.ts`（补充）
> 验证: `npm test`

- [x] 补充 HabitService 集成测试：create → recordEntry → getTodayHabits 返回已完成状态 → deleteEntry → getTodayHabits 返回未完成
- [x] 补充 tRPC router 集成测试：通过 tRPC caller 调用 create/list/getToday/recordEntry
- [x] 确保 `npm test` 全部通过
- [x] 确保 `npm run build` 无 TypeScript 错误
- [x] 确保 `npm run lint` clean <!-- 1.11 done -->

---

## Phase 2: 丰富类型 + 智能提醒

> 解锁计数型和时长型习惯 + 每日汇总提醒和 streak 保护提醒。

### Task 2.1: Service — MEASURABLE/TIMED 类型支持

> 依赖: Phase 1 完成
> 改动范围: `src/services/habit.service.ts`, `src/services/habit-stats.service.ts`, 测试文件
> 验证: `npx vitest run src/services/habit.service.test.ts && npx vitest run src/services/habit-stats.service.test.ts`

- [ ] `CreateHabitSchema` 添加 `targetValue`（number, >0, MEASURABLE/TIMED 必填）和 `targetUnit`（string, <=20, MEASURABLE 必填，TIMED 默认"分钟"）
- [ ] `recordEntry` 适配：MEASURABLE 允许 value > 1，TIMED 允许分钟数
- [ ] `getTodayHabits` 返回数据中增加 `targetValue`, `targetUnit`, `progress`（value / targetValue 百分比）
- [ ] `calculateStreak` 适配：MEASURABLE/TIMED 的达标判定为 value >= targetValue
- [ ] 单元测试：计数型（目标 8 杯，完成 6 杯 → 未达标，完成 8 杯 → 达标）
- [ ] 单元测试：时长型（目标 30 分钟，完成 20 分钟 → 未达标）

### Task 2.2: Web UI — 类型选择 + 进度条

> 依赖: Task 2.1
> 改动范围: `src/components/habits/habit-create-dialog.tsx`, `src/components/dashboard/today-habits.tsx`
> 验证: `npm run build && npm run lint`

- [ ] 创建 dialog 增加类型选择（BOOLEAN/MEASURABLE/TIMED 三选一）
  - BOOLEAN：无额外字段
  - MEASURABLE：显示目标值 + 单位输入（如"8 杯"）
  - TIMED：显示目标分钟数输入
- [ ] today-habits 中的打卡交互根据类型变化：
  - BOOLEAN：单击切换
  - MEASURABLE：点击弹出数量输入弹窗（number input + 确认），显示进度条（value/target）
  - TIMED：点击弹出时长输入弹窗（分钟 input + 确认），显示进度条

### Task 2.3: iOS — 类型选择 + 进度环

> 依赖: Task 2.1
> 改动范围: `vibeflow-ios/src/screens/HabitFormScreen.tsx`, `vibeflow-ios/src/components/habits/TodayHabits.tsx`
> 验证: `cd vibeflow-ios && npx tsc --noEmit`

- [ ] HabitFormScreen 增加类型选择 segment control + 动态目标值/单位输入
- [ ] TodayHabits 中的打卡交互根据类型变化：
  - BOOLEAN：tap 完成/取消
  - MEASURABLE：tap 弹出 Alert 输入数量，显示进度环
  - TIMED：tap 弹出 Alert 输入分钟数，显示进度环

### Task 2.4: 每日汇总 + Streak 保护提醒

> 依赖: Task 2.1
> 改动范围: `src/services/habit-reminder.service.ts`, `src/services/habit-reminder.service.test.ts`
> 验证: `npx vitest run src/services/habit-reminder.service.test.ts && npx tsc --noEmit`

- [ ] 实现 `checkDailySummary(userId, currentTimeHHmm)`
  - 检查 habitDailySummaryEnabled + currentTime == habitDailySummaryTime
  - 收集所有今日到期且未完成的活跃习惯
  - 发送汇总通知："你今天还有 N 个习惯未完成：冥想、运动..."（通过 EXECUTE 命令）
- [ ] 实现 `checkStreakProtect(userId, currentTimeHHmm)`
  - 检查 habitStreakProtectEnabled
  - 触发时间：sleepTimeEnabled=true → sleepTimeStart - habitStreakProtectBefore；sleepTimeEnabled=false → fallback 到 habitDailySummaryTime
  - 如果 currentTime 匹配，查找 streak >= 2 且今天未完成的到期习惯
  - 发送紧急提醒："你的「冥想」已连续 15 天，今天还没打卡！"
- [ ] 在 habitReminderService.tick() 中添加 checkDailySummary 和 checkStreakProtect 调用（复用 Task 1.6 创建的 60s interval）
- [ ] iOS `habit-notification.service.ts` 中添加每日汇总和 streak 保护的本地定时通知预约
- [ ] 单元测试：汇总——无未完成 → 不发送；有未完成 → 发送包含习惯名
- [ ] 单元测试：streak 保护——streak=1 → 不提醒；streak=5 + 未完成 → 提醒；已完成 → 不提醒

### Task 2.5: 提醒设置 UI（Web + iOS）

> 依赖: Task 2.4
> 改动范围: `src/components/settings/`（Web 设置页）, `vibeflow-ios/src/screens/SettingsScreen.tsx`
> 验证: `npm run build && cd vibeflow-ios && npx tsc --noEmit`

- [ ] Web 设置页面添加"习惯提醒"section：
  - 习惯提醒全局开关（habitReminderEnabled）
  - 每日汇总开关 + 汇总时间 picker（habitDailySummaryEnabled + habitDailySummaryTime）
  - Streak 保护开关 + 提前量 slider（habitStreakProtectEnabled + habitStreakProtectBefore）
- [ ] iOS SettingsScreen 添加相同的习惯提醒设置项
- [ ] 设置变更通过 tRPC settings.update mutation 保存

---

## Phase 3: 统计与详情页

> 习惯详情页：热力图、score、完成率趋势。

### Task 3.1: HabitStatsService — Score + 完成率 + 热力图

> 依赖: Phase 2 完成
> 改动范围: `src/services/habit-stats.service.ts`, `src/services/habit-stats.service.test.ts`
> 验证: `npx vitest run src/services/habit-stats.service.test.ts`

- [ ] 实现 `calculateScore(entries, freq)` — 指数衰减算法，参考 design.md Score 算法章节，返回 0-100
- [ ] 实现 `calculateCompletionRate(entries, freq, days)` — 近 7/30/90 天完成百分比
- [ ] 实现 `getCalendarData(entries, startDate, endDate)` — 返回 CalendarDay[] 供热力图渲染
- [ ] 单元测试：score 从 0 逐步增长、长期不做衰减到低分
- [ ] 单元测试：completionRate 准确性
- [ ] 单元测试：getCalendarData 覆盖空天和有记录天

### Task 3.2: tRPC — 详情 + 统计 Endpoints

> 依赖: Task 3.1
> 改动范围: `src/server/routers/habit.ts`, `src/services/habit.service.ts`
> 验证: `npx tsc --noEmit`

- [ ] habitService 添加 `getByIdWithStats(userId, habitId)` — 返回习惯详情 + streak + score + completionRate(7d/30d/90d)
- [ ] habitService 添加 `getCalendar(userId, habitId, startDate, endDate)` — 返回热力图数据
- [ ] habit router 添加 `getById` query（input: { id: string } → getByIdWithStats）
- [ ] habit router 添加 `getCalendar` query（input: { habitId, startDate, endDate }）

### Task 3.3: Web 习惯详情页

> 依赖: Task 3.2
> 改动范围: `src/app/habits/[id]/page.tsx`（新建）, `src/components/habits/habit-calendar.tsx`（新建）, `src/components/habits/habit-stats.tsx`（新建）
> 验证: `npm run build && npm run lint`

- [ ] 创建 `src/app/habits/[id]/page.tsx` — 习惯详情页
- [ ] 创建 `habit-calendar.tsx` — 日历热力图组件（类 GitHub 贡献图，过去 90 天/12 周）
  - 颜色深浅表示完成度（BOOLEAN: 完成/未完成，MEASURABLE/TIMED: 百分比）
- [ ] 创建 `habit-stats.tsx` — 统计卡片：当前 streak、最长 streak、score 环形图、7d/30d 完成率
- [ ] 页面包含：编辑按钮、暂停/归档/删除操作
- [ ] 从习惯列表页和 Dashboard 可点击进入详情页

### Task 3.4: iOS 习惯详情页

> 依赖: Task 3.2
> 改动范围: `vibeflow-ios/src/screens/HabitDetailScreen.tsx`（新建）, `vibeflow-ios/src/components/habits/HabitCalendar.tsx`（新建）, `vibeflow-ios/src/components/habits/HabitStatsCards.tsx`（新建）
> 验证: `cd vibeflow-ios && npx tsc --noEmit`

- [ ] 创建 `HabitDetailScreen.tsx` — 从列表页/Dashboard 导航进入
- [ ] 创建 `HabitCalendar.tsx` — 日历热力图（RN 实现，过去 90 天）
- [ ] 创建 `HabitStatsCards.tsx` — 统计卡片
- [ ] 编辑（导航到 HabitFormScreen）、暂停/归档/删除操作

---

## Phase 4: 关联与集成

> Goal/Project 关联、番茄钟自动记录、SKIP、补打卡。

### Task 4.1: Goal/Project 关联（服务端 + Web + iOS）

> 依赖: Phase 3 完成
> 改动范围: `src/services/habit.service.ts`, habit router, Web + iOS 表单
> 验证: `npm test && npm run build`

- [ ] habitService.create 支持 `goalIds?: string[]` 参数 → 批量创建 HabitGoal 记录
- [ ] habitService.update 支持 `goalIds` → 全量替换 HabitGoal（删除旧的，创建新的）
- [ ] habitService.create/update 支持 `projectId` → 直接设置外键
- [ ] Web 创建/编辑 dialog 增加 Goal 多选下拉 + Project 单选下拉
- [ ] iOS HabitFormScreen 增加 Goal 多选 + Project 单选
- [ ] 单元测试：关联创建/更新/查询

### Task 4.2: 番茄钟集成（TIMED 类型自动记录）

> 依赖: Task 4.1
> 改动范围: `src/services/habit.service.ts`, `src/services/pomodoro.service.ts`
> 验证: `npm test`

- [ ] habitService 添加 `getTimedHabitsByProject(userId, projectId)` — 查询关联到该 project 的 TIMED 类型活跃习惯
- [ ] habitService 添加 `recordPomodoroContribution(userId, pomodoroId, habitId, actualMinutes)` — upsert HabitEntry，entryType=YES_AUTO，value 累加，pomodoroIds 追加
- [ ] 在 `pomodoro.service.ts` 的 `complete()` 方法末尾添加 hook（仅 COMPLETED 状态，ABORTED 不计入）
  - 使用 `Math.round((endTime - startTime) / 60000)` 计算实际工作时长，而非计划 `duration`
  - 如果 task 有 projectId，查询关联的 TIMED 习惯并自动记录
- [ ] 单元测试：番茄钟 25 分钟 COMPLETED → 习惯 value 累加实际时长
- [ ] 单元测试：手动记录 10 分钟 + 番茄钟完成 → value 累加
- [ ] 单元测试：ABORTED 番茄钟 → 不计入习惯

### Task 4.3: SKIP UI + 补打卡 UI

> 依赖: Phase 1 完成（skipEntry API 已在 Phase 1 Task 1.3/1.4 实现）
> 改动范围: Web + iOS UI 组件
> 验证: `npm run build && cd vibeflow-ios && npx tsc --noEmit`

- [ ] Web today-habits: 右键菜单或更多按钮 → SKIP 操作
- [ ] Web today-habits: 补打卡 — 点击日期选择器选择过去 7 天的日期 → recordEntry
- [ ] iOS TodayHabits: 左滑 SKIP；补打卡通过日历选择
- [ ] streak 计算验证：SKIP 日不中断（已在 Task 1.2 实现，此处验证端到端）

---

## Phase 5: 打磨

> 排序、图标颜色选择、拖拽、归档管理。

### Task 5.1: 排序与拖拽（Web + iOS）

> 依赖: Phase 1 完成
> 改动范围: `src/services/habit.service.ts`, habit router, Web + iOS 列表页
> 验证: `npm run build && cd vibeflow-ios && npx tsc --noEmit`

- [ ] habitService 添加 `reorder(userId, habitIds: string[])` — 按数组顺序更新 sortOrder
- [ ] habit router 添加 `reorder` mutation
- [ ] Web 习惯列表页支持拖拽排序（使用现有拖拽库）
- [ ] iOS 习惯列表页支持长按拖拽排序

### Task 5.2: 图标/颜色 + 归档管理（Web + iOS）

> 依赖: Phase 1 完成
> 改动范围: Web + iOS 表单和列表页
> 验证: `npm run build && cd vibeflow-ios && npx tsc --noEmit`

- [ ] Web + iOS 创建/编辑表单增加图标选择器（Lucide icons 子集，20-30 个常用图标）
- [ ] Web + iOS 创建/编辑表单增加颜色选择器（8-12 个预设色）
- [ ] Web + iOS 习惯列表页增加活跃/暂停/归档 tab 切换

### Task 5.3: E2E 测试

> 依赖: Phase 3 完成
> 改动范围: `e2e/tests/habit.spec.ts`（新建）
> 验证: `npm run e2e`

- [ ] Web E2E：创建打卡型习惯 → 打卡 → 查看 streak 变化 → 进入详情页看热力图
- [ ] Web E2E：创建计数型习惯 → 输入数量 → 验证进度条
- [ ] Web E2E：Dashboard 日视图中习惯显示与操作
