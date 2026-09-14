import { apiRequest } from '../../../lib/api/client';
import type { GlobalBreakdowns } from '../types';

/** GET /api/v1/stats/breakdowns — global country/device/browser/referrer breakdowns. */
export function getBreakdowns(signal?: AbortSignal): Promise<GlobalBreakdowns> {
  return apiRequest<GlobalBreakdowns>('/api/v1/stats/breakdowns', { signal });
}
