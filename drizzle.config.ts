import { defineConfig } from 'drizzle-kit';

// Migrations are hand-written SQL in ./migrations (see M1 doc for why).
// This config exists so `drizzle-kit` can check/generate from the schema
// if we ever adopt generated migrations later.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://shortly:shortly@localhost:5432/shortly',
  },
});
