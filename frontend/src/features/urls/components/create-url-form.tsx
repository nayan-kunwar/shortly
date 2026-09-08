'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ShortlyApiError } from '../../../lib/api/client';
import { useCreateUrl } from '../hooks/use-create-url';
import { createUrlSchema, customAliasRule } from '../schemas/create-url';
import { CreateResult } from './create-result';

/**
 * Form schema reuses the mirrored URL/alias rules and only adapts `expiresAt`:
 * datetime-local inputs carry no offset, so this field validates the raw
 * widget value and the submit handler converts to ISO for the wire.
 */
const formSchema = createUrlSchema.omit({ expiresAt: true, customAlias: true }).extend({
  // Widget values: '' means absent. Preprocess to null so the shared
  // rule validates exactly what the wire carries (never looser).
  customAlias: z.preprocess((v) => (v === '' ? null : v), customAliasRule.nullish()),
  expiresAt: z
    .string()
    .optional()
    .refine(
      (v) =>
        v === undefined || v === '' || (!Number.isNaN(Date.parse(v)) && Date.parse(v) > Date.now()),
      'Expiration must be in the future.',
    ),
});

type FormValues = z.infer<typeof formSchema>;

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900';

/** URL creation form: RHF + mirrored Zod, backend errors mapped to fields. */
export function CreateUrlForm() {
  const mutation = useCreateUrl();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    // z.preprocess widens the inferred input to unknown; the output shape
    // is exactly FormValues, so narrow the resolver type at the boundary.
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
  });

  function onSubmit(values: FormValues): void {
    mutation.mutate(
      {
        url: values.url,
        customAlias: values.customAlias ?? null,
        expiresAt:
          values.expiresAt !== undefined && values.expiresAt !== ''
            ? new Date(values.expiresAt).toISOString()
            : null,
      },
      {
        onError: (err) => {
          if (err instanceof ShortlyApiError && err.isValidation && Array.isArray(err.details)) {
            for (const d of err.details) {
              if (typeof d === 'object' && d !== null && 'path' in d && 'message' in d) {
                const path = (d as { path: string }).path;
                const message = String((d as { message: unknown }).message);
                if (path === 'url' || path === 'customAlias' || path === 'expiresAt') {
                  setError(path, { message });
                  return;
                }
              }
            }
          }
          if (err instanceof ShortlyApiError && err.isConflict) {
            setError('customAlias', { message: 'This custom alias is already in use.' });
            return;
          }
          setError('root', {
            message: err instanceof Error ? err.message : 'Something went wrong.',
          });
        },
      },
    );
  }

  if (mutation.isSuccess) {
    return (
      <CreateResult
        result={mutation.data}
        onReset={() => {
          mutation.reset();
          reset();
        }}
      />
    );
  }

  const busy = mutation.isPending || isSubmitting;

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="space-y-4">
      <div>
        <label htmlFor="create-url" className="mb-1 block text-sm font-medium">
          Original URL
        </label>
        <input
          id="create-url"
          type="url"
          placeholder="https://example.com/very/long/url"
          autoComplete="off"
          className={inputClass}
          {...register('url')}
        />
        {errors.url !== undefined && (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {errors.url.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="create-alias" className="mb-1 block text-sm font-medium">
          Custom alias <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <input
          id="create-alias"
          type="text"
          placeholder="github"
          autoComplete="off"
          className={inputClass}
          {...register('customAlias')}
        />
        {errors.customAlias !== undefined && (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {errors.customAlias.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="create-expires" className="mb-1 block text-sm font-medium">
          Expiration <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <input
          id="create-expires"
          type="datetime-local"
          className={inputClass}
          {...register('expiresAt')}
        />
        {errors.expiresAt !== undefined && (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {errors.expiresAt.message}
          </p>
        )}
      </div>

      {errors.root !== undefined && (
        <p role="alert" className="text-sm text-red-600">
          {errors.root.message}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
      >
        {busy ? 'Creating…' : 'Create short URL'}
      </button>
    </form>
  );
}
