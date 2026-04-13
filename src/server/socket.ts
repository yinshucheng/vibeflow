/**
 * Socket.io Server Configuration
 * 
 * Implements WebSocket server for real-time communication between
 * the VibeFlow server (Vibe Brain) and Tentacle clients.
 * 
 * Octopus Architecture - Unified Event and Command Protocol
 * Requirements: 1.2, 1.4, 1.7, 2.3, 2.4, 2.6, 2.7, 9.1, 9.4, 10.2, 10.3, 10.7
 */

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { getToken } from 'next-auth/jwt';
import prisma from '@/lib/prisma';
import { userService } from '@/services/user.service';
import { authService } from '@/services/auth.service';
import { parseSystemState } from '@/machines/vibeflow.machine';
import type { SystemState } from '@/lib/state-utils';
import { activityLogService } from '@/services/activity-log.service';
import { timelineService, type TimelineEventTypeValue } from '@/services/timeline.service';
import { clientRegistryService } from '@/services/client-registry.service';
import { policyDistributionService } from '@/services/policy-distribution.service';
import { commandQueueService } from '@/services/command-queue.service';

import { pomodoroService } from '@/services/pomodoro.service';
import { timeSliceService } from '@/services/time-slice.service';
import { dailyStateService, getTodayDate } from '@/services/daily-state.service';
import { stateEngineService } from '@/services/state-engine.service';
import { chatService } from '@/services/chat.service';
import { handleToolConfirmation } from '@/services/chat-tools.service';
import { isWithinWorkHours } from '@/services/idle.service';
import { focusSessionService } from '@/services/focus-session.service';
import { habitReminderService } from '@/services/habit-reminder.service';
import { habitService } from '@/services/habit.service';
import { socketRateLimiter } from '@/middleware/rate-limit.middleware';
import {
  // Types
  type OctopusEvent,
  type OctopusCommand,
  type ClientType,
  type Policy,
  type BaseCommand,
  type SyncStateCommand,
  type ExecuteActionCommand,
  type UpdatePolicyCommand,
  type ShowUICommand,
  type ChatResponseCommand,
  type ChatSyncCommand,
  type ChatToolResultCommand,
  // Schemas for validation
  OctopusEventSchema,
  ActivityLogEventSchema,
  HeartbeatEventSchema,
  BrowserActivityEventSchema,
  BrowserSessionEventSchema,
  TabSwitchEventSchema,
  BrowserFocusEventSchema,
  StateChangeEventSchema,
  UserActionEventSchema,
  // Validation functions
  validateEvent,
} from '@/types/octopus';

// ============================================================================
// Types and Schemas
// ============================================================================

// Re-export SystemState from canonical source
export type { SystemState } from '@/lib/state-utils';

/**
 * Policy cache sent to clients (legacy format for backward compatibility)
 */
export interface PolicyCache {
  globalState: SystemState;
  blacklist: string[];
  whitelist: string[];
  sessionWhitelist: string[];
  lastSync: number;
}

/**
 * Activity log entry from Browser Sentinel (legacy format)
 */
export interface ActivityLogEntry {
  url: string;
  title?: string;
  duration: number; // seconds
  category: 'productive' | 'neutral' | 'distracting';
  timestamp?: number;
}

/**
 * Execute command types (legacy)
 */
export type ExecuteAction = 'INJECT_TOAST' | 'SHOW_OVERLAY' | 'REDIRECT' | 'POMODORO_COMPLETE' | 'IDLE_ALERT' | 'HABIT_REMINDER';

export interface ExecuteCommand {
  action: ExecuteAction;
  params: Record<string, unknown>;
}

/**
 * HABIT_REMINDER payload for execute commands
 */
export interface HabitReminderPayload {
  habitId: string;
  title: string;
  question?: string;
  streak: number;
  reminderType: 'fixed_time' | 'streak_protect' | 'daily_summary';
}

/**
 * Habit broadcast event payload types
 */
export type HabitBroadcastPayload =
  | { type: 'habit:created'; habit: Record<string, unknown> }
  | { type: 'habit:updated'; habit: Record<string, unknown> }
  | { type: 'habit:deleted'; habitId: string }
  | { type: 'habit:entry_updated'; entry: Record<string, unknown> }
  | { type: 'habit:entry_updated'; habitId: string; date: string };

/**
 * Idle alert command params
 */
export interface IdleAlertParams {
  idleSeconds: number;
  threshold: number;
  actions: string[];
  message?: string;
}

/**
 * Pomodoro completion event payload
 */
export interface PomodoroCompletePayload {
  pomodoroId: string;
  taskId: string;
  taskTitle: string;
  duration: number;
}

/**
 * Timeline event entry from Browser Sentinel
 * Requirements: 7.1, 7.2
 */
export interface TimelineEventEntry {
  type: TimelineEventTypeValue;
  startTime: number; // timestamp
  endTime?: number; // timestamp
  duration: number; // seconds
  title: string;
  metadata?: Record<string, unknown>;
}

/**
 * Block event from Browser Sentinel
 * Requirements: 7.4
 */
export interface BlockEventEntry {
  url: string;
  timestamp: number;
  blockType: 'hard_block' | 'soft_block' | 'entertainment_block';
  userAction?: 'proceeded' | 'returned';
  pomodoroId?: string;
}

/**
 * Interruption event from Browser Sentinel
 * Requirements: 7.4
 */
export interface InterruptionEventEntry {
  timestamp: number;
  duration: number; // seconds
  source: 'blocked_site' | 'tab_switch' | 'idle' | 'manual';
  pomodoroId: string;
  details?: {
    url?: string;
    idleSeconds?: number;
  };
}

// Server -> Client message types (Octopus Command Stream)
export interface ServerToClientEvents {
  // Legacy events (backward compatibility)
  SYNC_POLICY: (payload: PolicyCache) => void;
  STATE_CHANGE: (payload: { state: SystemState }) => void;
  EXECUTE: (payload: ExecuteCommand) => void;
  error: (payload: { code: string; message: string; details?: Record<string, unknown> }) => void;
  
  // Octopus Command Stream events
  OCTOPUS_COMMAND: (command: OctopusCommand) => void;
  COMMAND_ACK_REQUEST: (payload: { commandId: string }) => void;
  
  // Entertainment mode events (Requirements: 8.6, 10.3)
  ENTERTAINMENT_MODE_CHANGE: (payload: { isActive: boolean; sessionId: string | null; endTime: number | null }) => void;
  
  // MCP Event Stream events (Requirements: 10.1, 10.2, 10.3, 10.4)
  MCP_EVENT: (payload: MCPEventPayload) => void;

  // Habit tracking events
  'habit:entry_updated': (payload: { habitId: string; date: string; entry?: Record<string, unknown> }) => void;
  'habit:created': (payload: { habit: Record<string, unknown> }) => void;
  'habit:updated': (payload: { habit: Record<string, unknown> }) => void;
  'habit:deleted': (payload: { habitId: string }) => void;

  // Application-layer keepalive response (ADR-001)
  pong_custom: () => void;
}

// MCP Event payload type for Socket.io
export interface MCPEventPayload {
  id: string;
  type: string;
  userId: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}

// Client -> Server message types (Octopus Event Stream)
export interface ClientToServerEvents {
  // Legacy events (backward compatibility)
  ACTIVITY_LOG: (payload: ActivityLogEntry[]) => void;
  URL_CHECK: (payload: { url: string }, callback: (response: { allowed: boolean; action?: string }) => void) => void;
  USER_RESPONSE: (payload: { questionId: string; response: boolean }) => void;
  REQUEST_POLICY: () => void;
  TIMELINE_EVENT: (payload: TimelineEventEntry) => void;
  TIMELINE_EVENTS_BATCH: (payload: TimelineEventEntry[]) => void;
  BLOCK_EVENT: (payload: BlockEventEntry) => void;
  INTERRUPTION_EVENT: (payload: InterruptionEventEntry) => void;
  
  // Octopus Event Stream events
  OCTOPUS_EVENT: (event: OctopusEvent) => void;
  OCTOPUS_EVENTS_BATCH: (events: OctopusEvent[]) => void;
  COMMAND_ACK: (payload: { commandId: string }) => void;

  // Application-layer keepalive ping (ADR-001)
  ping_custom: () => void;
}

// Socket data attached to each connection
export interface SocketData {
  userId: string;
  email: string;
  isDevMode: boolean;
  connectedAt: number;
  // Octopus client registration data
  clientId?: string;
  clientType?: ClientType;
  clientVersion?: string;
  platform?: string;
  capabilities?: string[];
  // Guest connections (unauthenticated, can only do AUTH_LOGIN/AUTH_VERIFY)
  isGuest?: boolean;
}

// Legacy validation schemas (for backward compatibility)
const ActivityLogSchema = z.array(z.object({
  url: z.string().url(),
  title: z.string().optional(),
  duration: z.number().min(0),
  category: z.enum(['productive', 'neutral', 'distracting']),
  timestamp: z.number().optional(),
}));

const UrlCheckSchema = z.object({
  url: z.string(),
});

const UserResponseSchema = z.object({
  questionId: z.string(),
  response: z.boolean(),
});

// Timeline event validation schemas (Requirements: 7.1, 7.2)
const TimelineEventSchema = z.object({
  type: z.enum([
    'pomodoro',
    'distraction',
    'break',
    'scheduled_task',
    'activity_log',
    'block',
    'state_change',
    'interruption',
    'idle',
  ]),
  startTime: z.number(),
  endTime: z.number().optional(),
  duration: z.number().min(0),
  title: z.string().min(1).max(500),
  metadata: z.record(z.unknown()).optional(),
});

const TimelineEventBatchSchema = z.array(TimelineEventSchema);

const BlockEventSchema = z.object({
  url: z.string(),
  timestamp: z.number(),
  blockType: z.enum(['hard_block', 'soft_block', 'entertainment_block']),
  userAction: z.enum(['proceeded', 'returned']).optional(),
  pomodoroId: z.string().optional(),
});

const InterruptionEventSchema = z.object({
  timestamp: z.number(),
  duration: z.number().min(0),
  source: z.enum(['blocked_site', 'tab_switch', 'idle', 'manual']),
  pomodoroId: z.string(),
  details: z.object({
    url: z.string().optional(),
    idleSeconds: z.number().optional(),
  }).optional(),
});

// ============================================================================
// Socket Server Class
// ============================================================================

export class VibeFlowSocketServer {
  private io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> | null = null;
  private userRooms: Map<string, Set<string>> = new Map(); // userId -> Set of socket IDs
  private staleClientCheckInterval: ReturnType<typeof setInterval> | null = null;
  private commandCleanupInterval: ReturnType<typeof setInterval> | null = null;
  private overRestCheckInterval: ReturnType<typeof setInterval> | null = null;
  private habitReminderInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Initialize the Socket.io server
   */
  initialize(httpServer: HttpServer): Server {
    this.io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingInterval: 15000, // 15s — keep under NAT idle timeout (30-60s)
      pingTimeout: 20000, // 20s — faster dead connection detection
    });

    // Authentication middleware — allows guest connections for WS-based login
    this.io.use(async (socket, next) => {
      try {
        const auth = await this.authenticateSocket(socket);
        if (auth.success && auth.data) {
          socket.data = auth.data;
        } else {
          // Allow guest connections — they can only use AUTH_LOGIN/AUTH_VERIFY
          socket.data = {
            userId: '',
            email: '',
            isDevMode: false,
            connectedAt: Date.now(),
            clientType: 'mobile' as ClientType,
            clientVersion: '1.0.0',
            platform: 'unknown',
            capabilities: [],
            isGuest: true,
          } as SocketData;
        }
        next();
      } catch (error) {
        next(new Error('Authentication error'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket) => {
      if ((socket.data as SocketData & { isGuest?: boolean }).isGuest) {
        this.handleGuestConnection(socket);
      } else {
        this.handleConnection(socket);
      }
    });

    // Start periodic tasks
    this.startPeriodicTasks();

    console.log('[Socket.io] Server initialized with Octopus Architecture support');
    return this.io;
  }

  /**
   * Start periodic background tasks
   */
  private startPeriodicTasks(): void {
    // Check for stale clients every 30 seconds
    this.staleClientCheckInterval = setInterval(async () => {
      try {
        const result = await clientRegistryService.markStaleClientsOffline(30000);
        if (result.success && result.data && result.data.count > 0) {
          console.log(`[Socket.io] Marked ${result.data.count} stale clients as offline`);
        }
      } catch (error) {
        console.error('[Socket.io] Error checking stale clients:', error);
      }
    }, 30000);

    // Cleanup expired commands every minute
    this.commandCleanupInterval = setInterval(async () => {
      try {
        const result = await commandQueueService.cleanupExpired();
        if (result.success && result.data && result.data.count > 0) {
          console.log(`[Socket.io] Cleaned up ${result.data.count} expired commands`);
        }
      } catch (error) {
        console.error('[Socket.io] Error cleaning up commands:', error);
      }
    }, 60000);

    // Fallback: check over rest status for all connected users every 30 seconds
    // Primary trigger is StateEngine's delayed timer (scheduleOverRestTimer).
    // This interval serves as a fallback for timer loss (e.g., server restart)
    // and also handles WORK_TIME_ENDED (OVER_REST → IDLE when work hours end).
    this.overRestCheckInterval = setInterval(async () => {
      try {
        const connectedUserIds = this.getConnectedUserIds();
        for (const userId of connectedUserIds) {
          try {
            const currentState = await stateEngineService.getState(userId);
            // isWithinWorkHours and focusSessionService imported at top of file
            const settings = await prisma.userSettings.findFirst({ where: { userId } });
            const workTimeSlots = (settings?.workTimeSlots as unknown as { id: string; startTime: string; endTime: string; enabled: boolean }[]) || [];
            const withinWorkHours = isWithinWorkHours(workTimeSlots);

            // Check focus session status (used for both entry and exit conditions)
            const focusSessionResult = await focusSessionService.isInFocusSession(userId);
            if (!focusSessionResult.success) {
              // DB error — skip this user to avoid wrong state transitions
              continue;
            }
            const inFocusSession = focusSessionResult.data === true;

            if (currentState === 'idle' && (withinWorkHours || inFocusSession)) {
              // Attempt ENTER_OVER_REST during work hours OR when in focus session
              const dailyState = await dailyStateService.getOrCreateToday(userId);
              if (dailyState.success && dailyState.data?.lastPomodoroEndTime) {
                const shortRestDuration = (settings as Record<string, unknown> | null)?.shortRestDuration as number ?? 5;
                const gracePeriod = (settings as Record<string, unknown> | null)?.overRestGracePeriod as number ?? 5;
                const elapsed = (Date.now() - dailyState.data!.lastPomodoroEndTime!.getTime()) / 60000;
                if (elapsed >= shortRestDuration + gracePeriod) {
                  await stateEngineService.send(userId, { type: 'ENTER_OVER_REST' });
                }
              }
            } else if (currentState === 'over_rest' && !withinWorkHours && !inFocusSession) {
              // Work hours ended AND no focus session — exit OVER_REST
              await stateEngineService.send(userId, { type: 'WORK_TIME_ENDED' });
            }
            // Always broadcast policy update for iOS UPDATE_POLICY channel
            await this.broadcastPolicyUpdate(userId);
          } catch {
            // Individual user errors don't stop the loop
          }
        }
      } catch (error) {
        console.error('[Socket.io] Error in overRestCheck interval:', error);
      }
    }, 30000);

    // Check habit reminders every 60 seconds
    this.habitReminderInterval = setInterval(async () => {
      try {
        const connectedUserIds = this.getConnectedUserIds();
        await habitReminderService.tick(connectedUserIds);
      } catch (error) {
        console.error('[Socket.io] Error in habitReminder interval:', error);
      }
    }, 60_000);
  }

  /**
   * Stop periodic background tasks
   */
  private stopPeriodicTasks(): void {
    if (this.staleClientCheckInterval) {
      clearInterval(this.staleClientCheckInterval);
      this.staleClientCheckInterval = null;
    }
    if (this.commandCleanupInterval) {
      clearInterval(this.commandCleanupInterval);
      this.commandCleanupInterval = null;
    }
    if (this.overRestCheckInterval) {
      clearInterval(this.overRestCheckInterval);
      this.overRestCheckInterval = null;
    }
    if (this.habitReminderInterval) {
      clearInterval(this.habitReminderInterval);
      this.habitReminderInterval = null;
    }
  }

  /**
   * Authenticate socket connection
   * Supports both API token and dev mode authentication
   * Requirements: 1.6, 13.2
   */
  private async authenticateSocket(socket: Socket): Promise<{
    success: boolean;
    data?: SocketData;
    error?: { code: string; message: string };
  }> {
    const { token, email, clientType, clientVersion, platform, capabilities } = socket.handshake.auth;
    const devEmail = socket.handshake.headers['x-dev-user-email'] as string | undefined;

    // Dev mode: accept email-based auth (from auth payload or header)
    if (userService.isDevModeEnabled()) {
      const userEmail = email || devEmail;
      if (userEmail) {
        const result = await userService.getOrCreateDevUser(userEmail);
        if (result.success && result.data) {
          return {
            success: true,
            data: {
              userId: result.data.id,
              email: result.data.email,
              isDevMode: true,
              connectedAt: Date.now(),
              clientType: clientType as ClientType || 'web',
              clientVersion: clientVersion || '1.0.0',
              platform: platform || 'unknown',
              capabilities: capabilities || [],
            },
          };
        }
      }
      // Dev mode continues to formal auth paths below (allows testing production flow)
    }

    // NextAuth cookie authentication (for Web and Browser Extension)
    // Extension sends empty auth payload — relies on handshake headers cookie
    try {
      const jwtToken = await getToken({
        req: socket.request as Parameters<typeof getToken>[0]['req'],
        secret: process.env.NEXTAUTH_SECRET,
      });
      if (jwtToken?.id && jwtToken?.email) {
        console.log(`[Socket.io] Authenticated via NextAuth cookie: ${jwtToken.email}`);
        return {
          success: true,
          data: {
            userId: jwtToken.id as string,
            email: jwtToken.email as string,
            isDevMode: false,
            connectedAt: Date.now(),
            clientType: clientType as ClientType || 'web',
            clientVersion: clientVersion || '1.0.0',
            platform: platform || 'unknown',
            capabilities: capabilities || [],
          },
        };
      }
    } catch {
      // Cookie parsing failed, fall through to API token auth
    }

    // API token authentication (for Desktop, Mobile, MCP, Skill)
    if (token && token.startsWith('vf_')) {
      const validationResult = await authService.validateToken(token);

      if (validationResult.success && validationResult.data?.valid) {
        const user = await prisma.user.findUnique({
          where: { id: validationResult.data.userId },
        });

        if (user) {
          console.log(`[Socket.io] Authenticated via API token: ${user.email} (${validationResult.data.clientType})`);
          return {
            success: true,
            data: {
              userId: user.id,
              email: user.email,
              isDevMode: false,
              connectedAt: Date.now(),
              clientType: validationResult.data.clientType || clientType as ClientType || 'browser_ext',
              clientVersion: clientVersion || '1.0.0',
              platform: platform || 'unknown',
              capabilities: capabilities || [],
            },
          };
        }
      }
    }

    // Dev mode fallback: use default dev user when no auth info provided
    if (userService.isDevModeEnabled()) {
      const result = await userService.getOrCreateDevUser(userService.getDevModeConfig().defaultUserEmail);
      if (result.success && result.data) {
        return {
          success: true,
          data: {
            userId: result.data.id,
            email: result.data.email,
            isDevMode: true,
            connectedAt: Date.now(),
            clientType: clientType as ClientType || 'web',
            clientVersion: clientVersion || '1.0.0',
            platform: platform || 'unknown',
            capabilities: capabilities || [],
          },
        };
      }
    }

    // No valid authentication provided
    console.log('[Socket.io] Authentication failed: no valid credentials');
    return {
      success: false,
      error: { code: 'AUTH_ERROR', message: 'Invalid authentication credentials' },
    };
  }


  /**
   * Handle guest (unauthenticated) socket connections.
   * Only allows AUTH_LOGIN and AUTH_VERIFY events.
   * Used when HTTP fetch is blocked (e.g., carrier DPI on non-standard ports).
   */
  private handleGuestConnection(socket: Socket): void {
    console.log(`[Socket.io] Guest connection: ${socket.id}`);

    // Auto-disconnect guests after 30 seconds to prevent resource abuse
    const guestTimeout = setTimeout(() => {
      console.log(`[Socket.io] Guest timeout, disconnecting: ${socket.id}`);
      socket.disconnect(true);
    }, 30000);

    // Application-layer keepalive for guests too
    socket.on('ping_custom', () => {
      socket.emit('pong_custom');
    });

    socket.on('AUTH_LOGIN', async (payload: { email: string; password: string; clientType?: string }, callback?: (response: unknown) => void) => {
      try {
        if (!payload.email || !payload.password) {
          const error = { success: false, error: { code: 'VALIDATION_ERROR', message: 'Email and password required' } };
          if (callback) callback(error);
          else socket.emit('AUTH_RESULT' as never, error as never);
          return;
        }

        const user = await prisma.user.findUnique({ where: { email: payload.email } });
        if (!user || user.password === 'dev_mode_no_password') {
          const error = { success: false, error: { code: 'AUTH_ERROR', message: 'Invalid credentials' } };
          if (callback) callback(error);
          else socket.emit('AUTH_RESULT' as never, error as never);
          return;
        }

        const valid = await (await import('@/lib/auth')).verifyPassword(payload.password, user.password);
        if (!valid) {
          const error = { success: false, error: { code: 'AUTH_ERROR', message: 'Invalid credentials' } };
          if (callback) callback(error);
          else socket.emit('AUTH_RESULT' as never, error as never);
          return;
        }

        // Create API token
        const clientType = (payload.clientType || 'mobile') as 'web' | 'desktop' | 'browser_ext' | 'mobile';
        const name = `${clientType}-${new Date().toISOString().slice(0, 10)}`;
        const result = await authService.createToken(user.id, { name, clientType, expiresInDays: 90 });

        if (!result.success || !result.data) {
          const error = { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create token' } };
          if (callback) callback(error);
          else socket.emit('AUTH_RESULT' as never, error as never);
          return;
        }

        const response = {
          success: true,
          token: result.data.token,
          user: { id: user.id, email: user.email },
          expiresAt: result.data.tokenInfo.expiresAt,
        };
        console.log(`[Socket.io] Guest AUTH_LOGIN success: ${user.email}`);
        if (callback) callback(response);
        else socket.emit('AUTH_RESULT' as never, response as never);

        // Disconnect guest — client should reconnect with the token
        clearTimeout(guestTimeout);
        setTimeout(() => socket.disconnect(true), 1000);
      } catch (error) {
        console.error('[Socket.io] AUTH_LOGIN error:', error);
        const err = { success: false, error: { code: 'INTERNAL_ERROR', message: 'Login failed' } };
        if (callback) callback(err);
        else socket.emit('AUTH_RESULT' as never, err as never);
      }
    });

    socket.on('AUTH_VERIFY', async (payload: { token: string }, callback?: (response: unknown) => void) => {
      try {
        if (!payload.token) {
          const error = { success: false };
          if (callback) callback(error);
          else socket.emit('AUTH_RESULT' as never, error as never);
          return;
        }

        const validationResult = await authService.validateToken(payload.token);
        if (!validationResult.success || !validationResult.data?.valid || !validationResult.data.userId) {
          const error = { success: false };
          if (callback) callback(error);
          else socket.emit('AUTH_RESULT' as never, error as never);
          return;
        }

        const user = await prisma.user.findUnique({
          where: { id: validationResult.data.userId },
          select: { id: true, email: true },
        });

        if (!user) {
          const error = { success: false };
          if (callback) callback(error);
          else socket.emit('AUTH_RESULT' as never, error as never);
          return;
        }

        const response = { success: true, user: { id: user.id, email: user.email } };
        if (callback) callback(response);
        else socket.emit('AUTH_RESULT' as never, response as never);

        clearTimeout(guestTimeout);
        setTimeout(() => socket.disconnect(true), 1000);
      } catch (error) {
        console.error('[Socket.io] AUTH_VERIFY error:', error);
        const err = { success: false };
        if (callback) callback(err);
        else socket.emit('AUTH_RESULT' as never, err as never);
      }
    });

    socket.on('disconnect', () => {
      clearTimeout(guestTimeout);
    });
  }

  /**
   * Handle new socket connection
   * Requirements: 1.7, 9.1
   */
  private async handleConnection(socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>): Promise<void> {
    const { userId, email, clientType, clientVersion, platform, capabilities } = socket.data;
    
    // Join user-specific room
    const userRoom = `user:${userId}`;
    socket.join(userRoom);
    
    // Track socket in user rooms
    if (!this.userRooms.has(userId)) {
      this.userRooms.set(userId, new Set());
    }
    this.userRooms.get(userId)!.add(socket.id);

    console.log(`[Socket.io] Client connected: ${socket.id} (user: ${email}, type: ${clientType || 'unknown'})`);

    // Register client in the registry (Requirements: 9.1, 9.2)
    if (clientType) {
      const registerResult = await clientRegistryService.register({
        socketId: socket.id,
        userId,
        clientType: clientType as ClientType,
        clientVersion: clientVersion || '1.0.0',
        platform: platform || 'unknown',
        capabilities: capabilities || [],
      });

      if (registerResult.success && registerResult.data) {
        socket.data.clientId = registerResult.data.clientId;
        console.log(`[Socket.io] Registered client: ${registerResult.data.clientId}`);

        // Send registration confirmation to client (for desktop/mobile clients)
        // Include userId so DEV_MODE clients can resolve their identity
        socket.emit('client:registered' as keyof ServerToClientEvents, {
          success: true,
          clientId: registerResult.data.clientId,
          userId,
        } as never);
      } else {
        console.error('[Socket.io] Failed to register client:', registerResult.error);
        socket.emit('client:registered' as keyof ServerToClientEvents, {
          success: false,
          error: registerResult.error?.message || 'Registration failed',
        } as never);
      }
    }

    // Send initial policy sync (Requirements: 1.7, 10.7)
    await this.sendPolicyToSocket(socket);

    // Send current state snapshot (Requirements: 1.7)
    await this.sendStateSnapshotToSocket(socket);

    // Deliver any pending commands (Requirements: 2.7)
    if (socket.data.clientId) {
      await this.deliverPendingCommands(socket);
    }

    // Register event handlers
    this.registerEventHandlers(socket);

    // Application-layer keepalive: reply to client's ping_custom with pong_custom
    // This keeps the connection alive through NAT gateways (frp TCP tunnels, mobile networks)
    socket.on('ping_custom', () => {
      socket.emit('pong_custom');
    });

    // Send cold-start CHAT_SYNC if user has an active conversation with history (BUG-3)
    try {
      const convResult = await chatService.getOrCreateDefaultConversation(userId);
      if (convResult.success && convResult.data) {
        const historyResult = await chatService.getHistory(userId, convResult.data.id, 50);
        if (historyResult.success && historyResult.data && historyResult.data.length > 0) {
          const syncCommand: ChatSyncCommand = {
            commandId: crypto.randomUUID(),
            commandType: 'CHAT_SYNC',
            targetClient: 'all',
            priority: 'normal',
            requiresAck: false,
            createdAt: Date.now(),
            payload: {
              conversationId: convResult.data.id,
              messages: historyResult.data.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                metadata: m.metadata as Record<string, unknown> | undefined,
                createdAt: m.createdAt.toISOString(),
              })),
            },
          };
          socket.emit('OCTOPUS_COMMAND', syncCommand);
          console.log(`[Socket.io] Cold-start CHAT_SYNC sent to ${socket.id} for user ${email}, ${historyResult.data.length} messages`);
        }
      }
    } catch (err) {
      console.error(`[Socket.io] Failed to send cold-start CHAT_SYNC:`, err);
    }

    // Handle disconnection (Requirements: 9.4)
    socket.on('disconnect', async (reason) => {
      console.log(`[Socket.io] Client disconnected: ${socket.id} (reason: ${reason})`);
      
      const userSockets = this.userRooms.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          this.userRooms.delete(userId);
        }
      }

      // Mark client as disconnected in registry
      if (socket.data.clientId) {
        await clientRegistryService.markDisconnected(socket.data.clientId);
      }
    });
  }

  /**
   * Register event handlers for a socket
   * Requirements: 1.2, 2.3
   */
  private registerEventHandlers(socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>): void {
    // ========================================================================
    // Octopus Event Stream handlers (new protocol)
    // ========================================================================
    
    // Handle single Octopus event
    socket.on('OCTOPUS_EVENT', async (event) => {
      await this.handleOctopusEvent(socket, event);
    });

    // Handle batch of Octopus events
    socket.on('OCTOPUS_EVENTS_BATCH', async (events) => {
      await this.handleOctopusEventsBatch(socket, events);
    });

    // Handle command acknowledgment (Requirements: 2.6)
    socket.on('COMMAND_ACK', async (payload) => {
      await this.handleCommandAck(socket, payload);
    });

    // ========================================================================
    // Legacy event handlers (backward compatibility)
    // ========================================================================
    
    // Handle activity log submission
    socket.on('ACTIVITY_LOG', async (payload) => {
      await this.handleActivityLog(socket, payload);
    });

    // Handle URL check request
    socket.on('URL_CHECK', async (payload, callback) => {
      await this.handleUrlCheck(socket, payload, callback);
    });

    // Handle user response to soft intervention
    socket.on('USER_RESPONSE', async (payload) => {
      await this.handleUserResponse(socket, payload);
    });

    // Handle policy request
    socket.on('REQUEST_POLICY', async () => {
      await this.sendPolicyToSocket(socket);
    });

    // Handle timeline event submission (Requirements: 7.1, 7.2)
    socket.on('TIMELINE_EVENT', async (payload) => {
      await this.handleTimelineEvent(socket, payload);
    });

    // Handle batch timeline events submission
    socket.on('TIMELINE_EVENTS_BATCH', async (payload) => {
      await this.handleTimelineEventsBatch(socket, payload);
    });

    // Handle block event submission (Requirements: 7.4)
    socket.on('BLOCK_EVENT', async (payload) => {
      await this.handleBlockEvent(socket, payload);
    });

    // Handle interruption event submission (Requirements: 7.4)
    socket.on('INTERRUPTION_EVENT', async (payload) => {
      await this.handleInterruptionEvent(socket, payload);
    });
  }

  // ==========================================================================
  // Octopus Event Stream Handlers
  // ==========================================================================

  /**
   * Handle a single Octopus event
   * Requirements: 1.2, 2.3, 13.5
   */
  private async handleOctopusEvent(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    event: unknown
  ): Promise<void> {
    try {
      const { userId } = socket.data;
      
      // Apply rate limiting (Requirements: 13.5)
      const rateLimitResult = socketRateLimiter.checkEvent(userId);
      if (!rateLimitResult.success) {
        socket.emit('error', {
          code: rateLimitResult.error!.code,
          message: rateLimitResult.error!.message,
          details: { retryAfter: rateLimitResult.error!.retryAfter },
        });
        return;
      }
      
      // Fill in userId from auth before validation (mobile clients may not have it)
      if (typeof event === 'object' && event !== null) {
        const evt = event as Record<string, unknown>;
        if (!evt.userId || evt.userId === '' || evt.userId === 'dev-user') {
          evt.userId = userId;
        }
      }

      // Validate event using Zod schema
      const validationResult = validateEvent(event);
      
      if (!validationResult.success) {
        console.error('[Socket.io] Invalid Octopus event:', validationResult.error);
        socket.emit('error', {
          code: validationResult.error.code,
          message: validationResult.error.message,
          details: validationResult.error.details,
        });
        return;
      }

      const validatedEvent = validationResult.data;

      // Verify event userId matches socket userId (allow empty for mobile clients)
      if (validatedEvent.userId && validatedEvent.userId !== userId) {
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: 'Event userId does not match authenticated user',
        });
        return;
      }
      // Fill in userId from auth if not provided
      if (!validatedEvent.userId) {
        validatedEvent.userId = userId;
      }

      // Process event based on type
      await this.processOctopusEvent(socket, validatedEvent);

    } catch (error) {
      console.error('[Socket.io] Error handling Octopus event:', error);
      socket.emit('error', {
        code: 'INTERNAL_ERROR',
        message: 'Failed to process event',
      });
    }
  }

  /**
   * Handle batch of Octopus events
   * Requirements: 1.2, 2.3, 13.5
   */
  private async handleOctopusEventsBatch(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    events: unknown[]
  ): Promise<void> {
    if (!Array.isArray(events)) {
      socket.emit('error', {
        code: 'VALIDATION_ERROR',
        message: 'Events must be an array',
      });
      return;
    }

    // Limit batch size
    if (events.length > 50) {
      socket.emit('error', {
        code: 'VALIDATION_ERROR',
        message: 'Batch size exceeds maximum of 50 events',
      });
      return;
    }

    const { userId } = socket.data;
    
    // Apply rate limiting for the entire batch (Requirements: 13.5)
    const rateLimitResult = socketRateLimiter.checkBatch(userId, events.length);
    if (!rateLimitResult.success) {
      socket.emit('error', {
        code: rateLimitResult.error!.code,
        message: rateLimitResult.error!.message,
        details: { retryAfter: rateLimitResult.error!.retryAfter },
      });
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const event of events) {
      try {
        const validationResult = validateEvent(event);
        
        if (!validationResult.success) {
          errorCount++;
          continue;
        }

        const validatedEvent = validationResult.data;
        
        // Verify event userId matches socket userId
        if (validatedEvent.userId !== socket.data.userId) {
          errorCount++;
          continue;
        }

        await this.processOctopusEvent(socket, validatedEvent);
        successCount++;
      } catch (error) {
        errorCount++;
      }
    }

    console.log(`[Socket.io] Processed batch: ${successCount} success, ${errorCount} errors`);
  }

  /**
   * Process a validated Octopus event
   * Requirements: 1.2
   */
  private async processOctopusEvent(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    event: OctopusEvent
  ): Promise<void> {
    const { userId } = socket.data;

    switch (event.eventType) {
      case 'ACTIVITY_LOG':
        await this.processActivityLogEvent(userId, event);
        break;

      case 'HEARTBEAT':
        await this.processHeartbeatEvent(socket, event);
        break;

      case 'BROWSER_ACTIVITY':
        await this.processBrowserActivityEvent(userId, event);
        break;

      case 'BROWSER_SESSION':
        await this.processBrowserSessionEvent(userId, event);
        break;

      case 'TAB_SWITCH':
        await this.processTabSwitchEvent(userId, event);
        break;

      case 'BROWSER_FOCUS':
        await this.processBrowserFocusEvent(userId, event);
        break;

      case 'STATE_CHANGE':
        await this.processStateChangeEvent(userId, event);
        break;

      case 'USER_ACTION':
        await this.processUserActionEvent(userId, event);
        break;

      case 'CHAT_MESSAGE':
        await this.processChatMessageEvent(socket, userId, event);
        break;

      case 'CHAT_ACTION':
        await this.processChatActionEvent(socket, userId, event);
        break;

      case 'CHAT_HISTORY_REQUEST':
        await this.processChatHistoryRequest(socket, userId);
        break;

      default:
        console.log(`[Socket.io] Unhandled event type: ${(event as OctopusEvent).eventType}`);
    }
  }

  /**
   * Process ACTIVITY_LOG event
   */
  private async processActivityLogEvent(userId: string, event: OctopusEvent): Promise<void> {
    if (event.eventType !== 'ACTIVITY_LOG') return;

    const { payload } = event;
    
    // Map Octopus source to activity log source
    const sourceMap: Record<string, 'chrome_ext' | 'desktop_ghost' | 'mcp_agent'> = {
      'browser': 'chrome_ext',
      'desktop_app': 'desktop_ghost',
      'mobile_app': 'chrome_ext', // Mobile uses same source as browser for now
    };
    
    await activityLogService.create(userId, {
      url: payload.identifier,
      title: payload.title,
      duration: payload.duration,
      category: payload.category,
      source: sourceMap[payload.source] || 'chrome_ext',
      timestamp: new Date(event.timestamp),
    });

    console.log(`[Socket.io] Processed ACTIVITY_LOG for user ${userId}`);
  }

  /**
   * Process HEARTBEAT event
   * Requirements: 9.2
   */
  private async processHeartbeatEvent(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    event: OctopusEvent
  ): Promise<void> {
    if (event.eventType !== 'HEARTBEAT') return;

    const { clientId } = socket.data;
    
    if (clientId) {
      // Update client metadata and last seen time
      await clientRegistryService.updateMetadata(clientId, {
        clientVersion: event.payload.clientVersion,
        platform: event.payload.platform,
        capabilities: event.payload.capabilities,
        localStateHash: event.payload.localStateHash,
      });
    }

    console.log(`[Socket.io] Processed HEARTBEAT from client ${clientId || socket.id}`);
  }

  /**
   * Process BROWSER_ACTIVITY event
   */
  private async processBrowserActivityEvent(userId: string, event: OctopusEvent): Promise<void> {
    if (event.eventType !== 'BROWSER_ACTIVITY') return;

    const { payload } = event;
    
    // Store as activity log
    await activityLogService.create(userId, {
      url: payload.url,
      title: payload.title,
      duration: payload.duration,
      category: payload.category,
      source: 'chrome_ext',
      timestamp: new Date(payload.startTime),
    });

    // Also create timeline event for detailed tracking
    await timelineService.createWithDedup(userId, {
      type: 'activity_log',
      startTime: new Date(payload.startTime),
      endTime: new Date(payload.endTime),
      duration: payload.duration,
      title: `${payload.title} (${payload.domain})`,
      metadata: {
        url: payload.url,
        domain: payload.domain,
        scrollDepth: payload.scrollDepth,
        interactionCount: payload.interactionCount,
        activeDuration: payload.activeDuration,
        idleTime: payload.idleTime,
        productivityScore: payload.productivityScore,
        isMediaPlaying: payload.isMediaPlaying,
        searchQuery: payload.searchQuery,
      },
      source: 'browser_sentinel',
    });

    console.log(`[Socket.io] Processed BROWSER_ACTIVITY for user ${userId}: ${payload.domain}`);
  }

  /**
   * Process BROWSER_SESSION event
   */
  private async processBrowserSessionEvent(userId: string, event: OctopusEvent): Promise<void> {
    if (event.eventType !== 'BROWSER_SESSION') return;

    const { payload } = event;
    
    // Store session summary as timeline event
    await timelineService.createWithDedup(userId, {
      type: 'activity_log',
      startTime: new Date(payload.startTime),
      endTime: new Date(payload.endTime),
      duration: payload.totalDuration,
      title: `Browser Session (${payload.uniqueDomainsVisited} domains)`,
      metadata: {
        sessionId: payload.sessionId,
        activeDuration: payload.activeDuration,
        tabSwitchCount: payload.tabSwitchCount,
        rapidTabSwitches: payload.rapidTabSwitches,
        productiveTime: payload.productiveTime,
        distractingTime: payload.distractingTime,
        neutralTime: payload.neutralTime,
        productivityScore: payload.productivityScore,
        domainBreakdown: payload.domainBreakdown,
      },
      source: 'browser_sentinel',
    });

    console.log(`[Socket.io] Processed BROWSER_SESSION for user ${userId}: ${payload.sessionId}`);
  }

  /**
   * Process TAB_SWITCH event
   */
  private async processTabSwitchEvent(userId: string, event: OctopusEvent): Promise<void> {
    if (event.eventType !== 'TAB_SWITCH') return;

    const { payload } = event;
    
    // Only log rapid switches as potential distractions
    if (payload.isRapidSwitch) {
      await timelineService.createWithDedup(userId, {
        type: 'distraction',
        startTime: new Date(event.timestamp),
        duration: 0,
        title: `Rapid tab switch: ${payload.fromDomain} → ${payload.toDomain}`,
        metadata: {
          fromUrl: payload.fromUrl,
          toUrl: payload.toUrl,
          timeSinceLastSwitch: payload.timeSinceLastSwitch,
        },
        source: 'browser_sentinel',
      });
    }

    console.log(`[Socket.io] Processed TAB_SWITCH for user ${userId}: rapid=${payload.isRapidSwitch}`);
  }

  /**
   * Process BROWSER_FOCUS event
   */
  private async processBrowserFocusEvent(userId: string, event: OctopusEvent): Promise<void> {
    if (event.eventType !== 'BROWSER_FOCUS') return;

    const { payload } = event;
    
    // Log focus changes for analytics
    console.log(`[Socket.io] Browser focus changed for user ${userId}: ${payload.isFocused ? 'gained' : 'lost'}`);
  }

  /**
   * Process STATE_CHANGE event
   */
  private async processStateChangeEvent(userId: string, event: OctopusEvent): Promise<void> {
    if (event.eventType !== 'STATE_CHANGE') return;

    const { payload } = event;
    
    await timelineService.createWithDedup(userId, {
      type: 'state_change',
      startTime: new Date(payload.timestamp),
      duration: 0,
      title: `State: ${payload.previousState} → ${payload.newState}`,
      metadata: {
        previousState: payload.previousState,
        newState: payload.newState,
        trigger: payload.trigger,
      },
      source: 'browser_sentinel',
    });

    console.log(`[Socket.io] Processed STATE_CHANGE for user ${userId}: ${payload.previousState} → ${payload.newState}`);
  }

  /**
   * Process USER_ACTION event from iOS client
   * Dispatches to business services and sends ACTION_RESULT back
   */
  private async processUserActionEvent(userId: string, event: OctopusEvent): Promise<void> {
    if (event.eventType !== 'USER_ACTION') return;

    const { payload } = event;
    // iOS client sends { actionType, optimisticId, data }
    const actionType = payload.actionType as string;
    const rawPayload = payload as unknown as Record<string, unknown>;
    const optimisticId = rawPayload.optimisticId as string | undefined;
    const data = (rawPayload.data ?? payload.parameters ?? {}) as Record<string, unknown>;

    console.log(`[Socket.io] Processing USER_ACTION for user ${userId}: ${actionType}, optimisticId: ${optimisticId}`);

    let success = false;
    let error: { code: string; message: string } | undefined;
    let resultData: Record<string, unknown> | undefined;

    try {
      switch (actionType) {
        case 'POMODORO_START': {
          const taskId = data.taskId as string | undefined;
          const result = await pomodoroService.start(userId, { taskId: taskId ?? null });
          if (result.success && result.data) {
            const pom = result.data as { id: string; taskId: string | null };
            // Transition state via StateEngine (handles state write, broadcast,
            // policy update, MCP event, logging, and OVER_REST timer scheduling)
            const transition = await stateEngineService.send(userId, {
              type: 'START_POMODORO',
              pomodoroId: pom.id,
              taskId: pom.taskId,
            });
            if (transition.success) {
              success = true;
              resultData = { pomodoroId: pom.id };
            } else {
              // Guard rejected — clean up the created pomodoro
              await pomodoroService.abort(pom.id, userId).catch(() => {});
              error = { code: 'FORBIDDEN', message: transition.message };
            }
          } else {
            error = result.error ?? { code: 'UNKNOWN', message: 'Failed to start pomodoro' };
          }
          break;
        }

        case 'TASK_COMPLETE': {
          const taskId = data.taskId as string;
          if (taskId) {
            await prisma.task.update({
              where: { id: taskId, userId },
              data: { status: 'DONE' },
            });
            success = true;
            await this.broadcastFullStateToUser(userId);
          } else {
            error = { code: 'VALIDATION_ERROR', message: 'taskId is required' };
          }
          break;
        }

        case 'TASK_STATUS_CHANGE': {
          const taskId = data.taskId as string;
          const status = data.status as 'TODO' | 'IN_PROGRESS' | 'DONE';
          if (taskId && status) {
            await prisma.task.update({
              where: { id: taskId, userId },
              data: { status },
            });
            success = true;
            await this.broadcastFullStateToUser(userId);
          } else {
            error = { code: 'VALIDATION_ERROR', message: 'taskId and status are required' };
          }
          break;
        }

        case 'TOP3_SET': {
          const taskIds = data.taskIds as string[];
          if (taskIds && Array.isArray(taskIds)) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            await prisma.dailyState.upsert({
              where: { userId_date: { userId, date: today } },
              update: { top3TaskIds: taskIds },
              create: { userId, date: today, systemState: 'IDLE', top3TaskIds: taskIds },
            });
            success = true;
            await this.broadcastFullStateToUser(userId);
          } else {
            error = { code: 'VALIDATION_ERROR', message: 'taskIds array is required' };
          }
          break;
        }

        case 'POMODORO_SWITCH_TASK': {
          const newTaskId = data.newTaskId as string | null;
          // Find active pomodoro with open time slice
          const pomodoro = await prisma.pomodoro.findFirst({
            where: { userId, status: 'IN_PROGRESS' },
            include: { timeSlices: { where: { endTime: null }, take: 1 } },
          });
          if (!pomodoro) {
            error = { code: 'NOT_FOUND', message: 'No active pomodoro' };
            break;
          }
          const currentSliceId = pomodoro.timeSlices[0]?.id ?? null;
          const switchResult = await timeSliceService.switchTask(
            pomodoro.id, currentSliceId, newTaskId ?? null
          );
          if (switchResult.success) {
            await prisma.pomodoro.update({
              where: { id: pomodoro.id },
              data: { taskId: newTaskId ?? null },
            });
            success = true;
            resultData = { pomodoroId: pomodoro.id, newTaskId };
            await this.broadcastFullStateToUser(userId);
          } else {
            error = switchResult.error ?? { code: 'UNKNOWN', message: 'Switch failed' };
          }
          break;
        }

        case 'HABIT_GET_TODAY': {
          const result = await habitService.getTodayHabits(userId);
          if (result.success) {
            success = true;
            resultData = { habits: result.data } as unknown as Record<string, unknown>;
          } else {
            error = result.error ?? { code: 'UNKNOWN', message: 'Failed to get today habits' };
          }
          break;
        }

        case 'HABIT_LIST': {
          const statusFilter = data.status as string | undefined;
          const result = await habitService.listByUser(
            userId,
            statusFilter ? { status: statusFilter as 'ACTIVE' | 'PAUSED' | 'ARCHIVED' } : undefined,
          );
          if (result.success) {
            success = true;
            resultData = { habits: result.data } as unknown as Record<string, unknown>;
          } else {
            error = result.error ?? { code: 'UNKNOWN', message: 'Failed to list habits' };
          }
          break;
        }

        case 'HABIT_CREATE': {
          const result = await habitService.create(userId, {
            title: data.title as string,
            type: (data.type as 'BOOLEAN' | 'MEASURABLE' | 'TIMED') ?? 'BOOLEAN',
            freqNum: (data.freqNum as number) ?? 1,
            freqDen: (data.freqDen as number) ?? 1,
            description: data.description as string | undefined,
            question: data.question as string | undefined,
            icon: data.icon as string | undefined,
            color: data.color as string | undefined,
            reminderEnabled: data.reminderEnabled as boolean | undefined,
            reminderTime: data.reminderTime as string | undefined,
          });
          if (result.success) {
            success = true;
            resultData = { habit: result.data } as unknown as Record<string, unknown>;
            this.broadcastHabitUpdate(userId, { type: 'habit:created', habit: result.data as unknown as Record<string, unknown> });
          } else {
            error = result.error ?? { code: 'UNKNOWN', message: 'Failed to create habit' };
          }
          break;
        }

        case 'HABIT_UPDATE': {
          const habitId = data.id as string;
          const updates = data.updates as Record<string, unknown> | undefined;
          if (!habitId) {
            error = { code: 'VALIDATION_ERROR', message: 'id is required' };
            break;
          }
          const result = await habitService.update(userId, habitId, updates ?? {});
          if (result.success) {
            success = true;
            resultData = { habit: result.data } as unknown as Record<string, unknown>;
            this.broadcastHabitUpdate(userId, { type: 'habit:updated', habit: result.data as unknown as Record<string, unknown> });
          } else {
            error = result.error ?? { code: 'UNKNOWN', message: 'Failed to update habit' };
          }
          break;
        }

        case 'HABIT_DELETE': {
          const habitId = data.id as string;
          if (!habitId) {
            error = { code: 'VALIDATION_ERROR', message: 'id is required' };
            break;
          }
          const result = await habitService.delete(userId, habitId);
          if (result.success) {
            success = true;
            this.broadcastHabitUpdate(userId, { type: 'habit:deleted', habitId });
          } else {
            error = result.error ?? { code: 'UNKNOWN', message: 'Failed to delete habit' };
          }
          break;
        }

        case 'HABIT_RECORD_ENTRY': {
          const habitId = data.habitId as string;
          const date = data.date as string;
          const value = data.value as number;
          const note = data.note as string | undefined;
          if (!habitId || !date || value === undefined) {
            error = { code: 'VALIDATION_ERROR', message: 'habitId, date, and value are required' };
            break;
          }
          const result = await habitService.recordEntry(userId, habitId, date, value, note);
          if (result.success) {
            success = true;
            resultData = { entry: result.data } as unknown as Record<string, unknown>;
            this.broadcastHabitUpdate(userId, { type: 'habit:entry_updated', entry: result.data as unknown as Record<string, unknown> });
          } else {
            error = result.error ?? { code: 'UNKNOWN', message: 'Failed to record entry' };
          }
          break;
        }

        case 'HABIT_DELETE_ENTRY': {
          const habitId = data.habitId as string;
          const date = data.date as string;
          if (!habitId || !date) {
            error = { code: 'VALIDATION_ERROR', message: 'habitId and date are required' };
            break;
          }
          const result = await habitService.deleteEntry(userId, habitId, date);
          if (result.success) {
            success = true;
            this.broadcastHabitUpdate(userId, { type: 'habit:entry_updated', habitId, date });
          } else {
            error = result.error ?? { code: 'UNKNOWN', message: 'Failed to delete entry' };
          }
          break;
        }

        default:
          console.log(`[Socket.io] Unhandled USER_ACTION type: ${actionType}`);
          error = { code: 'NOT_IMPLEMENTED', message: `Action type ${actionType} not implemented` };
      }
    } catch (err) {
      console.error(`[Socket.io] Error processing USER_ACTION ${actionType}:`, err);
      error = { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Internal error' };
    }

    // Send ACTION_RESULT back if we have an optimisticId
    if (optimisticId) {
      const resultCommand = {
        commandId: crypto.randomUUID(),
        commandType: 'ACTION_RESULT' as const,
        targetClient: event.clientType || 'mobile' as const,
        priority: 'high' as const,
        requiresAck: false,
        createdAt: Date.now(),
        payload: {
          optimisticId,
          success,
          error,
          data: resultData,
        },
      };

      const userRoom = `user:${userId}`;
      this.io?.to(userRoom).emit('OCTOPUS_COMMAND', resultCommand as never);
      console.log(`[Socket.io] Sent ACTION_RESULT for ${actionType}: success=${success}, optimisticId=${optimisticId}`);
    }
  }

  /**
   * Process CHAT_MESSAGE event (F5.1)
   * Delegates to chatService.handleMessage with streaming callback.
   * After completion, broadcasts CHAT_SYNC to other devices (F5.2).
   */
  private async processChatMessageEvent(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    userId: string,
    event: OctopusEvent
  ): Promise<void> {
    if (event.eventType !== 'CHAT_MESSAGE') return;

    const { payload } = event;
    const senderSocketId = socket.id;
    const messageId = crypto.randomUUID();

    // Stream deltas back to the sender via CHAT_RESPONSE commands
    const onDelta = (delta: string) => {
      const command: ChatResponseCommand = {
        commandId: crypto.randomUUID(),
        commandType: 'CHAT_RESPONSE',
        targetClient: 'all',
        priority: 'high',
        requiresAck: false,
        createdAt: Date.now(),
        payload: {
          conversationId: payload.conversationId || '',
          messageId,
          type: 'delta',
          content: delta,
        },
      };
      socket.emit('OCTOPUS_COMMAND', command);
    };

    const result = await chatService.handleMessage(userId, payload.content, onDelta, payload.attachments);

    if (result.success && result.data) {
      const { conversationId, assistantMessageId, fullText, userMessageId } = result.data;

      // Send the complete marker to the sender
      const completeCommand: ChatResponseCommand = {
        commandId: crypto.randomUUID(),
        commandType: 'CHAT_RESPONSE',
        targetClient: 'all',
        priority: 'high',
        requiresAck: false,
        createdAt: Date.now(),
        payload: {
          conversationId,
          messageId: assistantMessageId,
          type: 'complete',
          content: fullText,
        },
      };
      socket.emit('OCTOPUS_COMMAND', completeCommand);

      // F5.2: Broadcast CHAT_SYNC with full history to other devices
      // (sending only delta would wipe their existing messages)
      const fullHistory = await chatService.getHistory(userId, conversationId, 50);
      const syncMessages = fullHistory.success && fullHistory.data
        ? fullHistory.data.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            metadata: m.metadata as Record<string, unknown> | undefined,
            createdAt: m.createdAt.toISOString(),
          }))
        : [
            { id: userMessageId, role: 'user', content: payload.content, createdAt: new Date().toISOString() },
            { id: assistantMessageId, role: 'assistant', content: fullText, createdAt: new Date().toISOString() },
          ];
      this.broadcastChatSync(userId, senderSocketId, conversationId, syncMessages);

      console.log(`[Socket.io] CHAT_MESSAGE processed for user ${userId}, conv=${conversationId}`);
    } else {
      // Send error as a complete response
      const errorCommand: ChatResponseCommand = {
        commandId: crypto.randomUUID(),
        commandType: 'CHAT_RESPONSE',
        targetClient: 'all',
        priority: 'high',
        requiresAck: false,
        createdAt: Date.now(),
        payload: {
          conversationId: payload.conversationId || '',
          messageId,
          type: 'complete',
          content: `Error: ${result.error?.message ?? 'Unknown error'}`,
        },
      };
      socket.emit('OCTOPUS_COMMAND', errorCommand);
      console.error(`[Socket.io] CHAT_MESSAGE failed for user ${userId}:`, result.error);
    }
  }

  /**
   * Process CHAT_ACTION event (F5.1)
   * Handles tool confirmation (confirm/cancel) from the client.
   */
  private async processChatActionEvent(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    userId: string,
    event: OctopusEvent
  ): Promise<void> {
    if (event.eventType !== 'CHAT_ACTION') return;

    const { payload } = event;
    const result = await handleToolConfirmation(
      userId,
      payload.toolCallId,
      payload.action
    );

    // Send the tool result back to the sender
    const resultCommand: ChatToolResultCommand = {
      commandId: crypto.randomUUID(),
      commandType: 'CHAT_TOOL_RESULT',
      targetClient: 'all',
      priority: 'high',
      requiresAck: false,
      createdAt: Date.now(),
      payload: {
        conversationId: payload.conversationId,
        messageId: '',
        toolCallId: payload.toolCallId,
        success: result.success,
        summary: result.success
          ? (result.data && typeof result.data === 'object' && 'cancelled' in result.data
              ? 'Action cancelled'
              : 'Tool executed successfully')
          : (result.error?.message ?? 'Unknown error'),
      },
    };
    socket.emit('OCTOPUS_COMMAND', resultCommand);

    console.log(`[Socket.io] CHAT_ACTION processed for user ${userId}: ${payload.action} toolCall=${payload.toolCallId}`);
  }

  /**
   * Process CHAT_HISTORY_REQUEST — client requests full chat history.
   * Responds with a CHAT_SYNC containing full conversation history.
   */
  private async processChatHistoryRequest(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    userId: string
  ): Promise<void> {
    try {
      const convResult = await chatService.getOrCreateDefaultConversation(userId);
      if (!convResult.success || !convResult.data) return;

      const historyResult = await chatService.getHistory(userId, convResult.data.id, 50);
      if (!historyResult.success || !historyResult.data) return;

      const syncCommand: ChatSyncCommand = {
        commandId: crypto.randomUUID(),
        commandType: 'CHAT_SYNC',
        targetClient: 'all',
        priority: 'normal',
        requiresAck: false,
        createdAt: Date.now(),
        payload: {
          conversationId: convResult.data.id,
          messages: historyResult.data.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            metadata: m.metadata as Record<string, unknown> | undefined,
            createdAt: m.createdAt.toISOString(),
          })),
        },
      };
      socket.emit('OCTOPUS_COMMAND', syncCommand);
      console.log(`[Socket.io] CHAT_HISTORY_REQUEST served for user ${userId}, ${historyResult.data.length} messages`);
    } catch (err) {
      console.error(`[Socket.io] Failed to process CHAT_HISTORY_REQUEST:`, err);
    }
  }

  /**
   * Broadcast CHAT_SYNC to all of a user's devices except the sender (F5.2).
   */
  private async broadcastChatSync(
    userId: string,
    senderSocketId: string,
    conversationId: string,
    messages: Array<{ id: string; role: string; content: string; metadata?: Record<string, unknown>; createdAt: string }>
  ): Promise<void> {
    if (!this.io) return;

    const userRoom = `user:${userId}`;
    const sockets = await this.io.in(userRoom).fetchSockets();

    const syncCommand: ChatSyncCommand = {
      commandId: crypto.randomUUID(),
      commandType: 'CHAT_SYNC',
      targetClient: 'all',
      priority: 'normal',
      requiresAck: false,
      createdAt: Date.now(),
      payload: {
        conversationId,
        messages,
      },
    };

    for (const s of sockets) {
      if (s.id !== senderSocketId) {
        s.emit('OCTOPUS_COMMAND', syncCommand);
      }
    }

    console.log(`[Socket.io] CHAT_SYNC broadcast for user ${userId}, conv=${conversationId}, excluding socket ${senderSocketId}`);
  }

  /**
   * Broadcast a full state snapshot to all of a user's connected clients
   */
  private async broadcastFullStateToUser(userId: string): Promise<void> {
    if (!this.io) return;
    const userRoom = `user:${userId}`;
    const sockets = await this.io.in(userRoom).fetchSockets();
    for (const socket of sockets) {
      await this.sendStateSnapshotToSocket(socket as unknown as Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>);
    }
  }

  /**
   * Public wrapper for broadcastFullStateToUser.
   * Used by tRPC routers to push full state (including activePomodoro) to all clients.
   */
  async broadcastFullState(userId: string): Promise<void> {
    await this.broadcastFullStateToUser(userId);
  }

  /**
   * Handle command acknowledgment
   * Requirements: 2.6
   */
  private async handleCommandAck(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    payload: { commandId: string }
  ): Promise<void> {
    try {
      const result = await commandQueueService.markAcknowledged(payload.commandId);
      
      if (result.success) {
        console.log(`[Socket.io] Command acknowledged: ${payload.commandId}`);
      } else {
        console.error(`[Socket.io] Failed to acknowledge command: ${result.error?.message}`);
      }
    } catch (error) {
      console.error('[Socket.io] Error handling command acknowledgment:', error);
    }
  }


  // ==========================================================================
  // Policy and State Sync Methods
  // ==========================================================================

  /**
   * Send current policy to a specific socket
   * Requirements: 10.2, 10.7
   */
  private async sendPolicyToSocket(socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>): Promise<void> {
    try {
      // Get policy from distribution service
      const policyResult = await policyDistributionService.getCurrentPolicy(socket.data.userId);
      
      if (policyResult.success && policyResult.data) {
        const policy = policyResult.data;
        
        // Send as Octopus UPDATE_POLICY command
        const updatePolicyCommand: UpdatePolicyCommand = {
          commandId: crypto.randomUUID(),
          commandType: 'UPDATE_POLICY',
          targetClient: socket.data.clientType || 'all',
          priority: 'normal',
          requiresAck: false,
          createdAt: Date.now(),
          payload: {
            policyType: 'full',
            policy,
            effectiveTime: Date.now(),
          },
        };
        
        socket.emit('OCTOPUS_COMMAND', updatePolicyCommand);
        
        // Also send policy:update event for desktop clients
        // This is the format expected by the desktop connection manager
        socket.emit('policy:update' as keyof ServerToClientEvents, policy as never);
        console.log(`[Socket.io] Sent policy to client ${socket.id}, version: ${policy.version}`);
      }

      // Also send legacy format for backward compatibility
      const legacyPolicy = await this.getUserPolicy(socket.data.userId);
      socket.emit('SYNC_POLICY', legacyPolicy);
    } catch (error) {
      console.error('[Socket.io] Error sending policy:', error);
      socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to sync policy' });
    }
  }

  /**
   * Send current state snapshot to a socket
   * Requirements: 1.7
   */
  private async sendStateSnapshotToSocket(socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>): Promise<void> {
    try {
      const { userId } = socket.data;

      // Get current daily state (accounting for 4AM daily reset)
      const today = getTodayDate();
      
      const [dailyState, settings, activePomodoro, tasks] = await Promise.all([
        prisma.dailyState.findUnique({
          where: { userId_date: { userId, date: today } },
        }),
        prisma.userSettings.findUnique({ where: { userId } }),
        prisma.pomodoro.findFirst({
          where: { userId, status: 'IN_PROGRESS' },
          include: { task: true },
        }),
        // Get top 3 tasks if we have task IDs
        prisma.task.findMany({
          where: { userId },
          take: 3,
          orderBy: { updatedAt: 'desc' },
        }),
      ]);

      // Use DB state directly — OVER_REST is now a real DB state written by StateEngine
      const systemState: SystemState = dailyState ? parseSystemState(dailyState.systemState) : 'idle';

      // Get top 3 tasks from IDs if available, otherwise fall back to today's planned tasks
      let top3Tasks: { id: string; title: string; status: string; priority: string }[] = [];
      if (dailyState?.top3TaskIds && dailyState.top3TaskIds.length > 0) {
        const fetchedTasks = await prisma.task.findMany({
          where: { id: { in: dailyState.top3TaskIds } },
        });
        top3Tasks = fetchedTasks.map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
        }));
      }
      // Fallback: if no top3 set, use today's planned tasks or recent tasks
      if (top3Tasks.length === 0) {
        const fallbackTasks = await prisma.task.findMany({
          where: {
            userId,
            status: { not: 'DONE' },
            OR: [
              { planDate: today },
              { planDate: null },
            ],
          },
          orderBy: [
            { priority: 'asc' },
            { updatedAt: 'desc' },
          ],
          take: 10,
        });
        top3Tasks = fallbackTasks.map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
        }));
      }

      // Calculate daily cap reached
      const dailyCapReached = (dailyState?.pomodoroCount ?? 0) >= (settings?.dailyCap ?? 8);

      // Build full state for Octopus SYNC_STATE command
      const syncStateCommand: SyncStateCommand = {
        commandId: crypto.randomUUID(),
        commandType: 'SYNC_STATE',
        targetClient: socket.data.clientType || 'all',
        priority: 'high',
        requiresAck: false,
        createdAt: Date.now(),
        payload: {
          syncType: 'full',
          version: Date.now(),
          state: {
            systemState: {
              state: systemState,
              dailyCapReached,
              skipTokensRemaining: settings?.skipTokenDailyLimit ?? 3,
            },
            dailyState: {
              date: today.toISOString().split('T')[0],
              completedPomodoros: dailyState?.pomodoroCount ?? 0,
              totalFocusMinutes: (dailyState?.pomodoroCount ?? 0) * (settings?.pomodoroDuration ?? 25),
              top3TaskIds: dailyState?.top3TaskIds ?? [],
            },
            activePomodoro: activePomodoro ? {
              id: activePomodoro.id,
              taskId: activePomodoro.taskId,
              taskTitle: activePomodoro.task?.title ?? null,
              startTime: activePomodoro.startTime.getTime(),
              duration: activePomodoro.duration,
              status: 'active' as const,
            } : null,
            top3Tasks,
            settings: {
              pomodoroDuration: settings?.pomodoroDuration ?? 25,
              shortBreakDuration: settings?.shortRestDuration ?? 5,
              longBreakDuration: settings?.longRestDuration ?? 15,
              dailyCap: settings?.dailyCap ?? 8,
              enforcementMode: (settings?.enforcementMode as 'strict' | 'gentle') ?? 'gentle',
            },
          },
        },
      };

      socket.emit('OCTOPUS_COMMAND', syncStateCommand);

      // Also send legacy state change for backward compatibility
      socket.emit('STATE_CHANGE', { state: systemState });
    } catch (error) {
      console.error('[Socket.io] Error sending state snapshot:', error);
    }
  }

  /**
   * Deliver pending commands to a reconnected client
   * Requirements: 2.7
   */
  private async deliverPendingCommands(socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>): Promise<void> {
    const { clientId } = socket.data;
    if (!clientId) return;

    try {
      const result = await commandQueueService.getPendingCommands(clientId);
      
      if (result.success && result.data && result.data.length > 0) {
        console.log(`[Socket.io] Delivering ${result.data.length} pending commands to client ${clientId}`);
        
        for (const queuedCommand of result.data) {
          // Send the command
          socket.emit('OCTOPUS_COMMAND', queuedCommand.command);
          
          // Mark as delivered
          await commandQueueService.markDelivered(queuedCommand.commandId);
          
          // Request acknowledgment if required
          if (queuedCommand.command.requiresAck) {
            socket.emit('COMMAND_ACK_REQUEST', { commandId: queuedCommand.commandId });
          }
        }
      }
    } catch (error) {
      console.error('[Socket.io] Error delivering pending commands:', error);
    }
  }

  /**
   * Get user's current policy (legacy format)
   */
  private async getUserPolicy(userId: string): Promise<PolicyCache> {
    // Get user settings
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    // Get current daily state (accounting for 4AM daily reset)
    const today = getTodayDate();

    const dailyState = await prisma.dailyState.findUnique({
      where: {
        userId_date: { userId, date: today },
      },
    });

    // Use DB state directly — OVER_REST is now a real DB state written by StateEngine
    const effectiveState: SystemState = dailyState ? parseSystemState(dailyState.systemState) : 'idle';

    return {
      globalState: effectiveState,
      blacklist: settings?.blacklist || [],
      whitelist: settings?.whitelist || [],
      sessionWhitelist: [], // Session whitelist is managed client-side
      lastSync: Date.now(),
    };
  }

  // ==========================================================================
  // Legacy Event Handlers (backward compatibility)
  // ==========================================================================

  /**
   * Handle activity log from Browser Sentinel (legacy)
   * Requirements: 6.6, 7.3
   */
  private async handleActivityLog(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    payload: ActivityLogEntry[]
  ): Promise<void> {
    try {
      const validated = ActivityLogSchema.parse(payload);
      const { userId } = socket.data;

      // Use activity log service to store logs
      const result = await activityLogService.createBatch(
        userId,
        validated.map((log) => ({
          url: log.url,
          title: log.title,
          duration: log.duration,
          category: log.category,
          source: 'chrome_ext' as const,
          timestamp: log.timestamp ? new Date(log.timestamp) : undefined,
        }))
      );

      if (result.success) {
        console.log(`[Socket.io] Stored ${result.data?.count} activity logs for user ${userId}`);
      } else {
        console.error('[Socket.io] Failed to store activity logs:', result.error);
        socket.emit('error', { 
          code: result.error?.code || 'INTERNAL_ERROR', 
          message: result.error?.message || 'Failed to store activity log' 
        });
      }
    } catch (error) {
      console.error('[Socket.io] Error handling activity log:', error);
      socket.emit('error', { 
        code: 'VALIDATION_ERROR', 
        message: error instanceof z.ZodError ? 'Invalid activity log format' : 'Failed to store activity log' 
      });
    }
  }

  /**
   * Handle URL check request (legacy)
   */
  private async handleUrlCheck(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    payload: { url: string },
    callback: (response: { allowed: boolean; action?: string }) => void
  ): Promise<void> {
    try {
      const validated = UrlCheckSchema.parse(payload);
      const policy = await this.getUserPolicy(socket.data.userId);

      // Check if URL is allowed based on current state and lists
      const result = this.checkUrlPolicy(validated.url, policy);
      callback(result);
    } catch (error) {
      console.error('[Socket.io] Error checking URL:', error);
      callback({ allowed: true }); // Default to allow on error
    }
  }

  /**
   * Check URL against policy
   */
  private checkUrlPolicy(url: string, policy: PolicyCache): { allowed: boolean; action?: string } {
    // In non-focus states, allow all URLs
    if (policy.globalState !== 'focus') {
      return { allowed: true };
    }

    // Check whitelist first
    if (this.matchesPattern(url, policy.whitelist) || this.matchesPattern(url, policy.sessionWhitelist)) {
      return { allowed: true };
    }

    // Check blacklist
    if (this.matchesPattern(url, policy.blacklist)) {
      return { allowed: false, action: 'screensaver' };
    }

    // URL not in either list - soft intervention
    return { allowed: false, action: 'soft_block' };
  }

  /**
   * Check if URL matches any pattern in the list
   */
  private matchesPattern(url: string, patterns: string[]): boolean {
    const urlLower = url.toLowerCase();
    return patterns.some((pattern) => {
      const patternLower = pattern.toLowerCase();
      // Simple wildcard matching
      if (patternLower.includes('*')) {
        const regex = new RegExp('^' + patternLower.replace(/\*/g, '.*') + '$');
        return regex.test(urlLower);
      }
      return urlLower.includes(patternLower);
    });
  }

  /**
   * Handle user response to soft intervention (legacy)
   */
  private async handleUserResponse(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    payload: { questionId: string; response: boolean }
  ): Promise<void> {
    try {
      const validated = UserResponseSchema.parse(payload);
      
      // Log the user's response for analytics
      console.log(`[Socket.io] User ${socket.data.userId} responded to ${validated.questionId}: ${validated.response}`);
      
      // If user confirmed URL is task-related, the client will handle session whitelist
      // We could also store this for learning/analytics
    } catch (error) {
      console.error('[Socket.io] Error handling user response:', error);
    }
  }

  /**
   * Handle timeline event from Browser Sentinel (legacy)
   * Requirements: 7.1, 7.2
   */
  private async handleTimelineEvent(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    payload: TimelineEventEntry
  ): Promise<void> {
    try {
      const validated = TimelineEventSchema.parse(payload);
      const { userId } = socket.data;

      // Use timeline service to store event with deduplication
      const result = await timelineService.createWithDedup(userId, {
        type: validated.type as TimelineEventTypeValue,
        startTime: new Date(validated.startTime),
        endTime: validated.endTime ? new Date(validated.endTime) : undefined,
        duration: validated.duration,
        title: validated.title,
        metadata: validated.metadata,
        source: 'browser_sentinel',
      });

      if (result.success) {
        console.log(`[Socket.io] Stored timeline event for user ${userId}: ${validated.type}`);
      } else {
        console.error('[Socket.io] Failed to store timeline event:', result.error);
        socket.emit('error', {
          code: result.error?.code || 'INTERNAL_ERROR',
          message: result.error?.message || 'Failed to store timeline event',
        });
      }
    } catch (error) {
      console.error('[Socket.io] Error handling timeline event:', error);
      socket.emit('error', {
        code: 'VALIDATION_ERROR',
        message: error instanceof z.ZodError ? 'Invalid timeline event format' : 'Failed to store timeline event',
      });
    }
  }

  /**
   * Handle batch timeline events from Browser Sentinel (legacy)
   * Requirements: 7.1, 7.2
   */
  private async handleTimelineEventsBatch(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    payload: TimelineEventEntry[]
  ): Promise<void> {
    try {
      const validated = TimelineEventBatchSchema.parse(payload);
      const { userId } = socket.data;

      // Use timeline service to store events in batch
      const result = await timelineService.createBatch(
        userId,
        validated.map((event) => ({
          type: event.type as TimelineEventTypeValue,
          startTime: new Date(event.startTime),
          endTime: event.endTime ? new Date(event.endTime) : undefined,
          duration: event.duration,
          title: event.title,
          metadata: event.metadata,
          source: 'browser_sentinel',
        }))
      );

      if (result.success) {
        console.log(`[Socket.io] Stored ${result.data?.count} timeline events for user ${userId}`);
      } else {
        console.error('[Socket.io] Failed to store timeline events:', result.error);
        socket.emit('error', {
          code: result.error?.code || 'INTERNAL_ERROR',
          message: result.error?.message || 'Failed to store timeline events',
        });
      }
    } catch (error) {
      console.error('[Socket.io] Error handling timeline events batch:', error);
      socket.emit('error', {
        code: 'VALIDATION_ERROR',
        message: error instanceof z.ZodError ? 'Invalid timeline events format' : 'Failed to store timeline events',
      });
    }
  }

  /**
   * Handle block event from Browser Sentinel (legacy)
   * Requirements: 7.4
   */
  private async handleBlockEvent(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    payload: BlockEventEntry
  ): Promise<void> {
    try {
      const validated = BlockEventSchema.parse(payload);
      const { userId } = socket.data;

      // Extract domain from URL for title
      let domain = 'Unknown site';
      try {
        domain = new URL(validated.url).hostname;
      } catch {
        // Use URL as-is if parsing fails
        domain = validated.url;
      }

      // Create timeline event for the block
      const result = await timelineService.createWithDedup(userId, {
        type: 'block',
        startTime: new Date(validated.timestamp),
        duration: 0, // Block events are instantaneous
        title: `Blocked: ${domain}`,
        metadata: {
          url: validated.url,
          blockType: validated.blockType,
          userAction: validated.userAction,
          pomodoroId: validated.pomodoroId,
        },
        source: 'browser_sentinel',
      });

      if (result.success) {
        console.log(`[Socket.io] Stored block event for user ${userId}: ${domain}`);
      } else {
        console.error('[Socket.io] Failed to store block event:', result.error);
        socket.emit('error', {
          code: result.error?.code || 'INTERNAL_ERROR',
          message: result.error?.message || 'Failed to store block event',
        });
      }
    } catch (error) {
      console.error('[Socket.io] Error handling block event:', error);
      socket.emit('error', {
        code: 'VALIDATION_ERROR',
        message: error instanceof z.ZodError ? 'Invalid block event format' : 'Failed to store block event',
      });
    }
  }

  /**
   * Handle interruption event from Browser Sentinel (legacy)
   * Requirements: 7.4
   */
  private async handleInterruptionEvent(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    payload: InterruptionEventEntry
  ): Promise<void> {
    try {
      const validated = InterruptionEventSchema.parse(payload);
      const { userId } = socket.data;

      // Create descriptive title based on source
      let title = 'Interruption';
      switch (validated.source) {
        case 'blocked_site':
          title = `Blocked site access${validated.details?.url ? `: ${new URL(validated.details.url).hostname}` : ''}`;
          break;
        case 'tab_switch':
          title = 'Tab switch during focus';
          break;
        case 'idle':
          title = `Idle for ${validated.details?.idleSeconds || validated.duration} seconds`;
          break;
        case 'manual':
          title = 'Manual interruption';
          break;
      }

      // Create timeline event for the interruption
      const result = await timelineService.createWithDedup(userId, {
        type: 'interruption',
        startTime: new Date(validated.timestamp),
        duration: validated.duration,
        title,
        metadata: {
          source: validated.source,
          pomodoroId: validated.pomodoroId,
          details: validated.details,
        },
        source: 'browser_sentinel',
      });

      if (result.success) {
        console.log(`[Socket.io] Stored interruption event for user ${userId}: ${validated.source}`);
      } else {
        console.error('[Socket.io] Failed to store interruption event:', result.error);
        socket.emit('error', {
          code: result.error?.code || 'INTERNAL_ERROR',
          message: result.error?.message || 'Failed to store interruption event',
        });
      }
    } catch (error) {
      console.error('[Socket.io] Error handling interruption event:', error);
      socket.emit('error', {
        code: 'VALIDATION_ERROR',
        message: error instanceof z.ZodError ? 'Invalid interruption event format' : 'Failed to store interruption event',
      });
    }
  }


  // ============================================================================
  // Public API for broadcasting
  // ============================================================================

  /**
   * Broadcast policy update to all user's connected clients
   * Requirements: 10.2, 10.3
   */
  async broadcastPolicyUpdate(userId: string): Promise<void> {
    if (!this.io) return;

    try {
      // Get updated policy from distribution service
      const policyResult = await policyDistributionService.getCurrentPolicy(userId);
      
      if (policyResult.success && policyResult.data) {
        const policy = policyResult.data;
        const userRoom = `user:${userId}`;
        
        // Send as Octopus UPDATE_POLICY command
        const updatePolicyCommand: UpdatePolicyCommand = {
          commandId: crypto.randomUUID(),
          commandType: 'UPDATE_POLICY',
          targetClient: 'all',
          priority: 'high',
          requiresAck: false,
          createdAt: Date.now(),
          payload: {
            policyType: 'full',
            policy,
            effectiveTime: Date.now(),
          },
        };
        
        this.io.to(userRoom).emit('OCTOPUS_COMMAND', updatePolicyCommand);
        
        // Also send policy:update event for desktop clients
        // This is the format expected by the desktop connection manager
        this.io.to(userRoom).emit('policy:update' as keyof ServerToClientEvents, policy as never);
        
        // Also send legacy format for browser extension
        const legacyPolicy = await this.getUserPolicy(userId);
        this.io.to(userRoom).emit('SYNC_POLICY', legacyPolicy);
        
        console.log(`[Socket.io] Broadcast policy update to user ${userId} (version ${policy.version}, overRest: ${policy.overRest?.isOverRest ?? false})`);
      }
    } catch (error) {
      console.error('[Socket.io] Error broadcasting policy update:', error);
    }
  }

  /**
   * Send execute command to user's clients
   */
  sendExecuteCommand(userId: string, command: ExecuteCommand): void {
    if (!this.io) return;

    const userRoom = `user:${userId}`;
    
    // Send legacy format
    this.io.to(userRoom).emit('EXECUTE', command);
    
    // Also send as Octopus EXECUTE_ACTION command
    const executeCommand: ExecuteActionCommand = {
      commandId: crypto.randomUUID(),
      commandType: 'EXECUTE_ACTION',
      targetClient: 'all',
      priority: 'normal',
      requiresAck: false,
      createdAt: Date.now(),
      payload: {
        action: this.mapLegacyActionToOctopus(command.action),
        parameters: command.params,
      },
    };
    
    this.io.to(userRoom).emit('OCTOPUS_COMMAND', executeCommand);
    console.log(`[Socket.io] Sent execute command to user ${userId}: ${command.action}`);
  }

  /**
   * Broadcast habit update to all of a user's connected clients
   */
  broadcastHabitUpdate(userId: string, payload: HabitBroadcastPayload): void {
    if (!this.io) return;

    const userRoom = `user:${userId}`;

    switch (payload.type) {
      case 'habit:created':
        this.io.to(userRoom).emit('habit:created', { habit: payload.habit });
        break;
      case 'habit:updated':
        this.io.to(userRoom).emit('habit:updated', { habit: payload.habit });
        break;
      case 'habit:deleted':
        this.io.to(userRoom).emit('habit:deleted', { habitId: payload.habitId });
        break;
      case 'habit:entry_updated':
        if ('entry' in payload) {
          this.io.to(userRoom).emit('habit:entry_updated', {
            habitId: (payload.entry as Record<string, unknown>).habitId as string,
            date: (payload.entry as Record<string, unknown>).date as string,
            entry: payload.entry,
          });
        } else {
          this.io.to(userRoom).emit('habit:entry_updated', {
            habitId: payload.habitId,
            date: payload.date,
          });
        }
        break;
    }

    console.log(`[Socket.io] Broadcast habit update to user ${userId}: ${payload.type}`);
  }

  /**
   * Send Octopus command to a specific client
   * Requirements: 2.4
   */
  async sendOctopusCommand(
    userId: string,
    clientId: string,
    command: OctopusCommand
  ): Promise<{ success: boolean; queued?: boolean }> {
    if (!this.io) return { success: false };

    // Check if client is online
    const isOnline = clientRegistryService.isOnline(clientId);
    
    if (isOnline) {
      // Find the socket for this client
      const userRoom = `user:${userId}`;
      const sockets = await this.io.in(userRoom).fetchSockets();
      
      for (const socket of sockets) {
        if (socket.data.clientId === clientId) {
          socket.emit('OCTOPUS_COMMAND', command);
          
          if (command.requiresAck) {
            socket.emit('COMMAND_ACK_REQUEST', { commandId: command.commandId });
          }
          
          return { success: true };
        }
      }
    }

    // Client is offline, queue the command (Requirements: 2.7)
    const queueResult = await commandQueueService.enqueue(clientId, userId, command);
    
    if (queueResult.success) {
      console.log(`[Socket.io] Queued command for offline client ${clientId}: ${command.commandType}`);
      return { success: true, queued: true };
    }

    return { success: false };
  }

  /**
   * Broadcast Octopus command to all user's clients
   * Requirements: 2.4
   */
  broadcastOctopusCommand(userId: string, command: OctopusCommand): void {
    if (!this.io) return;

    const userRoom = `user:${userId}`;
    this.io.to(userRoom).emit('OCTOPUS_COMMAND', command);
    console.log(`[Socket.io] Broadcast Octopus command to user ${userId}: ${command.commandType}`);
  }

  /**
   * Show UI on user's clients
   */
  showUI(
    userId: string,
    uiType: 'notification' | 'modal' | 'overlay' | 'toast',
    content: Record<string, unknown>,
    options?: { duration?: number; dismissible?: boolean }
  ): void {
    if (!this.io) return;

    const userRoom = `user:${userId}`;
    
    const showUICommand: ShowUICommand = {
      commandId: crypto.randomUUID(),
      commandType: 'SHOW_UI',
      targetClient: 'all',
      priority: 'normal',
      requiresAck: false,
      createdAt: Date.now(),
      payload: {
        uiType,
        content,
        duration: options?.duration,
        dismissible: options?.dismissible ?? true,
      },
    };
    
    this.io.to(userRoom).emit('OCTOPUS_COMMAND', showUICommand);
    console.log(`[Socket.io] Sent show UI command to user ${userId}: ${uiType}`);
  }

  /**
   * Broadcast entertainment mode state change to all user's connected clients
   * Requirements: 8.6, 10.3
   */
  broadcastEntertainmentModeChange(
    userId: string,
    payload: { isActive: boolean; sessionId: string | null; endTime: number | null }
  ): void {
    if (!this.io) return;

    const userRoom = `user:${userId}`;
    
    // Send entertainment mode change event
    this.io.to(userRoom).emit('ENTERTAINMENT_MODE_CHANGE', payload);
    
    console.log(`[Socket.io] Broadcast entertainment mode change to user ${userId}: ${payload.isActive ? 'active' : 'inactive'}`);
  }

  /**
   * Broadcast MCP event to all user's connected clients
   * Requirements: 10.1, 10.2, 10.3, 10.4
   */
  broadcastMCPEvent(
    userId: string,
    event: MCPEventPayload
  ): void {
    if (!this.io) return;

    const userRoom = `user:${userId}`;
    
    // Send MCP event to all connected clients for this user
    this.io.to(userRoom).emit('MCP_EVENT', event);
    
    console.log(`[Socket.io] Broadcast MCP event to user ${userId}: ${event.type}`);
  }

  /**
   * Map legacy action to Octopus ActionType
   */
  private mapLegacyActionToOctopus(action: ExecuteAction): 'SHOW_NOTIFICATION' | 'INJECT_OVERLAY' | 'REDIRECT_TAB' {
    switch (action) {
      case 'INJECT_TOAST':
        return 'SHOW_NOTIFICATION';
      case 'SHOW_OVERLAY':
        return 'INJECT_OVERLAY';
      case 'REDIRECT':
        return 'REDIRECT_TAB';
      case 'POMODORO_COMPLETE':
        return 'SHOW_NOTIFICATION';
      case 'IDLE_ALERT':
        return 'SHOW_NOTIFICATION';
      case 'HABIT_REMINDER':
        return 'SHOW_NOTIFICATION';
      default:
        return 'SHOW_NOTIFICATION';
    }
  }

  /**
   * Get number of connected clients for a user
   */
  getConnectedClientCount(userId: string): number {
    return this.userRooms.get(userId)?.size || 0;
  }

  /**
   * Get all connected user IDs
   */
  getConnectedUserIds(): string[] {
    return Array.from(this.userRooms.keys());
  }

  /**
   * Get the Socket.io server instance
   */
  getIO(): Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> | null {
    return this.io;
  }

  /**
   * Shutdown the socket server
   */
  shutdown(): void {
    this.stopPeriodicTasks();
    if (this.io) {
      this.io.close();
      this.io = null;
    }
    this.userRooms.clear();
    console.log('[Socket.io] Server shutdown');
  }
}

// Singleton instance
export const socketServer = new VibeFlowSocketServer();

export default socketServer;
