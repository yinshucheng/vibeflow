/**
 * Over Rest tRPC Router
 * 
 * Exposes over rest configuration and status endpoints.
 * Requirements: 15.2, 15.3, 16.1, 16.2, 16.3, 16.4, 16.5
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { overRestService, OverRestActionSchema, OverRestAppSchema } from '@/services/over-rest.service';

// Update config schema
const UpdateOverRestConfigSchema = z.object({
  gracePeriod: z.number().min(1).max(10).optional(),
  actions: z.array(OverRestActionSchema).optional(),
  apps: z.array(OverRestAppSchema).optional(),
});

export const overRestRouter = router({
  /**
   * Get over rest configuration
   * Requirements: 16.2, 16.3, 16.5
   */
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const result = await overRestService.getConfig(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get over rest config',
      });
    }
    
    return result.data;
  }),

  /**
   * Update over rest configuration
   * Requirements: 16.2, 16.3, 16.5
   */
  updateConfig: protectedProcedure
    .input(UpdateOverRestConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await overRestService.updateConfig(ctx.user.userId, input);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to update over rest config',
        });
      }
      
      return result.data;
    }),

  /**
   * Check current over rest status
   * Requirements: 15.2, 15.3
   */
  checkStatus: protectedProcedure.query(async ({ ctx }) => {
    const result = await overRestService.checkOverRestStatus(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to check over rest status',
      });
    }
    
    return result.data;
  }),

  /**
   * Get actions to execute when over rest is triggered
   * Requirements: 16.1, 16.4
   */
  getActions: protectedProcedure.query(async ({ ctx }) => {
    const result = await overRestService.getOverRestActions(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get over rest actions',
      });
    }
    
    return result.data;
  }),

  /**
   * Add an app to the over rest apps list
   * Requirements: 16.3
   */
  addApp: protectedProcedure
    .input(OverRestAppSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await overRestService.addOverRestApp(ctx.user.userId, input);
      
      if (!result.success) {
        const code = result.error?.code === 'CONFLICT' ? 'CONFLICT' 
          : result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' 
          : 'INTERNAL_SERVER_ERROR';
        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to add over rest app',
        });
      }
      
      return result.data;
    }),

  /**
   * Remove an app from the over rest apps list
   * Requirements: 16.3
   */
  removeApp: protectedProcedure
    .input(z.object({ bundleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await overRestService.removeOverRestApp(ctx.user.userId, input.bundleId);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to remove over rest app',
        });
      }
      
      return result.data;
    }),

  /**
   * Get preset apps for over rest
   */
  getPresetApps: protectedProcedure.query(async () => {
    return overRestService.getPresetApps();
  }),
});
