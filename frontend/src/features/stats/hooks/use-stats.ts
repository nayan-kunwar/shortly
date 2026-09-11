import { useQuery } from '@tanstack/react-query';
import { getStats } from '../api/get-stats';

/** Dashboard totals. Refetch on focus is harmless (cheap counts). */
export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: ({ signal }) => getStats(signal),
  });
}
