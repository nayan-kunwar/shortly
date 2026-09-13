import { env } from '../config/env.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Minimal structured JSON logger. One line per event on stdout — the unit
 * container platforms and collectors (Loki, CloudWatch, ELK) all ingest.
 * Deliberately not pino/winston: zero deps, fully understood, sufficient
 * until log volume or redaction needs say otherwise (documented graduate path).
 */
export function log(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
  if (ORDER[level] < ORDER[env.LOG_LEVEL]) return;
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields,
  });
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}
