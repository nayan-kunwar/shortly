import { apiRequest } from '../../../lib/api/client';

export interface ClaimResult {
  claimed: string[];
}

/** POST /api/v1/urls/claim — move one guest identity's links onto the account. */
export function claimGuestLinks(guestId: string, signal?: AbortSignal): Promise<ClaimResult> {
  return apiRequest<ClaimResult>('/api/v1/urls/claim', {
    method: 'POST',
    body: { guestId },
    signal,
  });
}
