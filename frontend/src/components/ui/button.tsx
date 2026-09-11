import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'outline' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-gray-900 text-white dark:bg-white dark:text-gray-900',
  outline: 'border border-gray-200 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-gray-900',
  danger:
    'border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30',
  ghost: 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900',
};

/** Shared button: one style source, subtle transitions, disabled states. */
export function Button({
  variant = 'outline',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">{children}</div>
  );
}
