import { useQuery } from '@tanstack/react-query';
import { getBreakdowns } from '../api/get-breakdowns';

/** Dashboard breakdowns. Refetch every 30s for live feel. */
export function useBreakdowns() {
  return useQuery({
    queryKey: ['stats', 'breakdowns'],
    queryFn: ({ signal }) => getBreakdowns(signal),
    refetchInterval: 30_000,
  });
}
