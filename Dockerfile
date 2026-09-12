# Builder: full deps for TypeScript compilation.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build

# Runner: production deps + compiled output only. No source, no devDeps,
# no secrets (all config arrives as environment). Non-root user.
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY scripts ./scripts
USER app
EXPOSE 3000
# Overridden per service (api migrates-then-serves, workers run loops).
CMD ["node", "dist/server.js"]
