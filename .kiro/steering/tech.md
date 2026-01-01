# Tech Stack

## Framework & Runtime
- Next.js 14 (App Router)
- React 19
- TypeScript 5.7 (strict mode)

## Database
- PostgreSQL via Prisma ORM
- Schema at `prisma/schema.prisma`

## Authentication
- NextAuth v4 with credentials provider
- JWT sessions (30-day expiry)
- Dev mode: `X-Dev-User-Email` header bypass

## Styling
- Tailwind CSS 3.4
- PostCSS

## Validation
- Zod for runtime schema validation

## State Management
- XState 5 for state machines

## Real-time
- Socket.io for WebSocket communication

## Testing
- Vitest for unit/integration tests
- fast-check for property-based testing

## Common Commands

```bash
# Development
npm run dev          # Start dev server

# Database
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to DB
npm run db:migrate   # Run migrations
npm run db:studio    # Open Prisma Studio

# Testing
npm run test         # Run tests once
npm run test:watch   # Run tests in watch mode

# Build & Lint
npm run build        # Production build
npm run lint         # ESLint check
```

## Path Aliases
- `@/*` maps to `./src/*`
