import type { Request } from 'express';

/**
 * Extract the real client IP from the request, handling multi-hop proxies
 * (e.g. Render, Cloudflare). `req.ip` peels only `trust proxy` hops from
 * the right of X-Forwarded-For; behind 3+ proxies it returns a private IP.
 *
 * Strategy (in order):
 * 1. CF-Connecting-IP (Cloudflare — single hop, always real client).
 * 2. X-Forwarded-For leftmost non-private IP (real client is first entry).
 * 3. req.ip fallback (direct connections / local dev).
 */
export function realClientIp(req: Request): string | null {
  // Cloudflare sets this to the real client IP — best source when available.
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.length > 0) return cf;

  // X-Forwarded-For: "client, proxy1, proxy2, ..."
  // The leftmost entry is always the original client.
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const candidates = xff.split(',').map((s) => s.trim());
    for (const ip of candidates) {
      if (!isPrivateIp(ip)) return ip;
    }
  }

  // Direct connection — req.ip is fine here.
  return req.ip ?? null;
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    // IPv6 loopback/link-local
    if (ip === '::1' || ip === '::' || ip.startsWith('fe80:')) return true;
    // IPv4-mapped IPv6
    const embedded = ip.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    if (embedded?.[1] !== undefined) return isPrivateIp(embedded[1]);
    return false;
  }
  // IPv4
  if (ip === '127.0.0.1' || ip === '0.0.0.0') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1] ?? '0', 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith('192.168.')) return true;
  return false;
}
