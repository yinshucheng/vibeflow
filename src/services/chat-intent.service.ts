/**
 * Chat Intent Service (S6)
 *
 * S6.1 classifyIntent — keyword-based intent classification, zero LLM cost
 * S6.2 getToolSubset  — dynamic tool selection by system state + intent
 * S6.3 buildDynamicContext — per-intent context loading
 * S6.4 resolveSceneForIntent — intent → scene mapping
 */

// ===== Intent Types =====

export type ChatIntent =
  | 'quick_action'
  | 'planning'
  | 'review'
  | 'task_mgmt'
  | 'project'
  | 'default';

// ===== Keyword Patterns =====

const INTENT_PATTERNS: Array<{ intent: ChatIntent; patterns: RegExp[] }> = [
  {
    intent: 'quick_action',
    patterns: [
      /^(搞定了|完成了?|done|finish(ed)?|完工|好了|ok|okay|搞定|弄好了|做完了)$/i,
      /^(开始(专注|番茄钟|工作)?|start|begin|go|冲|干活)$/i,
      /^(暂停|停|stop|pause|休息一下)$/i,
      /^(切换(任务)?|switch|next)$/i,
      /^(记一下|记录|note|jot)$/i,
    ],
  },
  {
    intent: 'planning',
    patterns: [
      /规划|计划|plan/i,
      /今天(做什么|干什么|的(任务|安排|工作))/i,
      /(帮我|给我)(安排|规划|计划)/i,
      /top\s*3/i,
      /优先级|priority/i,
      /每日(规划|计划)/i,
      /明天(做什么|干什么|的(任务|安排))/i,
    ],
  },
  {
    intent: 'review',
    patterns: [
      /效率|efficiency|productivity/i,
      /(这周|本周|上周|今天|昨天)(怎么样|的?(表现|效率|成绩|情况|回顾|总结))/i,
      /回顾|review|retrospective/i,
      /总结|summary|summarize|干了(什么|啥)/i,
      /统计|stats|statistics/i,
      /番茄钟(统计|记录|历史)/i,
      /完成(了多少|率|情况)/i,
    ],
  },
  {
    intent: 'task_mgmt',
    patterns: [
      /创建(一个|个)?(任务|task)/i,
      /(修改|更新|update|edit|改)(任务|task)/i,
      /(删除|delete|remove)(任务|task)/i,
      /标记.*(完成|done)/i,
      /(把|将|设置?).*(P[123]|优先级|priority)/i,
      /逾期|overdue|过期/i,
      /积压|backlog/i,
      /批量|batch/i,
      /(移动|move).*(任务|task)/i,
      /子任务|subtask/i,
      /(添加|加|新增|add).*(任务|task|子任务|subtask)/i,
      /排期|plan.*date|日期/i,
    ],
  },
  {
    intent: 'project',
    patterns: [
      /项目(进度|进展|状态|怎么样|分析|概况)/i,
      /创建(一个|个)?项目/i,
      /(project|项目).*(progress|status|overview)/i,
      /(新建|create).*project/i,
      /项目(模板|template)/i,
      /任务依赖|dependency|dependencies/i,
    ],
  },
];

// ===== Core Functions =====

/**
 * S6.1: Classify user message intent using keyword matching.
 * Zero LLM cost — pure regex matching.
 * Always returns a valid ChatIntent (never throws).
 */
export function classifyIntent(userMessage: string): ChatIntent {
  if (!userMessage || typeof userMessage !== 'string') {
    return 'default';
  }

  const trimmed = userMessage.trim();
  if (trimmed.length === 0) {
    return 'default';
  }

  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        return intent;
      }
    }
  }

  return 'default';
}

// ===== Tool Subset (S6.2) =====

/** Core 9 tools always included regardless of state/intent */
export const CORE_TOOLS: ReadonlyArray<string> = [
  'flow_complete_task',
  'flow_create_task_from_nl',
  'flow_add_subtask',
  'flow_update_task',
  'flow_get_task',
  'flow_get_top3',
  'flow_set_top3',
  'flow_quick_create_inbox_task',
  'flow_start_pomodoro',
];

/** Extra tools by system state (3-state model: IDLE/FOCUS/OVER_REST) */
const STATE_EXTRA_TOOLS: Record<string, string[]> = {
  FOCUS: ['flow_switch_task', 'flow_complete_current_task', 'flow_report_blocker'],
  IDLE: [
    'flow_start_pomodoro',
    'flow_record_pomodoro',
    'flow_get_overdue_tasks',
    'flow_get_backlog_tasks',
    'flow_batch_update_tasks',
    'flow_set_plan_date',
    'flow_move_task',
  ],
  OVER_REST: ['flow_start_pomodoro'],
};

/** Extra tools by intent */
const INTENT_EXTRA_TOOLS: Record<string, string[]> = {
  project: [
    'flow_create_project',
    'flow_update_project',
    'flow_get_project',
    'flow_create_project_from_template',
    'flow_analyze_task_dependencies',
  ],
  review: ['flow_generate_daily_summary'],
};

/**
 * S6.2: Get the tool subset based on system state and intent.
 * Returns a Set of tool names to include in the LLM call.
 */
export function getToolSubset(systemState: string, intent: ChatIntent): Set<string> {
  const tools = new Set<string>(CORE_TOOLS);

  // Add state-specific tools
  const stateExtras = STATE_EXTRA_TOOLS[systemState];
  if (stateExtras) {
    for (const tool of stateExtras) {
      tools.add(tool);
    }
  }

  // Add intent-specific tools
  const intentExtras = INTENT_EXTRA_TOOLS[intent];
  if (intentExtras) {
    for (const tool of intentExtras) {
      tools.add(tool);
    }
  }

  return tools;
}

// ===== Dynamic Context (S6.3) =====

export type ContextResource = 'tasks/today' | 'analytics/productivity' | 'history/pomodoros' | 'projects/active' | 'projects/all';

/** Map intent to the extra context resources to load */
const INTENT_CONTEXT_MAP: Record<ChatIntent, ContextResource[]> = {
  planning: ['tasks/today', 'analytics/productivity'],
  review: ['history/pomodoros', 'analytics/productivity'],
  task_mgmt: ['tasks/today', 'projects/active'],
  project: ['projects/all'],
  quick_action: [],
  default: [],
};

/**
 * S6.3: Get the list of extra context resources to load for a given intent.
 */
export function getContextResourcesForIntent(intent: ChatIntent): ContextResource[] {
  return INTENT_CONTEXT_MAP[intent] ?? [];
}

// ===== Scene Routing (S6.4) =====

/** Map intent to scene config key */
const INTENT_SCENE_MAP: Record<ChatIntent, string> = {
  quick_action: 'chat:quick_action',
  planning: 'chat:planning',
  review: 'chat:review',
  task_mgmt: 'chat:default',
  project: 'chat:default',
  default: 'chat:default',
};

/**
 * S6.4: Resolve the scene config key for a given intent.
 */
export function resolveSceneForIntent(intent: ChatIntent): string {
  return INTENT_SCENE_MAP[intent] ?? 'chat:default';
}

// ===== Service object for consistency =====

export const chatIntentService = {
  classifyIntent,
  getToolSubset,
  getContextResourcesForIntent,
  resolveSceneForIntent,
};
