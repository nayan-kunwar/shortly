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
    },
  },
});
