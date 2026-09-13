import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  BASE_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().min(1).default('postgres://shortly:shortly@localhost:5432/shortly'),
  // Dev frontend origin for CORS. Non-production only; production is
  // same-origin (or gateway-handled) and must not echo arbitrary origins.
  CORS_ORIGIN: z.string().url().default('http://localhost:3001'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  REDIS_TTL: z.coerce.number().int().min(60).max(86400).default(3600),
  RATE_LIMIT_WINDOW: z.coerce.number().int().min(1).max(3600).default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(100000).default(100),
  RABBITMQ_URL: z.string().min(1).default('amqp://guest:guest@localhost:5672'),
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
