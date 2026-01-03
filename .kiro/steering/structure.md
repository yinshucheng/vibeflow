---
inclusion: always
---

# Project Structure & Code Conventions

## Directory Layout

```
src/
├── app/           # Next.js App Router pages and API routes
├── components/    # React components by domain (goals/, tasks/, pomodoro/, etc.)
├── hooks/         # Custom React hooks (use-*.ts)
├── lib/           # Core utilities: auth, prisma, trpc, socket-client
├── machines/      # XState 5 state machines
├── mcp/           # Model Context Protocol server for AI integration
├── middleware/    # Request middleware (auth, rate-limit)
├── server/        # tRPC routers and socket handlers
├── services/      # Business logic layer (all DB operations here)
└── types/         # TypeScript declarations (.d.ts)

prisma/schema.prisma    # Database schema (source of truth)
tests/property/         # Property-based tests (fast-check)
e2e/                    # Playwright E2E tests with fixtures
```

## Service Layer Pattern

All business logic lives in `src/services/`. Services are singleton objects.

```typescript
// Schema first, then service
export const CreateEntitySchema = z.object({ name: z.string().min(1) });
export type CreateEntityInput = z.infer<typeof CreateEntitySchema>;

export const entityService = {
  async create(userId: string, data: CreateEntityInput): Promise<ServiceResult<Entity>> {
    const validated = CreateEntitySchema.parse(data);
    // Always verify userId ownership before data access
    const entity = await prisma.entity.create({ data: { ...validated, userId } });
    return { success: true, data: entity };
  },
};
```

ServiceResult return type (required for all service methods):
```typescript
type ServiceResult<T> = 
  | { success: true; data: T }
  | { success: false; error: { code: ErrorCode; message: string; details?: Record<string, string[]> } };

type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | 'AUTH_ERROR';
```

## tRPC Router Pattern

Routers in `src/server/routers/` are thin wrappers—no business logic.

```typescript
export const entityRouter = router({
  create: protectedProcedure
    .input(CreateEntitySchema)
    .mutation(async ({ ctx, input }) => {
      const result = await entityService.create(ctx.user.userId, input);
      if (!result.success) {
        throw new TRPCError({
          code: result.error.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error.message,
        });
      }
      return result.data;
    }),
});
```

## React Component Conventions

```typescript
'use client';  // Required for client components

import { trpc } from '@/lib/trpc';  // Use @/ path alias

export function EntityList() {
  const { data } = trpc.entity.list.useQuery();
  const utils = trpc.useUtils();
  
  const createMutation = trpc.entity.create.useMutation({
    onSuccess: () => utils.entity.list.invalidate(),  // Always invalidate after mutations
  });
}
```

Components organized by domain: `components/goals/`, `components/tasks/`, `components/pomodoro/`

## State Management

| Type | Solution |
|------|----------|
| Complex flows | XState machines in `src/machines/` |
| Server state | tRPC queries/mutations |
| Local UI state | React useState/useReducer |

## Testing Conventions

| Type | Location | Naming |
|------|----------|--------|
| Property tests | `tests/property/` | `*.property.ts` |
| E2E tests | `e2e/tests/` | `*.spec.ts` |
| Test factories | `e2e/fixtures/factories/` | `*.factory.ts` |

## Critical Rules

1. Services verify `userId` ownership before any data access
2. Broadcast after state mutations: `socketBroadcastService.broadcastStateChange(userId, state)`
3. Zod schemas for all input validation (define once, reuse in router and service)
4. Routers stay thin—delegate to services
5. Use `prisma` from `@/lib/prisma` (singleton instance)
6. Export services from `src/services/index.ts`
