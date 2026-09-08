import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Monorepo: pin Turbopack's root to frontend/ so it never mistakes the
  // backend directory (which has its own lockfile) for the workspace root.
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
