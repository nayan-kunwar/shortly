import { apiRequest } from '../../../lib/api/client';
import type { GlobalStats } from '../types';

/** GET /api/v1/stats — global dashboard totals. */
export function getStats(signal?: AbortSignal): Promise<GlobalStats> {
  return apiRequest<GlobalStats>('/api/v1/stats', { signal });
}
