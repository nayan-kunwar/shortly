import { describe, expect, it } from 'vitest';
import { decodeBase62, encodeBase62, generateRandomCode } from '../../src/utils/base62.js';

describe('base62', () => {
  it('encodes zero as "0"', () => {
    expect(encodeBase62(0)).toBe('0');
    expect(decodeBase62('0')).toBe(0);
  });

  it('encodes small numbers to known vectors', () => {
    expect(encodeBase62(1)).toBe('1');
    expect(encodeBase62(61)).toBe('Z');
    expect(encodeBase62(62)).toBe('10');
    expect(encodeBase62(125)).toBe('21'); // 2*62 + 1
    expect(decodeBase62('10')).toBe(62);
    expect(decodeBase62('21')).toBe(125);
  });

  it('stays compact for realistic sequence ids', () => {
    // 1M urls → 4 chars; 1B urls → 6 chars. Compare 7-char random codes.
    expect(encodeBase62(1_000_000)).toHaveLength(4);
    expect(encodeBase62(1_000_000_000)).toHaveLength(6);
  });

  it('round-trips large numbers up to MAX_SAFE_INTEGER', () => {
    for (const n of [1, 62, 3843, 238327, 1_000_000, Number.MAX_SAFE_INTEGER]) {
      expect(decodeBase62(encodeBase62(n))).toBe(n);
    }
  });

  it('rejects negative, fractional, and unsafe integers on encode', () => {
    for (const bad of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => encodeBase62(bad)).toThrow(RangeError);
    }
  });

  it('rejects empty strings, foreign characters, and overflowing codes on decode', () => {
    expect(() => decodeBase62('')).toThrow();
    expect(() => decodeBase62('abc!')).toThrow();
    expect(() => decodeBase62('ab c')).toThrow();
    expect(() => decodeBase62('+/==')).toThrow();
    // 62^11 exceeds MAX_SAFE_INTEGER → must throw, not silently lose precision.
    expect(() => decodeBase62('ZZZZZZZZZZZ')).toThrow(RangeError);
  });
});

describe('generateRandomCode', () => {
  it('returns exactly the requested length', () => {
    for (const len of [1, 4, 7, 12, 20]) {
      expect(generateRandomCode(len)).toHaveLength(len);
    }
  });

  it('only contains Base62 characters [0-9a-zA-Z]', () => {
    const code = generateRandomCode(200);
    expect(code).toMatch(/^[0-9A-Za-z]+$/);
    expect(code).toHaveLength(200);
  });

  it('produces different codes across calls', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRandomCode(7)));
    expect(codes.size).toBeGreaterThan(1);
  });

  it('throws RangeError for length <= 0', () => {
    expect(() => generateRandomCode(0)).toThrow(RangeError);
    expect(() => generateRandomCode(-1)).toThrow(RangeError);
  });

  it('throws RangeError for non-integer length', () => {
    expect(() => generateRandomCode(1.5)).toThrow(RangeError);
  });
});
