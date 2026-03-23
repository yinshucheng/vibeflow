/**
 * S6.5 Tests: Tool Subset Strategy
 *
 * - FOCUS state → includes switch_task, does NOT include batch_update
 * - IDLE state → includes batch_update, set_plan_date, start_pomodoro, record_pomodoro
 * - OVER_REST state → includes start_pomodoro
 * - Core 9 tools always present
 * - Intent=project → includes project management tools
 * - Intent=review → includes generate_daily_summary
 */
import { describe, it, expect } from 'vitest';
import {
  getToolSubset,
  CORE_TOOLS,
  type ChatIntent,
} from '@/services/chat-intent.service';

describe('getToolSubset (S6.2)', () => {
  // ── Core tools always present ──
  describe('core tools', () => {
    it('always includes all 9 core tools regardless of state/intent', () => {
      const states = ['FOCUS', 'IDLE', 'OVER_REST'];
      const intents: ChatIntent[] = ['quick_action', 'planning', 'review', 'task_mgmt', 'project', 'default'];

      for (const state of states) {
        for (const intent of intents) {
          const tools = getToolSubset(state, intent);
          for (const core of CORE_TOOLS) {
            expect(tools.has(core)).toBe(true);
          }
        }
      }
    });
  });

  // ── FOCUS state ──
  describe('FOCUS state', () => {
    it('includes switch_task and complete_current_task', () => {
      const tools = getToolSubset('FOCUS', 'default');
      expect(tools.has('flow_switch_task')).toBe(true);
      expect(tools.has('flow_complete_current_task')).toBe(true);
      expect(tools.has('flow_report_blocker')).toBe(true);
    });

    it('does NOT include batch_update or set_plan_date', () => {
      const tools = getToolSubset('FOCUS', 'default');
      expect(tools.has('flow_batch_update_tasks')).toBe(false);
      expect(tools.has('flow_set_plan_date')).toBe(false);
    });
  });

  // ── IDLE state ──
  describe('IDLE state', () => {
    it('includes start_pomodoro, record_pomodoro, batch_update, set_plan_date, overdue, backlog, move', () => {
      const tools = getToolSubset('IDLE', 'default');
      expect(tools.has('flow_start_pomodoro')).toBe(true);
      expect(tools.has('flow_record_pomodoro')).toBe(true);
      expect(tools.has('flow_get_overdue_tasks')).toBe(true);
      expect(tools.has('flow_get_backlog_tasks')).toBe(true);
      expect(tools.has('flow_batch_update_tasks')).toBe(true);
      expect(tools.has('flow_set_plan_date')).toBe(true);
      expect(tools.has('flow_move_task')).toBe(true);
    });

    it('does NOT include switch_task (FOCUS-only)', () => {
      const tools = getToolSubset('IDLE', 'default');
      expect(tools.has('flow_switch_task')).toBe(false);
    });
  });

  // ── OVER_REST state ──
  describe('OVER_REST state', () => {
    it('includes start_pomodoro', () => {
      const tools = getToolSubset('OVER_REST', 'default');
      expect(tools.has('flow_start_pomodoro')).toBe(true);
    });
  });

  // ── Intent: project ──
  describe('intent=project', () => {
    it('includes all 5 project management tools', () => {
      const tools = getToolSubset('IDLE', 'project');
      expect(tools.has('flow_create_project')).toBe(true);
      expect(tools.has('flow_update_project')).toBe(true);
      expect(tools.has('flow_get_project')).toBe(true);
      expect(tools.has('flow_create_project_from_template')).toBe(true);
      expect(tools.has('flow_analyze_task_dependencies')).toBe(true);
    });
  });

  // ── Intent: review ──
  describe('intent=review', () => {
    it('includes generate_daily_summary', () => {
      const tools = getToolSubset('IDLE', 'review');
      expect(tools.has('flow_generate_daily_summary')).toBe(true);
    });
  });

  // ── Combination: FOCUS + project intent ──
  describe('FOCUS + project intent', () => {
    it('includes both FOCUS extras and project extras', () => {
      const tools = getToolSubset('FOCUS', 'project');
      expect(tools.has('flow_switch_task')).toBe(true);
      expect(tools.has('flow_create_project')).toBe(true);
    });
  });

  // ── Unknown state ──
  describe('unknown state', () => {
    it('still returns core tools for unknown states', () => {
      const tools = getToolSubset('UNKNOWN_STATE', 'default');
      expect(tools.size).toBe(CORE_TOOLS.length);
      for (const core of CORE_TOOLS) {
        expect(tools.has(core)).toBe(true);
      }
    });
  });
});
