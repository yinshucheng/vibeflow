# Habit Tracking — Requirements

## Overview

为 VibeFlow 增加习惯追踪模块，帮助用户建立和维持持续行为。习惯与任务是达成目标的两种不同手段——任务是一次性的，习惯是持续的。系统需要追踪习惯的完成记录、连续性（streak）、一致性得分，并与现有的番茄钟系统自然集成。

### 调研依据

基于对 8 款主流产品的调研（Habitica、TickTick、Streaks、Todoist、Things 3、Sunsama、Notion、Loop Habit Tracker），核心设计决策：
- **Habit 是独立实体**（非重复 Task）：Things 3/Todoist 用重复任务模拟习惯被证明是死胡同，缺少 streak、趋势图等习惯特有的统计维度
- **频率用分数模型**（Loop 验证）：`freqNum/freqDen` 可优雅表达各种频率
- **与 Task 平行挂在 Goal 下**：参考 Habitica 三分法 + Sunsama 融合日视图
- **时长型习惯与番茄钟打通**：VibeFlow 独有的差异化优势

## Requirements

### R1: 习惯数据模型

- R1.1: Habit 是独立实体，不是 Task 的子类或变体
- R1.2: Habit 支持三种类型：打卡型（BOOLEAN）、计数型（MEASURABLE）、时长型（TIMED）
- R1.3: Habit 频率使用分数模型：`freqNum/freqDen`（如每天=1/1，每周3次=3/7，隔天=1/2）
- R1.4: Habit 可选关联到 Goal（多对多，通过 HabitGoal 中间表）
- R1.5: Habit 可选关联到 Project（直接外键，一对多）
- R1.6: HabitEntry 记录每次完成，每个习惯每天最多一条记录
- R1.7: HabitEntry 使用 Prisma Enum `HabitEntryType` 区分五种状态：NO、UNKNOWN、YES_MANUAL、YES_AUTO、SKIP
- R1.8: SKIP（主动跳过，需用户显式操作）不破坏 streak；"忘了打卡"自然是 NO/UNKNOWN 会中断 streak，补打卡(R3.4)覆盖"昨天做了但忘记录"
- R1.9: 所有日期计算使用 `getTodayDate()`（04:00 AM 重置），与 DailyState 保持一致

### R2: 习惯 CRUD 操作

- R2.1: 创建习惯：标题、类型、目标值、频率为必填；描述、图标、颜色、关联 Goal/Project 为可选
- R2.2: 编辑习惯：支持修改所有字段，修改频率不影响历史记录
- R2.3: 暂停习惯：暂停期间不出现在日视图，不影响 streak 计算
- R2.4: 归档习惯：保留所有历史数据，不再出现在活跃列表
- R2.5: 删除习惯：级联删除所有 HabitEntry 记录
- R2.6: 排序：支持自定义排序（sortOrder），拖拽调整

### R3: 习惯完成记录

- R3.1: 打卡型：点击即完成（value=1）
- R3.2: 计数型：输入实际数量（如"喝了6杯水"），达到目标值标记为完成
- R3.3: 时长型：输入实际时长（分钟），或由番茄钟自动累计
- R3.4: 补打卡：允许补录过去 7 天内的记录
- R3.5: 修改记录：允许修改当天和过去 7 天内的记录值
- R3.6: 撤销完成：允许将当天记录改为未完成

### R4: 番茄钟集成（仅时长型习惯）

- R4.1: 时长型习惯可关联到番茄钟——当用户完成一个番茄钟，如果当前任务所属的 Project 关联了某个时长型习惯，自动累计时间到当天的 HabitEntry
- R4.2: 自动记录的 HabitEntry 标记为 YES_AUTO，pomodoroId 记录来源
- R4.3: 用户也可以手动为时长型习惯记录时间（不走番茄钟）
- R4.4: 番茄钟自动累计不覆盖手动记录，而是累加

### R5: Streak 与统计

- R5.1: 当前 streak：连续完成的天数/周期数
- R5.2: 最长 streak：历史最长连续完成记录
- R5.3: 一致性得分：使用指数衰减算法（参考 Loop），产出 0-100% 分数
- R5.4: 完成率：近 7 天 / 30 天 / 90 天的完成百分比
- R5.5: 统计数据按需计算（不存储），单用户场景性能足够
- R5.6: SKIP 日不计入 streak 中断，也不计入完成

### R6: 日视图集成

- R6.1: 今日习惯根据频率规则出现在日视图中（Dashboard）；"每周N次"类型在本周已达标后不再显示
- R6.2: 习惯与任务在同一视图但视觉上有明确区分（不同图标/样式）
- R6.3: 习惯显示：标题 + 当前 streak + 今日完成状态 + 进度（计数/时长型）
- R6.4: 习惯排列在任务列表的上方或下方（用户可配置位置）

### R7: 习惯管理视图

- R7.1: 独立的习惯管理页面，列出所有活跃/暂停/归档的习惯
- R7.2: 每个习惯的详情页：streak 日历热力图、完成率趋势图、统计卡片
- R7.3: 习惯创建/编辑表单：支持类型选择、频率设置、目标值设置、Goal/Project 关联

### R8: 通知提醒机制

- R8.1: 每个习惯可设置提醒时间（`reminderTime`，"HH:mm" 格式），到时提醒用户打卡
- R8.2: 提醒通知内容包含习惯标题和 question 字段（如"今天冥想了吗？"）
- R8.3: 暂停/归档的习惯不触发提醒
- R8.4: 当天已完成的习惯不再触发提醒
- R8.5: 用户可全局开关习惯提醒（UserSettings.habitReminderEnabled）
- R8.6: 每日未完成汇总提醒：在可配置时间（默认 20:00）提醒用户今天还有哪些习惯未完成
- R8.7: Streak 保护提醒：睡前 N 分钟（可配置，默认 2 小时），对有 streak 且当天未完成的习惯发出紧急提醒
- R8.8: Streak 保护提醒仅在 streak >= 2 时触发（刚创建的习惯不需要保护）
- R8.9: 提醒通道——Web: Browser Notification；iOS: expo-notifications 本地定时通知；Desktop: Electron Notification（通过 EXECUTE 命令）

### R9: 跨客户端支持

- R9.1: Web 客户端：完整 CRUD + 日视图 + 统计页面
- R9.2: iOS 客户端：与 Web 对齐——完整 CRUD + 日视图 + 统计页面
- R9.3: Desktop 客户端：接收习惯提醒通知，不需要习惯管理 UI（通过 Web 操作）
- R9.4: Browser Extension：不需要习惯 UI
- R9.5: API 设计保持 service 层清晰，后续所有接口以 Skill 方式暴露给 Agent（本 spec 不含 Skill 实现）

## Acceptance Criteria

1. 用户可以创建三种类型的习惯并设置频率
2. 习惯按频率规则出现在每日视图中
3. 打卡型习惯一键完成，计数型可输入数量，时长型可手动输入或由番茄钟自动累计
4. Streak 正确计算，SKIP 不中断 streak
5. 习惯详情页展示日历热力图和完成率
6. 习惯可关联 Goal 和 Project
7. iOS 客户端功能与 Web 对齐：完整 CRUD、日视图、统计
8. 习惯定时提醒在 Web/iOS/Desktop 正常触发
9. 睡前 streak 保护提醒防止用户忘记打卡
