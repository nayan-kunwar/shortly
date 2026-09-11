'use client';

import { useState } from 'react';
import { Button } from '../../../components/ui/button';
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
      <Button
        type="button"
        variant="danger"
        disabled={disabled === true || mutation.isPending}
        onClick={() => {
          if (armed) {
            mutation.mutate(shortCode);
          } else {
            setArmed(true);
          }
        }}
      >
        {mutation.isPending ? 'Deactivating…' : armed ? 'Confirm deactivate' : 'Deactivate'}
      </Button>
      {mutation.isError && (
        <p role="alert" className="text-sm text-red-600">
          Could not deactivate. Please try again.
        </p>
      )}
    </div>
  );
}
