import { randomInt } from 'node:crypto';

/** Base62 alphabet — shared with the M3 encoder when it lands. */
export const BASE62_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * INTERIM generator (M2). Random codes with retry-on-conflict in the service.
 * M3 replaces this with sequence-id → Base62 encoding: deterministic,
 * collision-free by construction, and shorter on average for early ids.
 * Kept in its own module so M3 swaps one file, not the service.
 */
export function generateShortCode(length = 7): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += BASE62_ALPHABET[randomInt(BASE62_ALPHABET.length)];
  }
  return code;
}
