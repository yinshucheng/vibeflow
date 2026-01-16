import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { healthLimitService } from '@/services/health-limit.service';

export const healthLimitRouter = router({
  checkHealthLimit: protectedProcedure
    .query(async ({ ctx }) => {
      const result = await healthLimitService.checkHealthLimit(ctx.user.userId);
      return result;
    }),

  canUseSkipToken: protectedProcedure
    .query(async ({ ctx }) => {
      const result = await healthLimitService.canUseSkipToken(ctx.user.userId);
      return result;
    }),
});
