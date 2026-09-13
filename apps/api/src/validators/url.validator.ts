import { z } from 'zod';
import {
  MAX_URL_LENGTH,
  MIN_ALIAS_LENGTH,
  MAX_ALIAS_LENGTH,
  ALIAS_PATTERN,
  isReservedAlias,
} from '@shortly/shared';

// Re-export for consumers that import from this module.
export { isReservedAlias } from '@shortly/shared';

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
 * POST /api/v1/urls body.
 * Alias rules (M6-hardened): length 3–30 (anti-squatting, visually distinct
 * from early 1–2 char generated codes), charset, reserved words. Aliases are
 * CASE-SENSITIVE, consistent with Base62 codes — 'GitHub' and 'github' are
 * different links. Race safety comes from the DB unique constraint (the
 * service maps 23505 → 409), never from check-then-insert.
 * `expiresAt` must be a future ISO timestamp. Lifecycle semantics (410,
 * cleanup) arrive in M7.
 */
export const createUrlSchema = z.object({
  url: z
    .string({ required_error: 'url is required' })
    .min(1, 'url must not be empty')
    .max(MAX_URL_LENGTH, `url must be at most ${String(MAX_URL_LENGTH)} characters`)
    .refine(isHttpHttps, 'url must be a valid http(s) URL'),
  customAlias: z
    .string()
    .min(MIN_ALIAS_LENGTH, `customAlias must be at least ${String(MIN_ALIAS_LENGTH)} characters`)
    .max(MAX_ALIAS_LENGTH, `customAlias must be at most ${String(MAX_ALIAS_LENGTH)} characters`)
    .regex(ALIAS_PATTERN, 'customAlias may only contain letters, numbers, "-" and "_"')
    .refine(
      (v) => !isReservedAlias(v),
      (v) => ({ message: `customAlias "${v}" is reserved` }),
    )
    .nullish(),
  expiresAt: z
    .string()
    .datetime({ offset: true, message: 'expiresAt must be an ISO 8601 datetime' })
    .refine((v) => new Date(v).getTime() > Date.now(), 'expiresAt must be in the future')
    .nullish(),
});

export type CreateUrlRequest = z.infer<typeof createUrlSchema>;

/**
 * Opaque keyset cursor: base64url("url:<id>"). Opaque (not a bare id) so
 * clients treat it as a token and the encoding can evolve (e.g. composite
 * keys later) without a contract break.
 */
export function encodeCursor(id: number): string {
  return Buffer.from(`url:${String(id)}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): number | null {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const match = /^url:(\d+)$/.exec(decoded);
  if (match?.[1] === undefined) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** GET /api/v1/urls query. Cursor decoded to an id (400 on garbage). */
export const listUrlsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  cursor: z
    .string()
    .max(200)
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      const id = decodeCursor(v);
      if (id === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor' });
        return z.NEVER;
      }
      return id;
    }),
});

export type ListUrlsQuery = z.infer<typeof listUrlsQuerySchema>;
