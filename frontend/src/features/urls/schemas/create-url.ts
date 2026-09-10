import { z } from 'zod';

/**
 * Mirrors the backend M2/M6 validation (never looser — §7 of the frontend spec).
 * Backend remains the truth; this schema exists for instant UX feedback.
 *
 * NOTE on empty strings: text inputs yield '' when untouched, but the wire
 * shape uses null for "absent". The form layer preprocesses '' → null so
 * this schema keeps backend parity ('' is invalid on the wire, too).
 */
const RESERVED_ALIASES: ReadonlySet<string> = new Set([
  'health',
  'ready',
  'metrics',
  'api',
  'admin',
  'www',
  'app',
  'static',
  'assets',
  'login',
  'logout',
  'settings',
  'create',
  'urls',
  'analytics',
  'dashboard',
  'help',
  'support',
  'status',
  'shortly',
]);

export const customAliasRule = z
  .string()
  .min(3, 'At least 3 characters.')
  .max(30)
  .regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, "-" and "_" only.')
  .refine(
    (v) => !RESERVED_ALIASES.has(v.toLowerCase()),
    (v) => ({
      message: `"${v}" is reserved.`,
    }),
  );

export const createUrlSchema = z.object({
  url: z
    .string({ required_error: 'Please enter a URL.' })
    .min(1, 'Please enter a URL.')
    .max(2048, 'URL is too long.')
    .refine((v) => {
      try {
        const parsed = new URL(v);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    }, 'Please enter a valid http(s) URL.'),
  customAlias: customAliasRule.nullish(),
  expiresAt: z
    .string()
    .refine((v) => {
      const t = new Date(v).getTime();
      return !Number.isNaN(t) && t > Date.now();
    }, 'Expiration must be in the future.')
    .nullish(),
});

export type CreateUrlForm = z.infer<typeof createUrlSchema>;
