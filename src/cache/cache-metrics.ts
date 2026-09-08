/**
 * Cache-aside counters. In-memory per API instance (M14 exposes them via
 * /metrics; per-instance counts are why M14 aggregates across replicas).
 */
export const cacheMetrics = {
  hits: 0,
  misses: 0,
};

export function recordCacheHit(): void {
  cacheMetrics.hits += 1;
}

export function recordCacheMiss(): void {
  cacheMetrics.misses += 1;
}

export function resetCacheMetrics(): void {
  cacheMetrics.hits = 0;
  cacheMetrics.misses = 0;
}
