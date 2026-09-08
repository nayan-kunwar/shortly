import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom for component tests; pure-TS suites (api client, schemas) run
    // fine in it too — one environment keeps F0 tooling minimal.
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    globals: false,
    setupFiles: ['./src/vitest.setup.ts'],
  },
});
