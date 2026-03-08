/**
 * Natural Language Parser Service
 * 
 * Parses natural language task descriptions to extract structured task data.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { taskService, CreateTaskSchema } from './task.service';
import type { Task, Priority } from '@prisma/client';

// Service result type
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

// Parsed task interface (Requirement 8.1)
export interface ParsedTask {
  title: string;
  priority: Priority;
  projectId: string | null;
  planDate: Date | null;
  estimatedMinutes: number | null;
  confidence: number;              // Parse confidence 0-1
  ambiguities: string[];           // Parts needing user confirmation
}

// Project candidate for disambiguation (Requirement 8.3)
export interface ProjectCandidate {
  id: string;
  title: string;
  score: number;  // Match score 0-1
}

// Confirmation input for task creation (Requirement 8.5)
export const ConfirmAndCreateSchema = z.object({
  title: z.string().min(1).optional(),
  priority: z.enum(['P1', 'P2', 'P3']).optional(),
  projectId: z.string().uuid(),
  planDate: z.coerce.date().optional().nullable(),
  estimatedMinutes: z.number().int().min(1).max(480).optional().nullable(),
});

export type ConfirmAndCreateInput = z.infer<typeof ConfirmAndCreateSchema>;

/**
 * Priority keywords mapping (Requirement 8.2)
 * Maps natural language keywords to priority levels
 */
const PRIORITY_KEYWORDS: Record<string, Priority> = {
  // P1 - Urgent/Critical
  'urgent': 'P1',
  'critical': 'P1',
  'asap': 'P1',
  'important': 'P1',
  'high priority': 'P1',
  'high-priority': 'P1',
  'p1': 'P1',
  'priority 1': 'P1',
  'immediately': 'P1',
  'emergency': 'P1',
  '紧急': 'P1',
  '重要': 'P1',
  '优先': 'P1',
  
  // P2 - Normal (explicit)
  'medium': 'P2',
  'normal': 'P2',
  'medium priority': 'P2',
  'p2': 'P2',
  'priority 2': 'P2',
  '普通': 'P2',
  
  // P3 - Low priority
  'low': 'P3',
  'low priority': 'P3',
  'low-priority': 'P3',
  'p3': 'P3',
  'priority 3': 'P3',
  'when possible': 'P3',
  'nice to have': 'P3',
  'nice-to-have': 'P3',
  'eventually': 'P3',
  'someday': 'P3',
  'backlog': 'P3',
  '低优先级': 'P3',
  '以后': 'P3',
};


/**
 * Date expression parsers (Requirement 8.4)
 * Supports expressions like "tomorrow", "next week", "end of month"
 */
function getDateExpressionParsers(): Record<string, () => Date> {
  const now = new Date();
  
  return {
    // Today
    'today': () => {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    '今天': () => {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    
    // Tomorrow
    'tomorrow': () => {
      const date = new Date(now);
      date.setDate(date.getDate() + 1);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    '明天': () => {
      const date = new Date(now);
      date.setDate(date.getDate() + 1);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    
    // Day after tomorrow
    'day after tomorrow': () => {
      const date = new Date(now);
      date.setDate(date.getDate() + 2);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    '后天': () => {
      const date = new Date(now);
      date.setDate(date.getDate() + 2);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    
    // Next week
    'next week': () => {
      const date = new Date(now);
      date.setDate(date.getDate() + 7);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    '下周': () => {
      const date = new Date(now);
      date.setDate(date.getDate() + 7);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    
    // This week (end of week - Sunday)
    'this week': () => {
      const date = new Date(now);
      const dayOfWeek = date.getDay();
      const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
      date.setDate(date.getDate() + daysUntilSunday);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    '本周': () => {
      const date = new Date(now);
      const dayOfWeek = date.getDay();
      const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
      date.setDate(date.getDate() + daysUntilSunday);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    
    // End of week (Friday)
    'end of week': () => {
      const date = new Date(now);
      const dayOfWeek = date.getDay();
      const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 5 + (7 - dayOfWeek);
      date.setDate(date.getDate() + daysUntilFriday);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    '周末': () => {
      const date = new Date(now);
      const dayOfWeek = date.getDay();
      const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 5 + (7 - dayOfWeek);
      date.setDate(date.getDate() + daysUntilFriday);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    
    // End of month
    'end of month': () => {
      const date = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    '月底': () => {
      const date = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    
    // Next month
    'next month': () => {
      const date = new Date(now);
      date.setMonth(date.getMonth() + 1);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    '下个月': () => {
      const date = new Date(now);
      date.setMonth(date.getMonth() + 1);
      date.setHours(0, 0, 0, 0);
      return date;
    },
    
    // Specific weekdays
    'next monday': () => getNextDayOfWeek(1),
    'next tuesday': () => getNextDayOfWeek(2),
    'next wednesday': () => getNextDayOfWeek(3),
    'next thursday': () => getNextDayOfWeek(4),
    'next friday': () => getNextDayOfWeek(5),
    'next saturday': () => getNextDayOfWeek(6),
    'next sunday': () => getNextDayOfWeek(0),
    
    // Chinese weekdays
    '下周一': () => getNextDayOfWeek(1),
    '下周二': () => getNextDayOfWeek(2),
    '下周三': () => getNextDayOfWeek(3),
    '下周四': () => getNextDayOfWeek(4),
    '下周五': () => getNextDayOfWeek(5),
    '下周六': () => getNextDayOfWeek(6),
    '下周日': () => getNextDayOfWeek(0),
  };
}

/**
 * Get the next occurrence of a specific day of week
 */
function getNextDayOfWeek(targetDay: number): Date {
  const now = new Date();
  const currentDay = now.getDay();
  let daysUntilTarget = targetDay - currentDay;
  
  // If target day is today or in the past this week, go to next week
  if (daysUntilTarget <= 0) {
    daysUntilTarget += 7;
  }
  
  const date = new Date(now);
  date.setDate(date.getDate() + daysUntilTarget);
  date.setHours(0, 0, 0, 0);
  return date;
}


/**
 * Extract priority from input text (Requirement 8.2)
 * Returns the priority and the cleaned text with keyword removed
 */
function extractPriority(input: string): { priority: Priority; cleanedText: string; found: boolean } {
  const lowerInput = input.toLowerCase();
  
  // Sort keywords by length (longest first) to match multi-word phrases first
  const sortedKeywords = Object.entries(PRIORITY_KEYWORDS)
    .sort((a, b) => b[0].length - a[0].length);
  
  for (const [keyword, priority] of sortedKeywords) {
    if (lowerInput.includes(keyword)) {
      // Remove the keyword from the text (case-insensitive)
      const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const cleanedText = input.replace(regex, '').trim();
      return { priority, cleanedText, found: true };
    }
  }
  
  // Default to P2 if no keyword found
  return { priority: 'P2', cleanedText: input, found: false };
}

/**
 * Extract date from input text (Requirement 8.4)
 * Returns the date and the cleaned text with expression removed
 */
function extractDate(input: string): { date: Date | null; cleanedText: string; found: boolean } {
  const lowerInput = input.toLowerCase();
  const dateExpressions = getDateExpressionParsers();
  
  // Sort expressions by length (longest first) to match multi-word phrases first
  const sortedExpressions = Object.entries(dateExpressions)
    .sort((a, b) => b[0].length - a[0].length);
  
  for (const [expression, getDate] of sortedExpressions) {
    if (lowerInput.includes(expression)) {
      // Remove the expression from the text (case-insensitive)
      const regex = new RegExp(expression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const cleanedText = input.replace(regex, '').trim();
      return { date: getDate(), cleanedText, found: true };
    }
  }
  
  // Try to parse explicit date patterns (e.g., "2024-01-15", "Jan 15", "15/01")
  const explicitDate = parseExplicitDate(input);
  if (explicitDate.date) {
    return explicitDate;
  }
  
  return { date: null, cleanedText: input, found: false };
}

/**
 * Parse explicit date formats from input
 */
function parseExplicitDate(input: string): { date: Date | null; cleanedText: string; found: boolean } {
  // ISO format: 2024-01-15
  const isoMatch = input.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    const date = new Date(isoMatch[1]);
    if (!isNaN(date.getTime())) {
      const cleanedText = input.replace(isoMatch[0], '').trim();
      return { date, cleanedText, found: true };
    }
  }
  
  // US format: 01/15/2024 or 1/15/24
  const usMatch = input.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (usMatch) {
    const month = parseInt(usMatch[1]) - 1;
    const day = parseInt(usMatch[2]);
    let year = parseInt(usMatch[3]);
    if (year < 100) year += 2000;
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      const cleanedText = input.replace(usMatch[0], '').trim();
      return { date, cleanedText, found: true };
    }
  }
  
  return { date: null, cleanedText: input, found: false };
}

/**
 * Extract time estimate from input text
 * Supports formats like "30 minutes", "2 hours", "1.5h"
 */
function extractTimeEstimate(input: string): { minutes: number | null; cleanedText: string; found: boolean } {
  // Match patterns like "30 minutes", "2 hours", "1.5h", "90min"
  const timeMatch = input.match(/(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|h|m)\b/i);
  
  if (timeMatch) {
    const value = parseFloat(timeMatch[1]);
    const unit = timeMatch[2].toLowerCase();
    
    let minutes: number;
    if (unit.startsWith('h')) {
      minutes = Math.round(value * 60);
    } else {
      minutes = Math.round(value);
    }
    
    // Clamp to valid range (1-480 minutes)
    minutes = Math.max(1, Math.min(480, minutes));
    
    const cleanedText = input.replace(timeMatch[0], '').trim();
    return { minutes, cleanedText, found: true };
  }
  
  // Chinese time patterns: "30分钟", "2小时"
  const chineseMatch = input.match(/(\d+(?:\.\d+)?)\s*(分钟|小时)/);
  if (chineseMatch) {
    const value = parseFloat(chineseMatch[1]);
    const unit = chineseMatch[2];
    
    let minutes: number;
    if (unit === '小时') {
      minutes = Math.round(value * 60);
    } else {
      minutes = Math.round(value);
    }
    
    minutes = Math.max(1, Math.min(480, minutes));
    
    const cleanedText = input.replace(chineseMatch[0], '').trim();
    return { minutes, cleanedText, found: true };
  }
  
  return { minutes: null, cleanedText: input, found: false };
}

/**
 * Clean up the title by removing extra whitespace and common filler words
 */
function cleanTitle(input: string): string {
  return input
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/^[\s,.-]+/, '')       // Remove leading punctuation
    .replace(/[\s,.-]+$/, '')       // Remove trailing punctuation
    .replace(/^(need to|have to|should|must|want to|gonna|going to)\s+/i, '') // Remove common prefixes
    .trim();
}


/**
 * Natural Language Parser Service
 */
export const nlParserService = {
  /**
   * Parse natural language task description (Requirements 8.1, 8.2, 8.4)
   * Extracts title, priority, project, and date from natural language input
   */
  async parseTaskDescription(
    userId: string,
    input: string
  ): Promise<ServiceResult<ParsedTask>> {
    try {
      if (!input || input.trim().length === 0) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Input cannot be empty',
          },
        };
      }

      let workingText = input.trim();
      let confidence = 0.5; // Base confidence
      const ambiguities: string[] = [];

      // Extract priority (Requirement 8.2)
      const priorityResult = extractPriority(workingText);
      workingText = priorityResult.cleanedText;
      if (priorityResult.found) {
        confidence += 0.1;
      }

      // Extract date (Requirement 8.4)
      const dateResult = extractDate(workingText);
      workingText = dateResult.cleanedText;
      if (dateResult.found) {
        confidence += 0.1;
      }

      // Extract time estimate
      const timeResult = extractTimeEstimate(workingText);
      workingText = timeResult.cleanedText;
      if (timeResult.found) {
        confidence += 0.1;
      }

      // Clean up the title
      const title = cleanTitle(workingText);

      if (title.length === 0) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Could not extract a valid task title from input',
          },
        };
      }

      // Try to infer project from context (Requirement 8.3)
      // Look for project hints in the input
      let projectId: string | null = null;
      const projectCandidates = await this.getProjectCandidates(userId, title);
      
      if (projectCandidates.success && projectCandidates.data) {
        if (projectCandidates.data.length === 1 && projectCandidates.data[0].score > 0.7) {
          // High confidence single match
          projectId = projectCandidates.data[0].id;
          confidence += 0.1;
        } else if (projectCandidates.data.length > 1) {
          // Multiple candidates - need user disambiguation
          ambiguities.push('Multiple projects match. Please select a project.');
        } else if (projectCandidates.data.length === 0) {
          ambiguities.push('No matching project found. Please select a project.');
        }
      }

      // Cap confidence at 1.0
      confidence = Math.min(1.0, confidence);

      const parsedTask: ParsedTask = {
        title,
        priority: priorityResult.priority,
        projectId,
        planDate: dateResult.date,
        estimatedMinutes: timeResult.minutes,
        confidence,
        ambiguities,
      };

      return { success: true, data: parsedTask };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to parse task description',
        },
      };
    }
  },

  /**
   * Get project candidates for disambiguation (Requirement 8.3)
   * Returns active projects that might match the task context
   */
  async getProjectCandidates(
    userId: string,
    hint: string
  ): Promise<ServiceResult<ProjectCandidate[]>> {
    try {
      // Get all active projects for the user
      const projects = await prisma.project.findMany({
        where: {
          userId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          title: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (projects.length === 0) {
        return { success: true, data: [] };
      }

      // Calculate match scores based on title similarity
      const lowerHint = hint.toLowerCase();
      const hintWords = lowerHint.split(/\s+/).filter(w => w.length > 2);

      const candidates: ProjectCandidate[] = projects.map(project => {
        const lowerTitle = project.title.toLowerCase();
        let score = 0;

        // Exact substring match
        if (lowerHint.includes(lowerTitle) || lowerTitle.includes(lowerHint)) {
          score += 0.5;
        }

        // Word overlap
        const titleWords = lowerTitle.split(/\s+/).filter(w => w.length > 2);
        const matchingWords = hintWords.filter(hw => 
          titleWords.some(tw => tw.includes(hw) || hw.includes(tw))
        );
        
        if (hintWords.length > 0) {
          score += (matchingWords.length / hintWords.length) * 0.5;
        }

        return {
          id: project.id,
          title: project.title,
          score: Math.min(1.0, score),
        };
      });

      // Sort by score descending, then by title
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.title.localeCompare(b.title);
      });

      // Return top candidates with score > 0, or all if none match
      const filtered = candidates.filter(c => c.score > 0);
      return { 
        success: true, 
        data: filtered.length > 0 ? filtered.slice(0, 5) : candidates.slice(0, 5),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get project candidates',
        },
      };
    }
  },

  /**
   * Confirm parsed details and create task (Requirement 8.5)
   * Allows user to modify parsed details before creation
   */
  async confirmAndCreate(
    userId: string,
    parsed: ParsedTask,
    modifications?: Partial<ConfirmAndCreateInput>
  ): Promise<ServiceResult<Task>> {
    try {
      // Merge parsed data with modifications
      const finalData = {
        title: modifications?.title ?? parsed.title,
        priority: modifications?.priority ?? parsed.priority,
        projectId: modifications?.projectId ?? parsed.projectId,
        planDate: modifications?.planDate !== undefined ? modifications.planDate : parsed.planDate,
        estimatedMinutes: modifications?.estimatedMinutes !== undefined 
          ? modifications.estimatedMinutes 
          : parsed.estimatedMinutes,
      };

      // Auto-create Inbox project if no project specified (BUG-5)
      if (!finalData.projectId) {
        let project = await prisma.project.findFirst({
          where: { userId, status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
        });
        if (!project) {
          project = await prisma.project.create({
            data: {
              title: 'Inbox',
              deliverable: 'Default inbox for quick tasks',
              userId,
              status: 'ACTIVE',
            },
          });
        }
        finalData.projectId = project.id;
      }

      // Create the task using taskService
      const result = await taskService.create(userId, {
        title: finalData.title,
        projectId: finalData.projectId,
        priority: finalData.priority,
        planDate: finalData.planDate,
        estimatedMinutes: finalData.estimatedMinutes,
      });

      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid task data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create task',
        },
      };
    }
  },
};

export default nlParserService;
