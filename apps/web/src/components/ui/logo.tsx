import Image from 'next/image';
import type { HTMLAttributes } from 'react';

interface LogoProps extends HTMLAttributes<HTMLSpanElement> {
  /** Icon height in pixels. Width auto-scales. Default 32. */
  size?: number;
}

/** Brand mark: favicon.png icon + "Shortly" text. */
export function Logo({ size = 36, className, ...props }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`} {...props}>
      <Image
        src="/favicon.png"
        alt=""
        width={size}
        height={size}
        className="rounded-sm"
        priority
      />
      <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
        Shortly
      </span>
    </span>
  );
}
