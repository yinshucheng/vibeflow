import { z } from 'zod';
import { router, readProcedure, writeProcedure } from '../trpc';
import { restEnforcementService } from '@/services/rest-enforcement.service';

export const restEnforcementRouter = router({
  requestGrace: writeProcedure
    .input(z.object({ pomodoroId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await restEnforcementService.requestGrace(ctx.user.userId, input.pomodoroId);
      return result;
    }),

  requestSkipRest: writeProcedure
    .mutation(async ({ ctx }) => {
      const result = await restEnforcementService.requestSkipRest(ctx.user.userId);
      return result;
    }),

  getGraceInfo: readProcedure
    .query(async ({ ctx }) => {
      return restEnforcementService.getGraceInfo(ctx.user.userId);
    }),
});
