import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    // The Vitest worker runtime injects BASE_URL="/" into process.env.
    // Pin our documented value so env validation sees the real config.
    env: {
      BASE_URL: 'http://localhost:3000',
      // Mute request logs in tests; error paths log explicitly regardless.
      LOG_LEVEL: 'error',
    },
    // Integration suites share one PostgreSQL and TRUNCATE between tests,
    // so files must not run in parallel workers — a truncate in file A
    // would wipe rows file B just created. Sequential files, fast enough.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
