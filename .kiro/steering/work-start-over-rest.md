# 工作时间开始未开番茄 → OVER_REST

## 问题

用户到了工作时间但一直 idle，始终不进 OVER_REST。

**根因**：OVER_REST 的 XState guard（`canEnterOverRest`）要求 `lastPomodoroEndTime !== null`。如果用户从未开始番茄，该值为 null，OVER_REST 永远不触发。

## 方案

在 socket.ts 的 30 秒轮询中增加一条规则，**不修改 XState guard**，通过在触发前写入 `lastPomodoroEndTime` 让 guard 自然通过。

## 改动

| 文件 | 改动 |
|------|------|
| `prisma/schema.prisma` | 新增 `workStartGracePeriod Int @default(5)`（分钟） |
| `src/server/socket.ts` | 新增内存 Map `userWorkTimeEnteredAt` + 轮询逻辑 |

## 核心逻辑（socket.ts 30s 轮询）

```
每 30 秒，对每个在线用户：

1. 工作时间进入检测
   !wasInWorkHours && withinWorkHours && !hasLastPomodoro
     → userWorkTimeEnteredAt.set(userId, now)
     → 通知「N 分钟内未开始番茄将进入专注提醒模式」

2. 清除追踪
   - 离开工作时间 → delete
   - 进入 focus/rest 等非 idle 状态 → delete（用户开始了番茄）

3. idle + !lastPomodoroEndTime + overRestAllowed 时：
   - 若 userWorkTimeEnteredAt 不存在 → 重新 set(now)（abort 后 re-arm）
   - 若已过 workStartGracePeriod 分钟：
     a. 写入 lastPomodoroEndTime = enteredAt（让 guard 通过）
     b. 发送 ENTER_OVER_REST
     c. delete 追踪
```

## 场景预期

| # | 场景 | 预期行为 |
|---|------|----------|
| 1 | 进入工作时间，一直不开番茄 | 等 N 分钟 → 进 OVER_REST |
| 2 | 进入工作时间，N 分钟内开始番茄 | tracking 清除，不触发 |
| 3 | 完成番茄后一直 idle | lastPomodoroEndTime 有值 → 走**原有** shortRest+gracePeriod 逻辑 |
| 4 | 开始番茄后 abort | abort 不设 lastPomodoroEndTime → 回到 idle 后 **re-arm** → 再等 N 分钟 → 进 OVER_REST |
| 5 | 退出 OVER_REST 后继续 idle | returnToIdle 清空 lastPomodoroEndTime → re-arm → 再等 N 分钟 → 可再次进 OVER_REST |
| 6 | 离开工作时间 | tracking delete，不触发 |
| 7 | 工作时间内反复 start → abort | 每次 abort 后 re-arm，重新倒计时 |

## 设计决策

1. **不修改 XState guard** — 通过在 DB 写入 `lastPomodoroEndTime` 满足条件，侵入性最小
2. **abort 后 re-arm** — abort 是用户主动行为，XState 原设计不惩罚 abort（不设 lastPomodoroEndTime）。但产品需求认为 abort 后继续 idle 也应触发 OVER_REST，所以 re-arm 倒计时
3. **内存 Map 追踪** — 进程重启丢失无害（最多延迟一个轮询周期重新 set）
4. **workStartGracePeriod 可配置** — 存在 UserSettings，默认 5 分钟，后续可加到设置页

## 与原有 OVER_REST 逻辑的关系

```
              idle + overRestAllowed
                    │
        ┌───────────┴───────────┐
        │                       │
  lastPomodoroEndTime        lastPomodoroEndTime
      有值                     null
        │                       │
  原有逻辑：                  新增逻辑：
  elapsed >= shortRest        elapsed >= workStartGrace
  + gracePeriod               → 写入 lastPomodoroEndTime
  → ENTER_OVER_REST           → ENTER_OVER_REST
```

两条路径互不干扰，共享同一个 XState guard 和 OVER_REST 状态。
