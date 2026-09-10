import { apiRequest } from '../../../lib/api/client';
import type { ListUrlsParams, UrlDetails, UrlListPage } from '../types';

/** GET /api/v1/urls — keyset page. Pass cursor from the previous nextCursor. */
export function listUrls(params: ListUrlsParams = {}, signal?: AbortSignal): Promise<UrlListPage> {
  const search = new URLSearchParams();
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.cursor !== undefined) search.set('cursor', params.cursor);
  if (params.search !== undefined && params.search !== '') search.set('search', params.search);
  const query = search.toString();
  return apiRequest<UrlListPage>(`/api/v1/urls${query === '' ? '' : `?${query}`}`, { signal });
}

/** GET /api/v1/urls/:shortCode — details with lifetime clicks. */
export function getUrl(shortCode: string, signal?: AbortSignal): Promise<UrlDetails> {
  return apiRequest<UrlDetails>(`/api/v1/urls/${encodeURIComponent(shortCode)}`, { signal });
}

/** DELETE /api/v1/urls/:shortCode — soft delete (idempotent). */
export function deleteUrl(shortCode: string): Promise<{ shortCode: string; isActive: boolean }> {
  return apiRequest(`/api/v1/urls/${encodeURIComponent(shortCode)}`, { method: 'DELETE' });
}
