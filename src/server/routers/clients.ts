/**
 * Clients tRPC Router
 * 
 * Exposes endpoints for managing connected client devices.
 * Requirements: 9.3, 9.5
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { clientRegistryService } from '@/services/client-registry.service';

export const clientsRouter = router({
  /**
   * Get all connected clients for the current user
   * Requirements: 9.3
   * 
   * Returns all registered clients (both online and offline) for the user.
   * Excludes revoked clients.
   */
  getConnectedClients: protectedProcedure.query(async ({ ctx }) => {
    const result = await clientRegistryService.getClientsByUser(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get connected clients',
      });
    }
    
    return result.data ?? [];
  }),

  /**
   * Get only online clients for the current user
   */
  getOnlineClients: protectedProcedure.query(async ({ ctx }) => {
    const result = await clientRegistryService.getOnlineClients(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get online clients',
      });
    }
    
    return result.data ?? [];
  }),

  /**
   * Revoke a client device
   * Requirements: 9.5
   * 
   * Marks a client as revoked, preventing future connections.
   * The user must own the client to revoke it.
   */
  revokeClient: protectedProcedure
    .input(z.object({ clientId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await clientRegistryService.revokeClient(
        ctx.user.userId,
        input.clientId
      );
      
      if (!result.success) {
        const errorCode = result.error?.code;
        
        if (errorCode === 'NOT_FOUND') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: result.error?.message ?? 'Client not found',
          });
        }
        
        if (errorCode === 'FORBIDDEN') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: result.error?.message ?? 'You do not have permission to revoke this client',
          });
        }
        
        if (errorCode === 'CONFLICT') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: result.error?.message ?? 'Client is already revoked',
          });
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to revoke client',
        });
      }
      
      return { success: true };
    }),

  /**
   * Get a specific client by ID
   */
  getClient: protectedProcedure
    .input(z.object({ clientId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const result = await clientRegistryService.getClientById(input.clientId, ctx.user!.userId);
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get client',
        });
      }
      
      const client = result.data;
      
      if (!client) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Client not found',
        });
      }
      
      // Verify ownership
      if (client.userId !== ctx.user.userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this client',
        });
      }
      
      return client;
    }),

  /**
   * Get clients by type for the current user
   */
  getClientsByType: protectedProcedure
    .input(z.object({ 
      clientType: z.enum(['web', 'desktop', 'browser_ext', 'mobile']) 
    }))
    .query(async ({ ctx, input }) => {
      const result = await clientRegistryService.getClientsByType(
        ctx.user.userId,
        input.clientType
      );
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get clients by type',
        });
      }
      
      return result.data ?? [];
    }),
});
