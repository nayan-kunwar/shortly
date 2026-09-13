/**
 * URL validation constants shared between API and web.
 * Single source of truth — if these change, both sides update automatically.
 */

export const MAX_URL_LENGTH = 2048;
export const MIN_ALIAS_LENGTH = 3;
export const MAX_ALIAS_LENGTH = 30;
export const ALIAS_PATTERN = /^[A-Za-z0-9_-]+$/;
