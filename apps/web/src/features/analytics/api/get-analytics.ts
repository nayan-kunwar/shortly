import { apiRequest } from '../../../lib/api/client';
import type { UrlAnalytics } from '../types';

/** GET /api/v1/urls/:shortCode/analytics — eventually consistent (M9–M11). */
export function getAnalytics(shortCode: string, signal?: AbortSignal): Promise<UrlAnalytics> {
  return apiRequest<UrlAnalytics>(`/api/v1/urls/${encodeURIComponent(shortCode)}/analytics`, {
    signal,
  });
}
