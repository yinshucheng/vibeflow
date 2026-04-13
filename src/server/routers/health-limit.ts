import { TRPCError } from '@trpc/server';
import { router, readProcedure } from '../trpc';
import { healthLimitService } from '@/services/health-limit.service';

export const healthLimitRouter = router({
  checkLimit: readProcedure
    .query(async ({ ctx }) => {
      const result = await healthLimitService.checkHealthLimit(ctx.user.userId);
      return result;
    }),

  getSkipTokenStatus: readProcedure
    .query(async ({ ctx }) => {
      const result = await healthLimitService.canUseSkipToken(ctx.user.userId);
      return result;
    }),
});
