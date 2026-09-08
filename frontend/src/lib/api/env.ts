/**
 * Public environment. Only NEXT_PUBLIC_* vars are visible in the browser —
 * never put secrets behind that prefix (§24, §27 of the frontend spec).
 */
export function getApiBaseUrl(): string {
  const value = process.env['NEXT_PUBLIC_API_URL'];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('NEXT_PUBLIC_API_URL is not set (see frontend/.env.example)');
  }
  return value.replace(/\/+$/, '');
}
