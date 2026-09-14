import Image from 'next/image';
import type { HTMLAttributes } from 'react';

interface LogoProps extends HTMLAttributes<HTMLSpanElement> {
  /** Show only the icon mark (no text). */
  iconOnly?: boolean;
  /** Height in pixels. Width auto-scales. Default 28. */
  size?: number;
}

/** Logo component using /logo.png from public/. */
export function Logo({ iconOnly = false, size = 28, className, ...props }: LogoProps) {
  const h = size;
  const w = iconOnly ? size : size * 3;

  return (
    <span className={className} {...props}>
      <Image
        src="/logo.png"
        alt="Shortly"
        width={w}
        height={h}
        className="h-[length:var(--logo-h)] w-auto"
        style={{ '--logo-h': `${h}px` } as React.CSSProperties}
        priority
      />
    </span>
  );
}
