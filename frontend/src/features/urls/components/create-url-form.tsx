'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ShortlyApiError } from '../../../lib/api/client';
import { Button } from '../../../components/ui/button';
import { FieldError, TextInput } from '../../../components/ui/input';
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
          if (err instanceof ShortlyApiError && err.isRateLimited) {
            setError('root', { message: 'Too many requests. Please try again later.' });
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
        <TextInput
          id="create-url"
          type="url"
          placeholder="https://example.com/very/long/url"
          autoComplete="off"
          {...register('url')}
        />
        <FieldError message={errors.url?.message} />
      </div>

      <div>
        <label htmlFor="create-alias" className="mb-1 block text-sm font-medium">
          Custom alias <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <TextInput
          id="create-alias"
          type="text"
          placeholder="github"
          autoComplete="off"
          {...register('customAlias')}
        />
        <FieldError message={errors.customAlias?.message} />
      </div>

      <div>
        <label htmlFor="create-expires" className="mb-1 block text-sm font-medium">
          Expiration <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <TextInput id="create-expires" type="datetime-local" {...register('expiresAt')} />
        <FieldError message={errors.expiresAt?.message} />
      </div>

      {errors.root !== undefined && (
        <p role="alert" className="text-sm text-red-600">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? 'Creating…' : 'Create short URL'}
      </Button>
    </form>
  );
}
