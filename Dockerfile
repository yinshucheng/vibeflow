# China mirror (Docker Hub is blocked in mainland China)
ARG REGISTRY=docker.1ms.run/library/

# ============================================
# Stage 1: Install dependencies
# ============================================
FROM ${REGISTRY}node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma/
COPY packages/ ./packages/

RUN npm config set registry https://registry.npmmirror.com \
    && npm ci --omit=dev
RUN npx prisma generate

# ============================================
# Stage 2: Build
# ============================================
FROM ${REGISTRY}node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma/
COPY packages/ ./packages/
RUN npm config set registry https://registry.npmmirror.com \
    && npm ci
RUN npx prisma generate

COPY . .

# Build Next.js
RUN npm run build

# Build custom server (tsc + tsc-alias → dist/)
RUN npm run build:server

# ============================================
# Stage 3: Production
# ============================================
FROM ${REGISTRY}node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV TZ=Asia/Shanghai

RUN apk add --no-cache openssl tzdata curl \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo $TZ > /etc/timezone

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Production node_modules (from deps stage, --omit=dev)
COPY --from=deps /app/node_modules ./node_modules

# Next.js build output
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Custom server build output
COPY --from=builder /app/dist ./dist

# Prisma schema (needed for migrations)
COPY --from=builder /app/prisma ./prisma

# Package.json (needed for node resolution)
COPY --from=builder /app/package.json ./

# Workspace packages (needed for @vibeflow/octopus-protocol resolution)
COPY --from=builder /app/packages ./packages

# Next.js config
COPY --from=builder /app/next.config.js ./

RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

CMD ["node", "dist/server.js"]
