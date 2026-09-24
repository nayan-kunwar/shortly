const STORAGE_KEY = 'shortly.session';

/** Tab-scoped bearer token. The API remains the security boundary. */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(STORAGE_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(STORAGE_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
