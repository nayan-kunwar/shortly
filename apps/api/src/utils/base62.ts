/** Base62 alphabet: 0-9, a-z, A-Z. Order matters — it defines the encoding. */
export const BASE62_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const BASE = BASE62_ALPHABET.length;

/**
 * Encode a non-negative safe integer to a compact Base62 string.
 * Used as: Postgres sequence id → short code. Deterministic: the same id
 * always yields the same code, so collisions are impossible by construction.
 */
export function encodeBase62(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`encodeBase62 expects a non-negative safe integer, got ${String(value)}`);
  }
  if (value === 0) return BASE62_ALPHABET[0] as string;
  let rest = value;
  let out = '';
  while (rest > 0) {
    const digit = BASE62_ALPHABET[rest % BASE];
    if (digit === undefined) throw new Error('Base62 alphabet index out of range');
    out = digit + out;
    rest = Math.floor(rest / BASE);
  }
  return out;
}

/**
 * Decode a Base62 string back to its integer. Inverse of encodeBase62.
 * Throws on empty input, foreign characters, or values beyond
 * Number.MAX_SAFE_INTEGER (codes for larger ids need BigInt — a documented
 * future step, not today's need).
 */
export function decodeBase62(code: string): number {
  if (code.length === 0) {
    throw new Error('decodeBase62 expects a non-empty string');
  }
  let value = 0;
  for (const char of code) {
    const digit = BASE62_ALPHABET.indexOf(char);
    if (digit === -1) {
      throw new Error(`Invalid Base62 character: ${JSON.stringify(char)}`);
    }
    value = value * BASE + digit;
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(
        `Base62 value overflows Number.MAX_SAFE_INTEGER: ${JSON.stringify(code)}`,
      );
    }
  }
  return value;
}
