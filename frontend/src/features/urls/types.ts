/** Mirrors POST /api/v1/urls response (backend M2 contract). */
export interface CreatedUrl {
  shortCode: string;
  shortUrl: string;
  originalUrl: string;
}

export interface CreateUrlInput {
  url: string;
  customAlias?: string | null | undefined;
  expiresAt?: string | null | undefined;
}

/** Mirrors GET /api/v1/urls item + GET /api/v1/urls/:shortCode (reads milestone). */
export interface UrlListItem {
  shortCode: string;
  shortUrl: string;
  originalUrl: string;
  customAlias: string | null;
  createdAt: string;
  expiresAt: string | null;
  isActive: boolean;
  clicks: number;
}

export type UrlDetails = UrlListItem;

export interface UrlListPage {
  items: UrlListItem[];
  nextCursor: string | null;
}

export interface ListUrlsParams {
  limit?: number | undefined;
  cursor?: string | undefined;
  search?: string | undefined;
}
