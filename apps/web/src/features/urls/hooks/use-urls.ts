import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteUrl, getUrl, listUrls } from '../api/urls';

export const urlKeys = {
  all: ['urls'] as const,
  list: (search: string) => ['urls', 'list', search] as const,
  detail: (shortCode: string) => ['urls', 'detail', shortCode] as const,
};

/** Paginated URL list (cursor infinite query). Search keys a separate cache. */
export function useUrls(search: string, limit = 20) {
  return useInfiniteQuery({
    queryKey: urlKeys.list(search),
    queryFn: ({ pageParam, signal }) =>
      listUrls({ limit, cursor: pageParam, search: search === '' ? undefined : search }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

/** Single URL details. */
export function useUrl(shortCode: string) {
  return useQuery({
    queryKey: urlKeys.detail(shortCode),
    queryFn: ({ signal }) => getUrl(shortCode, signal),
  });
}

/** Deactivate + invalidate list and detail caches (F3's first invalidation). */
export function useDeactivateUrl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shortCode: string) => deleteUrl(shortCode),
    onSuccess: (_data, shortCode) => {
      void queryClient.invalidateQueries({ queryKey: urlKeys.all });
      void queryClient.invalidateQueries({ queryKey: urlKeys.detail(shortCode) });
    },
  });
}
