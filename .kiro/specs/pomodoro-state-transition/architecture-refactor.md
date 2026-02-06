# 番茄工作法状态管理架构重构方案

## 问题根源

### 1. 职责不清晰
```
PomodoroTimer      → 调用 pomodoro.complete (2处)
CompletionModal    → 调用 pomodoro.complete (1处)
RestModeUI         → 调用 dailyState.updateSystemState + pomodoro.start
PomodoroPage       → 调用 dailyState.updateSystemState
```

### 2. 状态来源分散
```
socketState (WebSocket)
  ↓ 合并
dailyState (tRPC query)
  ↓ 派生
currentPomodoro (tRPC query)
  ↓ 派生
showCompletionModal (local state)
completedPomodoroInfo (local state)
```

### 3. 重复触发风险
- Timer 的主倒计时 interval (line 363-386)
- Timer 的同步 interval (line 391-422)
- Modal 的 handleConfirm

---

## 重构方案: 单一状态机 + 命令模式

### 核心原则

1. **单一数据源**: 所有番茄状态来自一个 Hook
2. **命令模式**: 组件只发出意图，不直接调用 API
3. **状态机驱动**: 状态转换由状态机统一管理
4. **幂等操作**: 重复调用同一命令不会产生副作用

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        PomodoroPage                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  usePomodoroMachine()                    │    │
│  │  ┌─────────────────────────────────────────────────────┐│    │
│  │  │  状态:                                              ││    │
│  │  │  - phase: 'idle' | 'focus' | 'completing' |        ││    │
│  │  │           'break_prompt' | 'resting'               ││    │
│  │  │  - pomodoro: PomodoroData | null                   ││    │
│  │  │  - restStatus: RestStatus | null                   ││    │
│  │  │                                                     ││    │
│  │  │  命令:                                              ││    │
│  │  │  - startPomodoro(taskId)                           ││    │
│  │  │  - completePomodoro()  ← 幂等,重复调用无副作用      ││    │
│  │  │  - confirmBreak()                                   ││    │
│  │  │  - skipBreak()                                      ││    │
│  │  │  - startRest()                                      ││    │
│  │  │  - endRest()                                        ││    │
│  │  └─────────────────────────────────────────────────────┘│    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│     ┌────────────┐  ┌────────────────┐  ┌──────────┐           │
│     │PomodoroTimer│  │CompletionModal │  │RestModeUI│           │
│     │            │  │                │  │          │           │
│     │ 只负责:    │  │ 只负责:        │  │ 只负责:  │           │
│     │ - 显示倒计时│  │ - 显示确认UI  │  │ - 显示休息│           │
│     │ - 通知超时 │  │ - 收集summary │  │ - 显示倒计时│          │
│     │            │  │                │  │          │           │
│     │ 不调用API  │  │ 不调用API     │  │ 不调用API │           │
│     └────────────┘  └────────────────┘  └──────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### 状态机定义

```typescript
// src/hooks/use-pomodoro-machine.ts

type PomodoroPhase =
  | 'idle'           // 无活跃番茄,等待开始
  | 'focus'          // 专注中,显示计时器
  | 'completing'     // 完成中,正在调用API
  | 'break_prompt'   // 显示休息确认弹窗
  | 'resting'        // 休息中

interface PomodoroMachineState {
  phase: PomodoroPhase;
  pomodoro: PomodoroData | null;
  completedPomodoro: PomodoroData | null;  // 保存刚完成的番茄信息
  restStatus: RestStatus | null;
  error: Error | null;
}

interface PomodoroMachineActions {
  // 启动番茄 (idle -> focus)
  startPomodoro: (taskId: string, duration?: number) => Promise<void>;

  // 番茄时间到,触发完成 (focus -> completing -> break_prompt)
  // 幂等: 如果已经在 completing/break_prompt,则忽略
  triggerComplete: () => void;

  // 用户确认开始休息 (break_prompt -> resting)
  confirmBreak: (summary?: string) => Promise<void>;

  // 用户跳过休息 (break_prompt -> idle)
  skipBreak: () => Promise<void>;

  // 休息结束,开始下一个番茄 (resting -> focus)
  startNextPomodoro: (taskId: string) => Promise<void>;

  // 休息结束,回到空闲 (resting -> idle)
  endRest: () => Promise<void>;

  // 中止番茄 (focus -> idle)
  abortPomodoro: () => Promise<void>;
}
```

### 状态转换图

```
                    startPomodoro()
        ┌──────────────────────────────────┐
        │                                  │
        ▼                                  │
    ┌───────┐    triggerComplete()    ┌────┴────┐
    │ idle  │ ◄───────────────────────│  focus  │
    └───┬───┘     abortPomodoro()     └────┬────┘
        │                                  │
        │                                  │ triggerComplete()
        │                                  │ (幂等,自动去重)
        │                                  ▼
        │                            ┌───────────┐
        │         skipBreak()        │completing │
        │◄───────────────────────────└─────┬─────┘
        │                                  │
        │                                  │ API完成
        │                                  ▼
        │                           ┌─────────────┐
        │         skipBreak()       │break_prompt │
        │◄──────────────────────────└──────┬──────┘
        │                                  │
        │                                  │ confirmBreak()
        │         endRest()                ▼
        │◄─────────────────────────┌───────────┐
        │                          │  resting  │
        │                          └─────┬─────┘
        │                                │
        │     startNextPomodoro()        │
        └────────────────────────────────┘
```

---

## 实现步骤

### Phase 1: 创建统一的状态机 Hook

```typescript
// src/hooks/use-pomodoro-machine.ts

export function usePomodoroMachine() {
  const [phase, setPhase] = useState<PomodoroPhase>('idle');
  const [completedPomodoro, setCompletedPomodoro] = useState<PomodoroData | null>(null);

  // 防止重复触发的 ref
  const isCompletingRef = useRef(false);

  // tRPC queries
  const { data: currentPomodoro } = trpc.pomodoro.getCurrent.useQuery();
  const { data: dailyState } = trpc.dailyState.getToday.useQuery();
  const { data: restStatus } = trpc.dailyState.getRestStatus.useQuery();

  // tRPC mutations
  const completeMutation = trpc.pomodoro.complete.useMutation();
  const startMutation = trpc.pomodoro.start.useMutation();
  const abortMutation = trpc.pomodoro.abort.useMutation();
  const updateStateMutation = trpc.dailyState.updateSystemState.useMutation();

  // 幂等的完成触发
  const triggerComplete = useCallback(() => {
    // 防止重复触发
    if (isCompletingRef.current || phase !== 'focus') {
      return;
    }

    if (!currentPomodoro) return;

    isCompletingRef.current = true;
    setPhase('completing');

    // 保存番茄信息用于显示
    setCompletedPomodoro(currentPomodoro);

    completeMutation.mutate(
      { id: currentPomodoro.id },
      {
        onSuccess: () => {
          setPhase('break_prompt');
          isCompletingRef.current = false;
        },
        onError: () => {
          setPhase('focus');
          isCompletingRef.current = false;
        },
      }
    );
  }, [phase, currentPomodoro, completeMutation]);

  // ... 其他 actions

  return {
    phase,
    pomodoro: currentPomodoro,
    completedPomodoro,
    restStatus,
    actions: {
      startPomodoro,
      triggerComplete,
      confirmBreak,
      skipBreak,
      startNextPomodoro,
      endRest,
      abortPomodoro,
    },
  };
}
```

### Phase 2: 简化子组件

```typescript
// PomodoroTimer - 只负责显示和通知超时
interface PomodoroTimerProps {
  pomodoro: PomodoroData;
  onTimeUp: () => void;  // 只通知,不执行
}

function PomodoroTimer({ pomodoro, onTimeUp }: PomodoroTimerProps) {
  const timeRemaining = useCountdown(pomodoro.startTime, pomodoro.duration);

  useEffect(() => {
    if (timeRemaining <= 0) {
      onTimeUp();  // 通知父组件,不调用API
    }
  }, [timeRemaining, onTimeUp]);

  return <TimerDisplay time={timeRemaining} />;
}
```

```typescript
// CompletionModal - 只负责收集输入和触发回调
interface CompletionModalProps {
  pomodoro: PomodoroData;
  onConfirmBreak: (summary?: string) => void;
  onSkipBreak: () => void;
}

function CompletionModal({ pomodoro, onConfirmBreak, onSkipBreak }: CompletionModalProps) {
  const [summary, setSummary] = useState('');

  return (
    <Modal>
      <Input value={summary} onChange={setSummary} />
      <Button onClick={() => onConfirmBreak(summary)}>Take a Break</Button>
      <Button onClick={onSkipBreak}>Skip</Button>
    </Modal>
  );
}
```

### Phase 3: 重构 PomodoroPage

```typescript
// src/app/pomodoro/page.tsx

export default function PomodoroPage() {
  const {
    phase,
    pomodoro,
    completedPomodoro,
    restStatus,
    actions,
  } = usePomodoroMachine();

  return (
    <MainLayout>
      {phase === 'idle' && (
        <TaskSelector onSelect={actions.startPomodoro} />
      )}

      {phase === 'focus' && pomodoro && (
        <PomodoroTimer
          pomodoro={pomodoro}
          onTimeUp={actions.triggerComplete}
          onAbort={actions.abortPomodoro}
        />
      )}

      {phase === 'completing' && (
        <LoadingSpinner message="Completing..." />
      )}

      {phase === 'break_prompt' && completedPomodoro && (
        <CompletionModal
          pomodoro={completedPomodoro}
          onConfirmBreak={actions.confirmBreak}
          onSkipBreak={actions.skipBreak}
        />
      )}

      {phase === 'resting' && restStatus && (
        <RestModeUI
          restStatus={restStatus}
          onStartNext={actions.startNextPomodoro}
          onEndRest={actions.endRest}
        />
      )}
    </MainLayout>
  );
}
```

---

## 关键改进点

### 1. 幂等的 triggerComplete

```typescript
const triggerComplete = useCallback(() => {
  // 三重保护
  if (isCompletingRef.current) return;  // 正在执行中
  if (phase !== 'focus') return;         // 状态不对
  if (!currentPomodoro) return;          // 没有番茄

  isCompletingRef.current = true;
  // ...
}, [phase, currentPomodoro]);
```

### 2. 状态驱动渲染

```typescript
// 之前: 多个布尔值组合
{showCompletionModal && currentPomodoro && <Modal />}

// 之后: 单一状态枚举
{phase === 'break_prompt' && <Modal />}
```

### 3. 数据在状态转换时保存

```typescript
// 之前: 依赖可能被清空的 currentPomodoro
// 之后: 转换时保存到 completedPomodoro
setCompletedPomodoro(currentPomodoro);
setPhase('completing');
```

---

## 迁移计划

1. **Phase 1**: 创建 `usePomodoroMachine` Hook (新增文件) ✅
2. **Phase 2**: 在 PomodoroPage 中使用新 Hook (渐进替换) ✅
3. **Phase 3**: 简化 PomodoroTimer (移除 API 调用) ✅
4. **Phase 4**: 简化 CompletionModal (移除 API 调用) - 已通过 alreadyCompleted 实现
5. **Phase 5**: 简化 RestModeUI (移除 API 调用) - 待实施
6. **Phase 6**: 清理旧代码和测试 - 待实施

每个 Phase 都应该保持系统可运行状态。

---

## 已实施的改进

### 1. usePomodoroMachine Hook (`src/hooks/use-pomodoro-machine.ts`)

新的集中式状态机，提供：
- **单一数据源**: 所有番茄状态通过一个 Hook 管理
- **幂等操作**: `triggerComplete()` 使用多重检查防止重复调用
- **状态驱动渲染**: `phase` 枚举决定显示什么 UI

```typescript
const { phase, pomodoro, completedPomodoro, actions } = usePomodoroMachine();

// 幂等完成检查
const triggerComplete = useCallback(() => {
  if (isCompletingRef.current) return;  // 正在执行中
  if (phase !== 'focus') return;         // 状态不对
  if (!currentPomodoro) return;          // 没有番茄
  if (lastCompletedIdRef.current === currentPomodoro.id) return;  // 已完成
  // ...
}, [phase, currentPomodoro]);
```

### 2. PomodoroPage 重构 (`src/app/pomodoro/page.tsx`)

使用状态机驱动 UI 渲染：
```typescript
{phase === 'resting' ? <RestModeUI /> : <PomodoroTimer />}
{phase === 'break_prompt' && <CompletionModal />}
```

### 3. PomodoroTimer 简化 (`src/components/pomodoro/pomodoro-timer.tsx`)

移除直接的 API 调用，改为只通知父组件：
```typescript
// 之前: completeMutation.mutate({ id: currentPomodoro.id });
// 之后: handleTimerComplete() -> onComplete?.()

const handleTimerComplete = useCallback(() => {
  if (hasTriggeredComplete.current) return;  // 幂等检查
  hasTriggeredComplete.current = true;
  onComplete?.();  // 通知父组件
}, [onComplete]);
```

---

## 验证测试

### 1. 番茄完成流程
- [ ] 计时器到 0 只触发一次 `onComplete`
- [ ] 弹窗不会重复弹出
- [ ] 状态正确转换: focus -> completing -> break_prompt

### 2. 刷新恢复
- [ ] 刷新后番茄计时正确恢复
- [ ] 刷新后休息时间正确恢复

### 3. 状态同步
- [ ] WebSocket 状态变化正确更新 UI
- [ ] 多标签页状态保持一致
