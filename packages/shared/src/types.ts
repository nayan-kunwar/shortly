/**
 * API response and request types shared between backend and frontend.
 * Mirrors the wire contract — both sides import from here instead of
 * maintaining separate definitions that can drift.
 */

/** POST /api/v1/urls response. */
export interface CreatedUrl {
  shortCode: string;
  shortUrl: string;
  originalUrl: string;
}

/** POST /api/v1/urls request body (frontend → backend). */
export interface CreateUrlRequest {
  url: string;
  customAlias?: string | null | undefined;
  expiresAt?: string | null | undefined;
}

/** Alias used by the frontend form layer. */
export type CreateUrlInput = CreateUrlRequest;

/** GET /api/v1/urls item + GET /api/v1/urls/:shortCode response. */
export interface UrlListItem {
  shortCode: string;
  shortUrl: string;
  originalUrl: string;
  customAlias: string | null;
  createdAt: string;
  expiresAt: string | null;
  isActive: boolean;
  clicks: number;
  topDevice: string | null;
  topBrowser: string | null;
  topCountry: string | null;
}

export type UrlDetails = UrlListItem;

/** Paginated URL list. */
export interface UrlListPage {
  items: UrlListItem[];
  nextCursor: string | null;
}

/** GET /api/v1/urls query parameters. */
export interface ListUrlsParams {
  limit?: number | undefined;
  cursor?: string | undefined;
  search?: string | undefined;
}

/** Single day click bucket. */
export interface DayBucket {
  date: string;
  count: number;
}

/** GET /api/v1/urls/:shortCode/analytics response. */
export interface UrlAnalytics {
  shortCode: string;
  totalClicks: number;
  clicksByDay: DayBucket[];
  countries: Record<string, number>;
  devices: Record<string, number>;
  browsers: Record<string, number>;
  referrers: Record<string, number>;
}

/** GET /api/v1/stats response. */
export interface GlobalStats {
  totalUrls: number;
  activeUrls: number;
  totalClicks: number;
  clicksToday: number;
}

/** GET /api/v1/stats/breakdowns response. */
export interface GlobalBreakdowns {
  countries: Record<string, number>;
  devices: Record<string, number>;
  browsers: Record<string, number>;
  referrers: Record<string, number>;
}
