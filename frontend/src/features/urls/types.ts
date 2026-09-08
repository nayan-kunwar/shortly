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
