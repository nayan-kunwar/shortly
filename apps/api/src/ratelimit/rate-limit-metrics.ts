/**
 * Rate-limit exceeded counter. In-memory per instance (M14 exposes it;
 * per-instance counts are why M14 aggregates across replicas).
 */
export const rateLimitMetrics = {
  exceeded: 0,
};

export function recordRateLimitExceeded(): void {
  rateLimitMetrics.exceeded += 1;
}

export function resetRateLimitMetrics(): void {
  rateLimitMetrics.exceeded = 0;
}
