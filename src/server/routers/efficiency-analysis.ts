/**
 * Efficiency Analysis tRPC Router
 * 
 * Provides endpoints for historical efficiency analysis, time period breakdowns,
 * productivity heatmaps, and smart goal suggestions.
 * 
 * Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.1.1-24.1.6, 25.1-25.4
 */

import { z } from 'zod';
import { router, readProcedure } from '../trpc';
import { efficiencyAnalysisService } from '@/services/efficiency-analysis.service';

export const efficiencyAnalysisRouter = router({
  /**
   * Get historical analysis for the authenticated user
   * Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.1.1-24.1.6, 25.1, 25.2
   */
  getHistoricalAnalysis: readProcedure
    .input(
      z.object({
        days: z.number().int().min(7).max(365).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const result = await efficiencyAnalysisService.getHistoricalAnalysis(
        ctx.user.userId,
        input.days
      );

      if (!result.success) {
        throw new Error(result.error?.message ?? 'Failed to get historical analysis');
      }

      return result.data;
    }),

  /**
   * Get efficiency breakdown by time period
   * Requirements: 24.1.1, 24.1.2, 24.1.3
   */
  getEfficiencyByTimePeriod: readProcedure
    .input(
      z.object({
        days: z.number().int().min(7).max(365).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const result = await efficiencyAnalysisService.getEfficiencyByTimePeriod(
        ctx.user.userId,
        input.days
      );

      if (!result.success) {
        throw new Error(result.error?.message ?? 'Failed to get efficiency by time period');
      }

      return result.data;
    }),

  /**
   * Get hourly productivity heatmap
   * Requirements: 24.1.6
   */
  getHourlyHeatmap: readProcedure
    .input(
      z.object({
        days: z.number().int().min(7).max(365).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const result = await efficiencyAnalysisService.getHourlyHeatmap(
        ctx.user.userId,
        input.days
      );

      if (!result.success) {
        throw new Error(result.error?.message ?? 'Failed to get hourly heatmap');
      }

      return result.data;
    }),

  /**
   * Get smart goal suggestion
   * Requirements: 25.1, 25.2
   */
  getSuggestedGoal: readProcedure.query(async ({ ctx }) => {
    const result = await efficiencyAnalysisService.getSuggestedGoal(ctx.user.userId);

    if (!result.success) {
      throw new Error(result.error?.message ?? 'Failed to get suggested goal');
    }

    return result.data;
  }),

  /**
   * Check if a goal is realistic
   * Requirements: 25.3, 25.4
   */
  isGoalRealistic: readProcedure
    .input(
      z.object({
        goal: z.number().int().min(1).max(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const result = await efficiencyAnalysisService.isGoalRealistic(
        ctx.user.userId,
        input.goal
      );

      if (!result.success) {
        throw new Error(result.error?.message ?? 'Failed to check goal realism');
      }

      return result.data;
    }),
});
