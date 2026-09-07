import { z } from 'zod';

const MAX_URL_LENGTH = 2048; // Shared with the DB CHECK constraint (001_create_urls).
const MAX_ALIAS_LENGTH = 30;
const ALIAS_PATTERN = /^[A-Za-z0-9_-]+$/;

function isHttpHttps(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

/**
 * POST /api/v1/urls body. Deliberately M2-scoped:
 * - Alias rules are basic sanity (length + charset). Reserved words,
 *   case handling, and concurrency proof arrive in M6.
 * - `expiresAt` must be a future ISO timestamp. Lifecycle semantics (410,
 *   cleanup) arrive in M7.
 */
export const createUrlSchema = z.object({
  url: z
    .string({ required_error: 'url is required' })
    .min(1, 'url must not be empty')
    .max(MAX_URL_LENGTH, `url must be at most ${String(MAX_URL_LENGTH)} characters`)
    .refine(isHttpHttps, 'url must be a valid http(s) URL'),
  customAlias: z
    .string()
    .min(1, 'customAlias must not be empty')
    .max(MAX_ALIAS_LENGTH, `customAlias must be at most ${String(MAX_ALIAS_LENGTH)} characters`)
    .regex(ALIAS_PATTERN, 'customAlias may only contain letters, numbers, "-" and "_"')
    .nullish(),
  expiresAt: z
    .string()
    .datetime({ offset: true, message: 'expiresAt must be an ISO 8601 datetime' })
    .refine((v) => new Date(v).getTime() > Date.now(), 'expiresAt must be in the future')
    .nullish(),
});

export type CreateUrlRequest = z.infer<typeof createUrlSchema>;
