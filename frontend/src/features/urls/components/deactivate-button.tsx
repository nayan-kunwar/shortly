'use client';

import { useState } from 'react';
import { useDeactivateUrl } from '../hooks/use-urls';

/**
 * Two-click destructive confirm (no dialog library at this scale):
 * first click arms, second executes. Mutation errors surface inline.
 */
export function DeactivateButton({
  shortCode,
  disabled,
}: {
  shortCode: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const mutation = useDeactivateUrl();

  if (mutation.isSuccess) {
    return <p className="text-sm text-gray-500">Deactivated.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={disabled === true || mutation.isPending}
        onClick={() => {
          if (armed) {
            mutation.mutate(shortCode);
          } else {
            setArmed(true);
          }
        }}
        className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
      >
        {mutation.isPending ? 'Deactivating…' : armed ? 'Confirm deactivate' : 'Deactivate'}
      </button>
      {mutation.isError && (
        <p role="alert" className="text-sm text-red-600">
          Could not deactivate. Please try again.
        </p>
      )}
    </div>
  );
}
