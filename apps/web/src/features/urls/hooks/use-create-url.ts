import { useMutation } from '@tanstack/react-query';
import { createUrl } from '../api/create-url';
import type { CreateUrlInput } from '../types';

/**
 * Create-URL mutation. No cache invalidation yet — there are no list/detail
 * queries until F3. That onSuccess invalidation is F3's first line of code.
 */
export function useCreateUrl() {
  return useMutation({
    mutationFn: (input: CreateUrlInput) => createUrl(input),
    retry: false,
  });
}
