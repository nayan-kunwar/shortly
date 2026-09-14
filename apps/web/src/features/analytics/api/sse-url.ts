import { getApiBaseUrl } from '../../../lib/api/env';

/** Build the SSE URL for a short code's analytics stream. */
export function getSseAnalyticsUrl(shortCode: string): string {
  return `${getApiBaseUrl()}/api/v1/urls/${encodeURIComponent(shortCode)}/analytics/stream`;
}
