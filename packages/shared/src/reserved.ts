/**
 * Reserved aliases that users cannot claim. Single-segment paths owned (or
 * soon owned) by the app, not by users. The redirect router matches ANY
 * single segment, so an alias equal to one of these would shadow real routes.
 *
 * GROWS with every new top-level route — keep in sync across the stack.
 * This file is the single source of truth.
 */
export const RESERVED_ALIASES: ReadonlySet<string> = new Set([
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

export function isReservedAlias(alias: string): boolean {
  return RESERVED_ALIASES.has(alias.toLowerCase());
}
