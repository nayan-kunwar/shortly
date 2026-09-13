# Builder: full deps for TypeScript compilation.
# Context: repo root (docker-compose sets build.context: ..)
FROM node:22-alpine AS builder
WORKDIR /app
# Install shared package first (both api and web depend on it)
COPY packages/shared/package.json packages/shared/package-lock.json* packages/shared/
COPY apps/api/package.json apps/api/package-lock.json* apps/api/
COPY apps/web/package.json apps/web/package-lock.json* apps/web/
COPY .npmrc tsconfig.base.json pnpm-workspace.yaml pnpm-lock.yaml package.json ./
# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile
# Build shared package
COPY packages/shared/src packages/shared/src
COPY packages/shared/tsconfig.json packages/shared/
RUN pnpm --filter @shortly/shared build
# Build API
COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/migrations apps/api/migrations
COPY apps/api/scripts apps/api/scripts
COPY apps/api/drizzle.config.ts apps/api/
RUN pnpm --filter @shortly/api build

# Runner: production deps + compiled output only.
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
# Install pnpm for workspace resolution
RUN npm install -g pnpm
# Copy workspace structure
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY .npmrc pnpm-workspace.yaml pnpm-lock.yaml package.json ./
RUN pnpm install --prod --frozen-lockfile
# Copy built artifacts
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/api/migrations apps/api/migrations
COPY apps/api/scripts apps/api/scripts
USER app
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
