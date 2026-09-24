const STORAGE_KEY = 'shortly.guest';

/**
 * Anonymous ownership anchor. localStorage (not sessionStorage): guest links
 * must survive tab closes and restarts until the owner signs up and claims
 * them. The API remains the security boundary — this is an identifier, and
 * claim authority comes from holding it, not from trusting it blindly.
 */
export function getGuestId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setGuestId(guestId: string): void {
  localStorage.setItem(STORAGE_KEY, guestId);
}

export function clearGuestId(): void {
  localStorage.removeItem(STORAGE_KEY);
}
