import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { restEnforcementService } from '@/services/rest-enforcement.service';

export const restEnforcementRouter = router({
  requestGrace: protectedProcedure
    .input(z.object({ pomodoroId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await restEnforcementService.requestGrace(ctx.user.userId, input.pomodoroId);
      return result;
    }),

  requestSkipRest: protectedProcedure
    .mutation(async ({ ctx }) => {
      const result = await restEnforcementService.requestSkipRest(ctx.user.userId);
      if (!result.allowed) {
        throw new TRPCError({ code: 'FORBIDDEN', message: result.reason ?? 'Skip rest not allowed' });
      }
      return result;
    }),
});
