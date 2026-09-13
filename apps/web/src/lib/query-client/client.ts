import { QueryClient } from '@tanstack/react-query';

/** Shared defaults: no refetch-on-focus (dashboard noise), single retry. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    },
  });
}
