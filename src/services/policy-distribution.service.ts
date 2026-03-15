/**
 * Policy Distribution Service
 * 
 * Compiles and distributes policies to clients in the Octopus Architecture.
 * Handles policy versioning, caching, and conflict resolution.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.6, 10.7
 */

import prisma from '@/lib/prisma';
import type { Policy, TimeSlot, DistractionApp, AdhocFocusSession, SleepTimePolicy, SleepEnforcementAppPolicy, OverRestPolicy, RestEnforcementPolicy } from '@/types/octopus';
import { PolicySchema } from '@/types/octopus';
import { focusSessionService } from '@/services/focus-session.service';
import { sleepTimeService, type SleepEnforcementApp } from '@/services/sleep-time.service';
import { overRestService } from '@/services/over-rest.service';
import { screenTimeExemptionService } from '@/services/screen-time-exemption.service';
import { restEnforcementService } from '@/services/rest-enforcement.service';
import { dailyStateService } from '@/services/daily-state.service';
import { healthLimitService } from '@/services/health-limit.service';

// Service result type
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// PolicyVersion type (matches Prisma model)
export interface PolicyVersionRecord {
  id: string;
  userId: string;
  version: number;
  policy: unknown;
  createdAt: Date;
}

// Work time slot from user settings (different format than Policy TimeSlot)
interface UserWorkTimeSlot {
  id: string;
  startTime: string; // "HH:mm" format
  endTime: string;   // "HH:mm" format
  enabled: boolean;
}

// Distraction app from user settings
interface UserDistractionApp {
  bundleId: string;
  name: string;
  action: 'force_quit' | 'hide_window';
  isPreset: boolean;
}

// Type helper for accessing the policyVersion model
// This is needed because the Prisma client types may not be regenerated yet
interface PolicyVersionModel {
  findFirst: (args: {
    where: { userId: string };
    orderBy: { version: 'desc' | 'asc' };
    select?: { version: true };
  }) => Promise<PolicyVersionRecord | { version: number } | null>;
  findUnique: (args: {
    where: { userId_version: { userId: string; version: number } };
  }) => Promise<PolicyVersionRecord | null>;
  findMany: (args: {
    where: { userId: string };
    orderBy: { version: 'desc' | 'asc' };
    take: number;
    select?: { id: true };
  }) => Promise<PolicyVersionRecord[] | { id: string }[]>;
  create: (args: {
    data: { userId: string; version: number; policy: Record<string, unknown> };
  }) => Promise<PolicyVersionRecord>;
  deleteMany: (args: {
    where: { userId: string; id: { notIn: string[] } };
  }) => Promise<{ count: number }>;
}

const db = prisma as unknown as { policyVersion: PolicyVersionModel };

/**
 * Convert user settings work time slots to Policy TimeSlot format
 * User settings store time as "HH:mm" strings, Policy uses dayOfWeek + hour/minute
 */
function convertWorkTimeSlots(userSlots: UserWorkTimeSlot[]): TimeSlot[] {
  const policySlots: TimeSlot[] = [];
  
  for (const slot of userSlots) {
    if (!slot.enabled) continue;
    
    const [startHour, startMinute] = slot.startTime.split(':').map(Number);
    const [endHour, endMinute] = slot.endTime.split(':').map(Number);
    
    // Apply to all days of the week (0-6)
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
      policySlots.push({
        dayOfWeek,
        startHour,
        startMinute,
        endHour,
        endMinute,
      });
    }
  }
  
  return policySlots;
}

/**
 * Convert user distraction apps to Policy DistractionApp format
 */
function convertDistractionApps(userApps: UserDistractionApp[]): DistractionApp[] {
  return userApps.map(app => ({
    bundleId: app.bundleId,
    name: app.name,
    action: app.action,
  }));
}

/**
 * Convert sleep enforcement apps to Policy SleepEnforcementAppPolicy format
 */
function convertSleepEnforcementApps(apps: SleepEnforcementApp[]): SleepEnforcementAppPolicy[] {
  return apps.map(app => ({
    bundleId: app.bundleId,
    name: app.name,
  }));
}

export const policyDistributionService = {
  /**
   * Compile user settings into a Policy object
   * Requirements: 10.1, 2.1, 2.2, 2.3, 2.4
   */
  async compilePolicy(userId: string): Promise<ServiceResult<Policy>> {
    try {
      // Get user settings
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });

      if (!settings) {
        // Return default policy if no settings exist
        const defaultPolicy: Policy = {
          version: 1,
          blacklist: [],
          whitelist: [],
          enforcementMode: 'gentle',
          workTimeSlots: [],
          skipTokens: {
            remaining: 3,
            maxPerDay: 3,
            delayMinutes: 15,
          },
          distractionApps: [],
          updatedAt: Date.now(),
        };
        return { success: true, data: defaultPolicy };
      }

      // Get current skip token usage for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const skipTokenUsage = await prisma.skipTokenUsage.findUnique({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
      });

      const usedTokens = skipTokenUsage?.usedCount ?? 0;
      const maxTokens = settings.skipTokenDailyLimit;
      const remainingTokens = Math.max(0, maxTokens - usedTokens);

      // Convert work time slots
      const userWorkTimeSlots = (settings.workTimeSlots as unknown as UserWorkTimeSlot[]) || [];
      const workTimeSlots = convertWorkTimeSlots(userWorkTimeSlots);

      // Convert distraction apps
      const userDistractionApps = (settings.distractionApps as unknown as UserDistractionApp[]) || [];
      const distractionApps = convertDistractionApps(userDistractionApps);

      // Get the latest policy version number
      const latestVersion = await db.policyVersion.findFirst({
        where: { userId },
        orderBy: { version: 'desc' },
        select: { version: true },
      }) as { version: number } | null;

      const newVersion = (latestVersion?.version ?? 0) + 1;

      // Check for active ad-hoc focus session (Requirements: 2.1, 2.2, 2.3, 2.4, 13.1, 13.2)
      let adhocFocusSession: AdhocFocusSession | undefined;
      const activeSessionResult = await focusSessionService.getActiveSession(userId);
      if (activeSessionResult.success && activeSessionResult.data) {
        const session = activeSessionResult.data;
        adhocFocusSession = {
          active: true,
          endTime: session.plannedEndTime.getTime(),
          overridesSleepTime: session.overridesSleepTime,
        };
      }

      // Compile sleep time configuration (Requirements: 9.4, 11.1, 11.2)
      let sleepTime: SleepTimePolicy | undefined;
      const sleepConfigResult = await sleepTimeService.getConfig(userId);
      if (sleepConfigResult.success && sleepConfigResult.data) {
        const sleepConfig = sleepConfigResult.data;
        
        // Check if currently in sleep time window
        const isInSleepTimeResult = await sleepTimeService.isInSleepTime(userId);
        const isCurrentlyActive = isInSleepTimeResult.success ? isInSleepTimeResult.data ?? false : false;
        
        // Check if currently in snooze period
        const snoozeResult = await sleepTimeService.isInSnooze(userId);
        const isSnoozed = snoozeResult.success && snoozeResult.data?.inSnooze ? true : false;
        const snoozeEndTime = snoozeResult.success && snoozeResult.data?.snoozeEndTime 
          ? snoozeResult.data.snoozeEndTime.getTime() 
          : undefined;
        
        sleepTime = {
          enabled: sleepConfig.enabled,
          startTime: sleepConfig.startTime,
          endTime: sleepConfig.endTime,
          enforcementApps: convertSleepEnforcementApps(sleepConfig.enforcementApps),
          isCurrentlyActive,
          isSnoozed,
          ...(snoozeEndTime && { snoozeEndTime }),
        };
      }

      // Compile over rest configuration (Requirements: 15.2, 15.3, 16.1-16.5)
      let overRest: OverRestPolicy | undefined;
      const overRestStatusResult = await overRestService.checkOverRestStatus(userId);
      if (!overRestStatusResult.success) {
        console.log(`[PolicyDistribution] Over rest check FAILED for user ${userId}: ${overRestStatusResult.error?.message}`);
      }
      if (overRestStatusResult.success && overRestStatusResult.data) {
        const overRestStatus = overRestStatusResult.data;
        
        // Log over rest status for debugging
        console.log(`[PolicyDistribution] Over rest check for user ${userId}: isOverRest=${overRestStatus.isOverRest}, shouldTriggerActions=${overRestStatus.shouldTriggerActions}, restDuration=${overRestStatus.restDurationMinutes}min`);
        
        // Only include over rest policy if user is actually over rest
        if (overRestStatus.isOverRest && overRestStatus.shouldTriggerActions) {
          // Get over rest config for enforcement apps
          const overRestConfigResult = await overRestService.getConfig(userId);
          let overRestApps = overRestConfigResult.success && overRestConfigResult.data
            ? overRestConfigResult.data.apps.map(app => ({
                bundleId: app.bundleId,
                name: app.name,
              }))
            : [];

          // If no over rest apps configured, fall back to user's distraction apps
          // This ensures over rest enforcement works even without explicit configuration
          if (overRestApps.length === 0 && distractionApps.length > 0) {
            overRestApps = distractionApps.map(app => ({
              bundleId: app.bundleId,
              name: app.name,
            }));
            console.log(`[PolicyDistribution] Using ${overRestApps.length} distraction apps for over rest enforcement`);
          }

          overRest = {
            isOverRest: true,
            overRestMinutes: overRestStatus.overRestMinutes,
            enforcementApps: overRestApps,
            bringToFront: true, // Always bring app to front during over rest
          };

          console.log(`[PolicyDistribution] Over rest enforcement ACTIVE for user ${userId}: ${overRestStatus.overRestMinutes}min over, ${overRestApps.length} apps to enforce`);
        } else {
          console.log(`[PolicyDistribution] Over rest enforcement OMITTED for user ${userId}: isOverRest=${overRestStatus.isOverRest}, shouldTriggerActions=${overRestStatus.shouldTriggerActions}, overRestMinutes=${overRestStatus.overRestMinutes}, gracePeriodRemaining=${overRestStatus.gracePeriodRemaining}min`);
        }
      }

      // Compile REST enforcement configuration
      // Skip REST enforcement when OVER_REST is active — they are contradictory:
      // REST enforcement closes work apps, but OVER_REST wants the user to start working
      let restEnforcement: RestEnforcementPolicy | undefined;
      const isOverRestActive = !!overRest;
      if (settings.restEnforcementEnabled && !isOverRestActive) {
        const stateResult = await dailyStateService.getCurrentState(userId);
        if (stateResult.success && stateResult.data === 'rest') {
          const latestPomodoro = await prisma.pomodoro.findFirst({
            where: { userId, status: 'COMPLETED' },
            orderBy: { endTime: 'desc' },
          });

          const graceInfo = await restEnforcementService.getGraceInfo(
            userId,
            latestPomodoro?.id
          );

          if (!graceInfo.activeGrace) {
            const workApps = (settings.workApps as unknown as Array<{ bundleId: string; name: string }>) || [];
            restEnforcement = {
              isActive: true,
              workApps: workApps.map(app => ({
                bundleId: app.bundleId,
                name: app.name,
              })),
              actions: settings.restEnforcementActions.length > 0
                ? settings.restEnforcementActions
                : ['close'],
              grace: {
                available: graceInfo.remaining > 0,
                remaining: graceInfo.remaining,
                durationMinutes: graceInfo.durationMinutes,
              },
            };

            console.log(`[PolicyDistribution] REST enforcement ACTIVE for user ${userId}: ${workApps.length} work apps to enforce`);
          } else {
            console.log(`[PolicyDistribution] REST enforcement skipped for user ${userId}: grace is active`);
          }
        }
      }

      // Compile health limit notification
      let healthLimit: { type: '2hours' | 'daily'; message: string } | undefined;
      const healthLimitResult = await healthLimitService.checkHealthLimit(userId);
      if (healthLimitResult.exceeded && healthLimitResult.type) {
        healthLimit = {
          type: healthLimitResult.type,
          message: healthLimitResult.type === '2hours'
            ? "You've been working for 2+ hours continuously. Consider a longer break."
            : "You've worked over 10 hours today. Please take care of yourself.",
        };
      }

      // Check for active temporary unblock
      let temporaryUnblock: { active: boolean; endTime: number } | undefined;
      const exemptionResult = await screenTimeExemptionService.getActiveExemption(userId);
      if (exemptionResult.success && exemptionResult.data?.active) {
        temporaryUnblock = {
          active: true,
          endTime: exemptionResult.data.expiresAt.getTime(),
        };
      }

      // Build the policy object
      const policy: Policy = {
        version: newVersion,
        blacklist: settings.blacklist,
        whitelist: settings.whitelist,
        enforcementMode: settings.enforcementMode as 'strict' | 'gentle',
        workTimeSlots,
        skipTokens: {
          remaining: remainingTokens,
          maxPerDay: maxTokens,
          delayMinutes: settings.skipTokenMaxDelay,
        },
        distractionApps,
        updatedAt: Date.now(),
        // Include ad-hoc focus session if active (Requirements: 2.3)
        ...(adhocFocusSession && { adhocFocusSession }),
        // Include sleep time configuration (Requirements: 9.4, 11.1, 11.2)
        ...(sleepTime && { sleepTime }),
        // Include over rest configuration (Requirements: 15.2, 15.3, 16.1-16.5)
        ...(overRest && { overRest }),
        // Include REST enforcement configuration
        ...(restEnforcement && { restEnforcement }),
        // Include health limit notification
        ...(healthLimit && { healthLimit }),
        // Include temporary unblock if active
        ...(temporaryUnblock && { temporaryUnblock }),
      };

      // Validate the policy
      const validation = PolicySchema.safeParse(policy);
      if (!validation.success) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Compiled policy failed validation',
            details: { issues: validation.error.issues },
          },
        };
      }

      return { success: true, data: policy };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to compile policy',
        },
      };
    }
  },

  /**
   * Distribute policy to all connected clients for a user
   * Creates a new policy version and triggers broadcast
   * Requirements: 10.2, 10.3
   */
  async distributePolicy(userId: string): Promise<ServiceResult<{ version: number; clientsNotified: number }>> {
    try {
      // Compile the current policy
      const compileResult = await this.compilePolicy(userId);
      if (!compileResult.success || !compileResult.data) {
        return {
          success: false,
          error: compileResult.error || { code: 'INTERNAL_ERROR', message: 'Failed to compile policy' },
        };
      }

      const policy = compileResult.data;

      // Store the new policy version
      await db.policyVersion.create({
        data: {
          userId,
          version: policy.version,
          policy: policy as unknown as Record<string, unknown>,
        },
      });

      // Get count of online clients for this user
      const onlineClients = await prisma.clientRegistry.count({
        where: {
          userId,
          status: 'online',
          revokedAt: null,
        },
      });

      // Note: Actual WebSocket broadcast is handled by socket-broadcast.service
      // This service just prepares and stores the policy
      // The caller should use broadcastPolicyUpdate(userId) after this

      return {
        success: true,
        data: {
          version: policy.version,
          clientsNotified: onlineClients,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to distribute policy',
        },
      };
    }
  },

  /**
   * Get the current policy for a user
   * Always compiles a fresh policy to ensure real-time state accuracy
   * (especially for over rest status which depends on active pomodoro state)
   * Requirements: 10.1
   */
  async getCurrentPolicy(userId: string): Promise<ServiceResult<Policy>> {
    // Always compile a fresh policy to ensure accurate real-time state
    // This is critical for over rest detection which must check for active pomodoros
    // Caching was causing stale over rest state to be sent during active pomodoros
    return this.compilePolicy(userId);
  },

  /**
   * Check if a client's policy version is outdated
   * Requirements: 10.7
   */
  async isPolicyOutdated(userId: string, clientVersion: number): Promise<ServiceResult<boolean>> {
    try {
      const latestVersion = await db.policyVersion.findFirst({
        where: { userId },
        orderBy: { version: 'desc' },
        select: { version: true },
      }) as { version: number } | null;

      if (!latestVersion) {
        // No policy exists yet, client needs initial policy
        return { success: true, data: true };
      }

      return { success: true, data: clientVersion < latestVersion.version };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check policy version',
        },
      };
    }
  },

  /**
   * Resolve policy version conflict between client and server
   * Server policy is always authoritative
   * Requirements: 10.7
   */
  async resolveConflict(
    userId: string,
    clientId: string,
    clientVersion: number
  ): Promise<ServiceResult<{ policy: Policy; action: 'update' | 'none' }>> {
    try {
      // Check if client version is outdated
      const outdatedResult = await this.isPolicyOutdated(userId, clientVersion);
      if (!outdatedResult.success) {
        return {
          success: false,
          error: outdatedResult.error,
        };
      }

      if (!outdatedResult.data) {
        // Client is up to date
        const currentPolicy = await this.getCurrentPolicy(userId);
        if (!currentPolicy.success || !currentPolicy.data) {
          return {
            success: false,
            error: currentPolicy.error || { code: 'INTERNAL_ERROR', message: 'Failed to get policy' },
          };
        }
        return {
          success: true,
          data: { policy: currentPolicy.data, action: 'none' },
        };
      }

      // Client is outdated, get current policy
      const currentPolicy = await this.getCurrentPolicy(userId);
      if (!currentPolicy.success || !currentPolicy.data) {
        return {
          success: false,
          error: currentPolicy.error || { code: 'INTERNAL_ERROR', message: 'Failed to get policy' },
        };
      }

      // Log the conflict resolution
      console.log(
        `[PolicyDistribution] Resolved conflict for client ${clientId}: ` +
        `client version ${clientVersion} -> server version ${currentPolicy.data.version}`
      );

      return {
        success: true,
        data: { policy: currentPolicy.data, action: 'update' },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to resolve policy conflict',
        },
      };
    }
  },

  /**
   * Get policy version history for a user
   * Useful for debugging and auditing
   */
  async getPolicyHistory(
    userId: string,
    limit: number = 10
  ): Promise<ServiceResult<PolicyVersionRecord[]>> {
    try {
      const versions = await db.policyVersion.findMany({
        where: { userId },
        orderBy: { version: 'desc' },
        take: limit,
      }) as PolicyVersionRecord[];

      return { success: true, data: versions };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get policy history',
        },
      };
    }
  },

  /**
   * Get a specific policy version
   */
  async getPolicyVersion(
    userId: string,
    version: number
  ): Promise<ServiceResult<Policy | null>> {
    try {
      const policyVersion = await db.policyVersion.findUnique({
        where: {
          userId_version: {
            userId,
            version,
          },
        },
      }) as PolicyVersionRecord | null;

      if (!policyVersion) {
        return { success: true, data: null };
      }

      return { success: true, data: policyVersion.policy as unknown as Policy };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get policy version',
        },
      };
    }
  },

  /**
   * Clean up old policy versions, keeping only the most recent N versions
   */
  async cleanupOldVersions(
    userId: string,
    keepCount: number = 10
  ): Promise<ServiceResult<{ deletedCount: number }>> {
    try {
      // Get versions to keep
      const versionsToKeep = await db.policyVersion.findMany({
        where: { userId },
        orderBy: { version: 'desc' },
        take: keepCount,
        select: { id: true },
      }) as { id: string }[];

      const keepIds = versionsToKeep.map((v: { id: string }) => v.id);

      // Delete older versions
      const result = await db.policyVersion.deleteMany({
        where: {
          userId,
          id: { notIn: keepIds },
        },
      }) as { count: number };

      return { success: true, data: { deletedCount: result.count } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to cleanup old versions',
        },
      };
    }
  },
};

export default policyDistributionService;
