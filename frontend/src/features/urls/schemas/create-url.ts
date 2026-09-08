import { z } from 'zod';

/**
 * Mirrors the backend M2 validation (never looser — §7 of the frontend spec).
 * Backend remains the truth; this schema exists for instant UX feedback.
 *
 * NOTE on empty strings: text inputs yield '' when untouched, but the wire
 * shape uses null for "absent". The form layer preprocesses '' → null so
 * this schema keeps backend parity ('' is invalid on the wire, too).
 */
export const customAliasRule = z
  .string()
  .min(1)
  .max(30)
  .regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, "-" and "_" only.');

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
