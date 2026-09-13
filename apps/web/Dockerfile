# Builder: full deps for Next.js build.
# Context: repo root (docker-compose sets build.context: ..)
FROM node:22-alpine AS builder
WORKDIR /app
# Install shared package first
COPY packages/shared/package.json packages/shared/package-lock.json* packages/shared/
COPY apps/web/package.json apps/web/package-lock.json* apps/web/
COPY pnpm-workspace.yaml package.json ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
# Build shared package
COPY packages/shared/src packages/shared/src
COPY packages/shared/tsconfig.json packages/shared/
RUN pnpm --filter @shortly/shared build
# Build web
COPY apps/web/src apps/web/src
COPY apps/web/tsconfig.json apps/web/
COPY apps/web/next.config.ts apps/web/
COPY apps/web/postcss.config.mjs apps/web/
COPY apps/web/public apps/web/public
RUN pnpm --filter @shortly/web build

# Runner: production deps + Next.js output.
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
RUN npm install -g pnpm
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY pnpm-workspace.yaml package.json ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/apps/web/.next apps/web/.next
COPY --from=builder /app/apps/web/node_modules apps/web/node_modules
COPY apps/web/public apps/web/public
USER app
EXPOSE 3001
CMD ["node", "apps/web/node_modules/.bin/next", "start", "-p", "3001"]
