import { describe, expect, it } from 'vitest';
import { anonymizeIp, buildClickEvent, cleanReferer } from '../../src/analytics/click-event.js';

describe('anonymizeIp', () => {
  it('zeroes the last IPv4 octet', () => {
    expect(anonymizeIp('203.0.113.42')).toBe('203.0.113.0');
  });

  it('unwraps IPv4-mapped IPv6 (what Express reports for localhost)', () => {
    expect(anonymizeIp('::ffff:127.0.0.1')).toBe('127.0.0.0');
  });

  it('masks native IPv6 beyond the prefix', () => {
    expect(anonymizeIp('2001:db8:abcd:12::1')).toBe('2001:db8:abcd:0:0:0:0:0');
    expect(anonymizeIp('::1')).toBe('0:0:0:0:0:0:0:0');
  });

  it('returns null for missing or unparseable input', () => {
    expect(anonymizeIp(null)).toBeNull();
    expect(anonymizeIp('')).toBeNull();
    expect(anonymizeIp('not-an-ip')).toBeNull();
    expect(anonymizeIp('999.1.1.1.1')).toBeNull();
    expect(anonymizeIp('foo:bar::baz')).toBeNull();
  });
});

describe('cleanReferer', () => {
  it('keeps origin + path, strips query and fragment', () => {
    expect(cleanReferer('https://search.example/q?token=secret#pos1')).toBe(
      'https://search.example/q',
    );
  });

  it('returns null for missing, relative, or non-http(s) input', () => {
    expect(cleanReferer(null)).toBeNull();
    expect(cleanReferer('')).toBeNull();
    expect(cleanReferer('/relative/path')).toBeNull();
    expect(cleanReferer('javascript:alert(1)')).toBeNull();
    expect(cleanReferer('::::')).toBeNull();
  });
});

describe('buildClickEvent', () => {
  it('builds a sanitized url.clicked event', () => {
    const event = buildClickEvent({
      shortCode: 'a1',
      ip: '203.0.113.42',
      userAgent: 'test-agent/1.0',
      referer: 'https://from.example/page?x=1',
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(event).toEqual({
      eventType: 'url.clicked',
      shortCode: 'a1',
      clickedAt: '2026-01-01T00:00:00.000Z',
      ip: '203.0.113.0',
      userAgent: 'test-agent/1.0',
      referer: 'https://from.example/page',
    });
  });

  it('nulls absent user agent', () => {
    const event = buildClickEvent({ shortCode: 'a1', ip: null, userAgent: '', referer: null });
    expect(event.userAgent).toBeNull();
    expect(event.ip).toBeNull();
  });
});
