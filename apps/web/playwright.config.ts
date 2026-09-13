import { defineConfig } from '@playwright/test';

/**
 * E2E against the real stack. Prerequisite: PostgreSQL + Redis running
 * (docker compose up -d postgres redis) with migrations applied
 * (npm run db:migrate from the repo root). Servers auto-start unless
 * already running.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3001' },
  webServer: [
    {
      command: 'npm run dev',
      cwd: '..',
      port: 3000,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      command: 'npm run dev',
      port: 3001,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
