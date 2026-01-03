---
inclusion: always
---

# Tech Stack

## Core Technologies

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Next.js 14 | App Router only, no Pages Router |
| UI | React 19 | Use `'use client'` directive for client components |
| Language | TypeScript 5.7 | Strict mode enabled |
| Database | PostgreSQL + Prisma | Schema: `prisma/schema.prisma` |
| Auth | NextAuth v4 | JWT sessions, 30-day expiry |
| Styling | Tailwind CSS 3.4 | PostCSS configured |
| Validation | Zod | All inputs must be validated |
| State | XState 5 | Complex flows only |
| Real-time | Socket.io | WebSocket communication |

## Import Conventions

```typescript
// Always use path alias for src imports
import { prisma } from '@/lib/prisma';
import { trpc } from '@/lib/trpc';
```

Path alias: `@/*` → `./src/*`

## Dev Auth Bypass

In non-production, use header `X-Dev-User-Email: test@example.com` to bypass auth.

## Commands

```bash
npm run dev           # Dev server
npm run test          # Tests (single run)
npm run db:generate   # Prisma client
npm run db:push       # Push schema
npm run db:migrate    # Run migrations
npm run build         # Production build
npm run lint          # ESLint
```

## Testing Stack

| Type | Tool | Location |
|------|------|----------|
| Property tests | fast-check + Vitest | `tests/property/*.property.ts` |
| E2E tests | Playwright | `e2e/tests/*.spec.ts` |

## Key Constraints

- TypeScript strict mode: no `any`, explicit return types on public APIs
- Zod schemas define validation once, reuse in routers and services
- Prisma is the only database access layer
- Socket.io broadcasts required after state mutations
