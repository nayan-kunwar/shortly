import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  BASE_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().min(1).default('postgres://shortly:shortly@localhost:5432/shortly'),
});

export type AppEnv = z.infer<typeof envSchema>;

function loadEnv(): AppEnv {
  // Containers and shells often inject *empty* vars (e.g. BASE_URL="").
  // dotenv never overrides those, so without this an empty string would
  // shadow .env and fail validation. Empty means "unset": fall back to
  // the default instead of crashing on someone else's blank injection.
  const cleaned: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    cleaned[key] = value === '' ? undefined : value;
  }
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}

export const env: AppEnv = loadEnv();
