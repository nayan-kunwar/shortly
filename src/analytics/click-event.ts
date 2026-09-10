/**
 * `url.clicked` — the only analytics event (M9). Emitted fire-and-forget on
 * successful redirects; persistence/transport arrive with the outbox (M10).
 */
export interface ClickEvent {
  eventType: 'url.clicked';
  shortCode: string;
  /** ISO timestamp of the click. */
  clickedAt: string;
  /** Anonymized client IP (never raw — see anonymizeIp). Null if unknown. */
  ip: string | null;
  /** Raw User-Agent (parsed downstream in M11+; stored, not judged, here). */
  userAgent: string | null;
  /** Referer origin + path only — query/fragment stripped (they leak tokens). */
  referer: string | null;
}

/** Raw request context the controller extracts; the builder sanitizes it. */
export interface ClickContext {
  shortCode: string;
  ip: string | null;
  userAgent: string | null;
  referer: string | null;
  now?: Date;
}

/**
 * Anonymize a client IP. IPv4 → /24 (last octet zeroed); IPv6 → /48
 * (interface bits zeroed). Unparseable input → null (it isn't an address).
 * Rationale: city-level analytics survives; individual identification doesn't.
 */
export function anonymizeIp(ip: string | null | undefined): string | null {
  if (typeof ip !== 'string' || ip.length === 0) return null;
  if (ip.includes('.') && !ip.includes(':')) {
    const parts = ip.split('.');
    if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (ip.includes(':')) {
    // IPv4-mapped IPv6 (::ffff:127.0.0.1) is what Express reports for
    // localhost — anonymize the embedded v4 address, not the wrapper.
    const embedded = ip.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    if (embedded?.[1] !== undefined) return anonymizeIp(embedded[1]);
    const head = ip.split('::')[0] ?? '';
    const groups = head.split(':').filter((g) => g.length > 0);
    // Empty head (::1, ::) anonymizes to all-zeros; non-hex is not an address.
    if (groups.length > 8 || groups.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
    const kept = groups.slice(0, 3);
    while (kept.length < 8) kept.push('0');
    return kept.join(':');
  }
  return null;
}

/**
 * Keep only origin + path of a referer. Query strings and fragments carry
 * session tokens and search terms — analytics has no business storing them.
 * Non-absolute or non-http(s) input → null.
 */
export function cleanReferer(referer: string | null | undefined): string | null {
  if (typeof referer !== 'string' || referer.length === 0) return null;
  try {
    const parsed = new URL(referer);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

export function buildClickEvent(ctx: ClickContext): ClickEvent {
  return {
    eventType: 'url.clicked',
    shortCode: ctx.shortCode,
    clickedAt: (ctx.now ?? new Date()).toISOString(),
    ip: anonymizeIp(ctx.ip),
    userAgent: typeof ctx.userAgent === 'string' && ctx.userAgent.length > 0 ? ctx.userAgent : null,
    referer: cleanReferer(ctx.referer),
  };
}

/** Fire-and-forget sink. Synchronous by contract: the redirect never awaits it. */
export interface ClickEmitter {
  emit(event: ClickEvent): void;
}

/** M9 default: structured log line. M10 swaps in the outbox writer. */
export class LogClickEmitter implements ClickEmitter {
  emit(event: ClickEvent): void {
    console.log(
      `click shortCode=${event.shortCode} ip=${event.ip ?? '-'} ua=${event.userAgent ?? '-'}`,
    );
  }
}

/** Silent sink for tests that don't assert emission. */
export const noopClickEmitter: ClickEmitter = {
  emit: () => undefined,
};

/** Collecting sink for emission tests. */
export class CollectingClickEmitter implements ClickEmitter {
  readonly events: ClickEvent[] = [];
  emit(event: ClickEvent): void {
    this.events.push(event);
  }
}
