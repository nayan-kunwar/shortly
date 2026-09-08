import { apiRequest } from '../../../lib/api/client.js';
import type { CreatedUrl, CreateUrlInput } from '../types.js';

/** POST /api/v1/urls — the only call F0 needs to prove the client works. */
export function createUrl(input: CreateUrlInput, signal?: AbortSignal): Promise<CreatedUrl> {
  return apiRequest<CreatedUrl>('/api/v1/urls', {
    method: 'POST',
    body: {
      url: input.url,
      customAlias: input.customAlias ?? null,
      expiresAt: input.expiresAt ?? null,
    },
    signal,
  });
}
