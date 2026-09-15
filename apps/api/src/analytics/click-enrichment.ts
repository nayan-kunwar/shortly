import { UAParser } from 'ua-parser-js';
import geoip from 'geoip-lite';
import type { ClickEvent } from './click-event.js';
import type { ClickEnrichment } from './click-event-repository.js';

/**
 * Enrich a raw click event with parsed device, browser, and country data.
 *
 * Runs in the analytics worker (never on the redirect hot path).
 * Best-effort: any parsing failure returns nulls for that field.
 */
export function enrichClick(event: ClickEvent): ClickEnrichment {
  return {
    browser: parseBrowser(event.userAgent),
    deviceType: parseDeviceType(event.userAgent),
    country: lookupCountry(event.ip),
  };
}

function parseBrowser(ua: string | null): string | null {
  if (!ua) return null;
  try {
    const parser = new UAParser(ua);
    const browser = parser.getBrowser();
    return browser.name ?? null;
  } catch {
    return null;
  }
}

function parseDeviceType(ua: string | null): string | null {
  if (!ua) return null;
  try {
    const parser = new UAParser(ua);
    const device = parser.getDevice();
    if (device.type === 'mobile') return 'mobile';
    if (device.type === 'tablet') return 'tablet';
    // No device.type means desktop (the default)
    return 'desktop';
  } catch {
    return null;
  }
}

function lookupCountry(ip: string | null): string | null {
  if (!ip) return null;
  try {
    const geo = geoip.lookup(ip);
    return geo?.country ?? null;
  } catch {
    return null;
  }
}
