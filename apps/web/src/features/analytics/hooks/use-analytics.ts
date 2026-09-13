import { useQuery } from '@tanstack/react-query';
import { getAnalytics } from '../api/get-analytics';

/**
 * Analytics query. No auto-refetch: data arrives via the async pipeline
 * (M9–M11), so the page offers manual refresh instead of polling a
 * slow-moving aggregate. Retry once — a 404 means unknown code, not flux.
 */
export function useAnalytics(shortCode: string) {
  return useQuery({
    queryKey: ['analytics', shortCode],
    queryFn: ({ signal }) => getAnalytics(shortCode, signal),
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
