import { ShortlyApiError, apiRequest } from '../../../lib/api/client';
import { clearGuestId, setGuestId } from '../../auth/guest-store';
import type { CreatedUrl, CreateUrlInput } from '../types';

async function postCreate(input: CreateUrlInput, signal?: AbortSignal): Promise<CreatedUrl> {
  const created = await apiRequest<CreatedUrl>('/api/v1/urls', {
    method: 'POST',
    body: {
      url: input.url,
      customAlias: input.customAlias ?? null,
      expiresAt: input.expiresAt ?? null,
    },
    signal,
  });
  if (created.guestId !== undefined) setGuestId(created.guestId);
  return created;
}

/**
 * POST /api/v1/urls. Persists a minted guest anchor, and self-heals corrupt
 * storage: GUEST_TOKEN_INVALID clears the anchor and retries once without
 * it (the server mints a replacement). Exactly one retry — a second
 * failure is real and propagates.
 */
export async function createUrl(input: CreateUrlInput, signal?: AbortSignal): Promise<CreatedUrl> {
  try {
    return await postCreate(input, signal);
  } catch (err) {
    if (err instanceof ShortlyApiError && err.code === 'GUEST_TOKEN_INVALID') {
      clearGuestId();
      return postCreate(input, signal);
    }
    throw err;
  }
}
