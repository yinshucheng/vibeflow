/**
 * S6.5 Tests: Intent Classification
 *
 * - "搞定了" / "完成" / "done" → quick_action
 * - "帮我规划今天" / "今天做什么" → planning
 * - "这周效率怎么样" → review
 * - "创建一个任务" / "把 XX 调到 P1" → task_mgmt
 * - "项目进度" / "创建项目" → project
 * - unrecognized → default
 */
import { describe, it, expect } from 'vitest';
import { classifyIntent, type ChatIntent } from '@/services/chat-intent.service';

describe('classifyIntent (S6.1)', () => {
  // ── quick_action ──
  describe('quick_action', () => {
    const cases: string[] = [
      '搞定了',
      '完成',
      '完成了',
      'done',
      'finished',
      '好了',
      'ok',
      'okay',
      '搞定',
      '弄好了',
      '做完了',
      '开始',
      '开始专注',
      '开始番茄钟',
      'start',
      '暂停',
      'stop',
      '切换任务',
      'switch',
      'next',
      '记一下',
      '记录',
      'note',
    ];

    it.each(cases)('"%s" → quick_action', (msg) => {
      expect(classifyIntent(msg)).toBe('quick_action' satisfies ChatIntent);
    });
  });

  // ── planning ──
  describe('planning', () => {
    const cases: string[] = [
      '帮我规划今天',
      '今天做什么',
      '今天干什么',
      '今天的任务',
      '帮我安排一下',
      '给我规划',
      'top 3',
      'Top3',
      '优先级',
      '每日规划',
      '明天做什么',
      '帮我计划一下',
    ];

    it.each(cases)('"%s" → planning', (msg) => {
      expect(classifyIntent(msg)).toBe('planning' satisfies ChatIntent);
    });
  });

  // ── review ──
  describe('review', () => {
    const cases: string[] = [
      '这周效率怎么样',
      '本周的表现',
      '今天干了什么',
      '昨天的总结',
      '回顾一下',
      'review',
      '统计',
      '番茄钟统计',
      '完成率',
      '今天干了啥',
      '效率',
    ];

    it.each(cases)('"%s" → review', (msg) => {
      expect(classifyIntent(msg)).toBe('review' satisfies ChatIntent);
    });
  });

  // ── task_mgmt ──
  describe('task_mgmt', () => {
    const cases: string[] = [
      '创建一个任务',
      '创建个任务叫买咖啡',
      '修改任务',
      '删除任务',
      '标记为完成',
      '把买咖啡调到P1',
      '逾期任务',
      '积压',
      '批量更新',
      '移动任务到另一个项目',
      '添加子任务',
      '添加一个任务',
      '排期',
    ];

    it.each(cases)('"%s" → task_mgmt', (msg) => {
      expect(classifyIntent(msg)).toBe('task_mgmt' satisfies ChatIntent);
    });
  });

  // ── project ──
  describe('project', () => {
    const cases: string[] = [
      '项目进度',
      '项目进展怎么样',
      '创建一个项目',
      '项目状态',
      '项目分析',
      '项目概况',
      '项目模板',
      '任务依赖',
    ];

    it.each(cases)('"%s" → project', (msg) => {
      expect(classifyIntent(msg)).toBe('project' satisfies ChatIntent);
    });
  });

  // ── default ──
  describe('default', () => {
    const cases: string[] = [
      '你好',
      '你是谁',
      'hello',
      '天气怎么样',
      '讲个笑话',
      '',
      '   ',
      '随便聊聊',
    ];

    it.each(cases)('"%s" → default', (msg) => {
      expect(classifyIntent(msg)).toBe('default' satisfies ChatIntent);
    });
  });

  // ── Edge cases ──
  describe('edge cases', () => {
    it('handles null/undefined gracefully', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(classifyIntent(null as any)).toBe('default');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(classifyIntent(undefined as any)).toBe('default');
    });

    it('handles non-string input', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(classifyIntent(123 as any)).toBe('default');
    });

    it('is case insensitive for English keywords', () => {
      expect(classifyIntent('DONE')).toBe('quick_action');
      expect(classifyIntent('Review')).toBe('review');
    });
  });
});
