/**
 * Heartbeat Service
 * 
 * Manages client heartbeat tracking and offline detection for the
 * Desktop Production Resilience feature.
 * 
 * Requirements: 3.2, 3.3, 3.4, 3.5
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { isWithinWorkHours } from './idle.service';
import type { WorkTimeSlot } from './user.service';

// ============================================================================
// Constants
// ============================================================================

/** Heartbeat interval in milliseconds (30 seconds) - Requirements 3.1 */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000;

/** Offline detection threshold in milliseconds (2 minutes) - Requirements 3.3 */
export const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000;

/** Offline detection check interval in milliseconds (30 seconds) */
export const OFFLINE_CHECK_INTERVAL_MS = 30 * 1000;

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface HeartbeatPayload {
  clientId: string;
  userId: string;
  appVersion: string;
  mode: 'development' | 'staging' | 'production';
  isInDemoMode: boolean;
  activePomodoroId: string | null;
  deviceName?: string;
}

export interface ClientStatus {
  clientId: string;
  userId: string;
  isOnline: boolean;
  lastHeartbeat: Date;
  mode: string;
  appVersion: string;
  deviceName: string | null;
}

export interface OfflineEventInfo {
  id: string;
  clientId: string;
  userId: string;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  wasInWorkHours: boolean;
  wasInPomodoro: boolean;
  gracePeriodUsed: boolean;
  isBypassAttempt: boolean;
}

/** Type for ClientConnection from Prisma */
export interface ClientConnectionRecord {
  id: string;
  userId: string;
  clientId: string;
  deviceName: string | null;
  appVersion: string;
  mode: string;
  lastHeartbeat: Date;
  isOnline: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Type for ClientOfflineEvent from Prisma */
export interface ClientOfflineEventRecord {
  id: string;
  clientId: string;
  userId: string;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  wasInWorkHours: boolean;
  wasInPomodoro: boolean;
  gracePeriodUsed: boolean;
  isBypassAttempt: boolean;
}

// ============================================================================
// Validation Schemas
// ============================================================================

export const HeartbeatPayloadSchema = z.object({
  clientId: z.string().min(1),
  userId: z.string().min(1),
  appVersion: z.string().min(1),
  mode: z.enum(['development', 'staging', 'production']),
  isInDemoMode: z.boolean(),
  activePomodoroId: z.string().nullable(),
  deviceName: z.string().optional(),
});

// ============================================================================
// In-memory state for offline detection scheduler
// ============================================================================

let offlineDetectionInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if user is currently within work hours
 */
async function checkIsInWorkHours(userId: string): Promise<boolean> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });
  
  if (!settings) {
    return false;
  }
  
  const workTimeSlots = (settings.workTimeSlots as unknown as WorkTimeSlot[]) || [];
  return isWithinWorkHours(workTimeSlots);
}

/**
 * Check if user has an active pomodoro
 */
async function checkHasActivePomodoro(userId: string): Promise<boolean> {
  const activePomodoro = await prisma.pomodoro.findFirst({
    where: {
      userId,
      status: 'IN_PROGRESS',
    },
  });
  
  return activePomodoro !== null;
}

// ============================================================================
// Heartbeat Service
// ============================================================================

export const heartbeatService = {
  /**
   * Track a heartbeat from a client
   * Requirements: 3.2
   * 
   * Updates the client's last heartbeat timestamp and marks them as online.
   * Creates a new ClientConnection record if one doesn't exist.
   */
  async trackHeartbeat(payload: HeartbeatPayload): Promise<ServiceResult<ClientConnectionRecord>> {
    try {
      const validated = HeartbeatPayloadSchema.parse(payload);
      const now = new Date();

      // Upsert the client connection record
      const client = await (prisma as any).clientConnection.upsert({
        where: { clientId: validated.clientId },
        update: {
          lastHeartbeat: now,
          isOnline: true,
          appVersion: validated.appVersion,
          mode: validated.mode,
          deviceName: validated.deviceName ?? null,
        },
        create: {
          clientId: validated.clientId,
          userId: validated.userId,
          appVersion: validated.appVersion,
          mode: validated.mode,
          deviceName: validated.deviceName ?? null,
          lastHeartbeat: now,
          isOnline: true,
        },
      }) as ClientConnectionRecord;

      // If client was previously offline, close any open offline events
      const openOfflineEvent = await (prisma as any).clientOfflineEvent.findFirst({
        where: {
          clientId: validated.clientId,
          endedAt: null,
        },
      }) as ClientOfflineEventRecord | null;

      if (openOfflineEvent) {
        const durationSeconds = Math.floor(
          (now.getTime() - openOfflineEvent.startedAt.getTime()) / 1000
        );

        await (prisma as any).clientOfflineEvent.update({
          where: { id: openOfflineEvent.id },
          data: {
            endedAt: now,
            durationSeconds,
          },
        });
      }

      return { success: true, data: client };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid heartbeat payload',
            details: { issues: error.issues },
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to track heartbeat',
        },
      };
    }
  },

  /**
   * Get the status of a specific client
   * Requirements: 3.2
   */
  async getClientStatus(clientId: string): Promise<ServiceResult<ClientStatus | null>> {
    try {
      const client = await (prisma as any).clientConnection.findUnique({
        where: { clientId },
      }) as ClientConnectionRecord | null;

      if (!client) {
        return { success: true, data: null };
      }

      const status: ClientStatus = {
        clientId: client.clientId,
        userId: client.userId,
        isOnline: client.isOnline,
        lastHeartbeat: client.lastHeartbeat,
        mode: client.mode,
        appVersion: client.appVersion,
        deviceName: client.deviceName,
      };

      return { success: true, data: status };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get client status',
        },
      };
    }
  },

  /**
   * Get all clients for a user
   */
  async getClientsByUser(userId: string): Promise<ServiceResult<ClientStatus[]>> {
    try {
      const clients = await (prisma as any).clientConnection.findMany({
        where: { userId },
        orderBy: { lastHeartbeat: 'desc' },
      }) as ClientConnectionRecord[];

      const statuses: ClientStatus[] = clients.map((client: ClientConnectionRecord) => ({
        clientId: client.clientId,
        userId: client.userId,
        isOnline: client.isOnline,
        lastHeartbeat: client.lastHeartbeat,
        mode: client.mode,
        appVersion: client.appVersion,
        deviceName: client.deviceName,
      }));

      return { success: true, data: statuses };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get clients',
        },
      };
    }
  },

  /**
   * Mark a specific client as offline
   * Requirements: 3.3, 3.4
   * 
   * Marks the client as offline and creates an offline event record.
   */
  async markClientOffline(
    clientId: string,
    options?: { wasInWorkHours?: boolean; wasInPomodoro?: boolean }
  ): Promise<ServiceResult<ClientOfflineEventRecord>> {
    try {
      const client = await (prisma as any).clientConnection.findUnique({
        where: { clientId },
      }) as ClientConnectionRecord | null;

      if (!client) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Client with id ${clientId} not found`,
          },
        };
      }

      // Skip if already offline
      if (!client.isOnline) {
        const existingEvent = await (prisma as any).clientOfflineEvent.findFirst({
          where: {
            clientId,
            endedAt: null,
          },
        }) as ClientOfflineEventRecord | null;

        if (existingEvent) {
          return { success: true, data: existingEvent };
        }
      }

      const now = new Date();

      // Determine context if not provided
      const wasInWorkHours = options?.wasInWorkHours ?? await checkIsInWorkHours(client.userId);
      const wasInPomodoro = options?.wasInPomodoro ?? await checkHasActivePomodoro(client.userId);

      // Update client status
      await (prisma as any).clientConnection.update({
        where: { clientId },
        data: { isOnline: false },
      });

      // Create offline event record
      const offlineEvent = await (prisma as any).clientOfflineEvent.create({
        data: {
          clientId,
          userId: client.userId,
          startedAt: now,
          wasInWorkHours,
          wasInPomodoro,
          gracePeriodUsed: false,
          isBypassAttempt: false,
        },
      }) as ClientOfflineEventRecord;

      return { success: true, data: offlineEvent };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to mark client offline',
        },
      };
    }
  },

  /**
   * Detect and mark stale clients as offline
   * Requirements: 3.3
   * 
   * Finds all clients that haven't sent a heartbeat within the threshold
   * and marks them as offline.
   */
  async detectOfflineClients(
    thresholdMs: number = OFFLINE_THRESHOLD_MS
  ): Promise<ServiceResult<{ markedOffline: number }>> {
    try {
      const cutoffTime = new Date(Date.now() - thresholdMs);

      // Find all online clients with stale heartbeats
      const staleClients = await (prisma as any).clientConnection.findMany({
        where: {
          isOnline: true,
          lastHeartbeat: {
            lt: cutoffTime,
          },
        },
      }) as ClientConnectionRecord[];

      let markedOffline = 0;

      for (const client of staleClients) {
        const result = await this.markClientOffline(client.clientId);
        if (result.success) {
          markedOffline++;
        }
      }

      return { success: true, data: { markedOffline } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to detect offline clients',
        },
      };
    }
  },

  /**
   * Get offline event history for a user
   * Requirements: 3.5, 3.6
   */
  async getOfflineHistory(
    userId: string,
    days: number = 30
  ): Promise<ServiceResult<OfflineEventInfo[]>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const events = await (prisma as any).clientOfflineEvent.findMany({
        where: {
          userId,
          startedAt: { gte: startDate },
        },
        orderBy: { startedAt: 'desc' },
      }) as ClientOfflineEventRecord[];

      const eventInfos: OfflineEventInfo[] = events.map((event: ClientOfflineEventRecord) => ({
        id: event.id,
        clientId: event.clientId,
        userId: event.userId,
        startedAt: event.startedAt,
        endedAt: event.endedAt,
        durationSeconds: event.durationSeconds,
        wasInWorkHours: event.wasInWorkHours,
        wasInPomodoro: event.wasInPomodoro,
        gracePeriodUsed: event.gracePeriodUsed,
        isBypassAttempt: event.isBypassAttempt,
      }));

      return { success: true, data: eventInfos };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get offline history',
        },
      };
    }
  },

  /**
   * Get client uptime statistics
   * Requirements: 3.6
   */
  async getUptimeStats(
    userId: string,
    days: number = 30
  ): Promise<ServiceResult<{
    totalOnlineSeconds: number;
    totalOfflineSeconds: number;
    uptimePercentage: number;
    offlineEventCount: number;
  }>> {
    try {
      const historyResult = await this.getOfflineHistory(userId, days);
      
      if (!historyResult.success || !historyResult.data) {
        return {
          success: false,
          error: historyResult.error,
        };
      }

      const events = historyResult.data;
      const totalPeriodSeconds = days * 24 * 60 * 60;

      // Calculate total offline time
      let totalOfflineSeconds = 0;
      for (const event of events) {
        if (event.durationSeconds !== null) {
          totalOfflineSeconds += event.durationSeconds;
        } else if (event.endedAt === null) {
          // Still offline - calculate duration from start to now
          const durationMs = Date.now() - event.startedAt.getTime();
          totalOfflineSeconds += Math.floor(durationMs / 1000);
        }
      }

      const totalOnlineSeconds = Math.max(0, totalPeriodSeconds - totalOfflineSeconds);
      const uptimePercentage = totalPeriodSeconds > 0
        ? Math.round((totalOnlineSeconds / totalPeriodSeconds) * 100)
        : 100;

      return {
        success: true,
        data: {
          totalOnlineSeconds,
          totalOfflineSeconds,
          uptimePercentage,
          offlineEventCount: events.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get uptime stats',
        },
      };
    }
  },

  /**
   * Start the offline detection scheduler
   * Should be called when the server starts
   */
  startOfflineDetection(): void {
    if (offlineDetectionInterval) {
      return; // Already running
    }

    console.log('[HeartbeatService] Starting offline detection scheduler');

    offlineDetectionInterval = setInterval(async () => {
      try {
        const result = await this.detectOfflineClients();
        if (result.success && result.data && result.data.markedOffline > 0) {
          console.log(`[HeartbeatService] Marked ${result.data.markedOffline} clients as offline`);
        }
      } catch (error) {
        console.error('[HeartbeatService] Error in offline detection:', error);
      }
    }, OFFLINE_CHECK_INTERVAL_MS);
  },

  /**
   * Stop the offline detection scheduler
   */
  stopOfflineDetection(): void {
    if (offlineDetectionInterval) {
      clearInterval(offlineDetectionInterval);
      offlineDetectionInterval = null;
      console.log('[HeartbeatService] Stopped offline detection scheduler');
    }
  },

  /**
   * Check if offline detection is running
   */
  isOfflineDetectionRunning(): boolean {
    return offlineDetectionInterval !== null;
  },

  /**
   * Get configuration constants
   */
  getConfig() {
    return {
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      offlineThresholdMs: OFFLINE_THRESHOLD_MS,
      offlineCheckIntervalMs: OFFLINE_CHECK_INTERVAL_MS,
    };
  },
};

export default heartbeatService;
