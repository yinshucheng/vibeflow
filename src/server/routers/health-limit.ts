import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { healthLimitService } from '@/services/health-limit.service';

export const healthLimitRouter = router({
  checkLimit: protectedProcedure
    .query(async ({ ctx }) => {
      const result = await healthLimitService.checkHealthLimit(ctx.user.userId);
      return result;
    }),

  getSkipTokenStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const result = await healthLimitService.canUseSkipToken(ctx.user.userId);
      return result;
    }),
});
