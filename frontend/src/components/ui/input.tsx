import type { InputHTMLAttributes } from 'react';

/** Shared text input: label association and error display stay at call sites. */
export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm transition-colors dark:border-gray-700 dark:bg-gray-900 ${props.className ?? ''}`}
    />
  );
}

/** Shared field error (alert role for screen readers). */
export function FieldError({ message }: { message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-red-600">
      {message}
    </p>
  );
}
