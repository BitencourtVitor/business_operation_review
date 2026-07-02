import type { NextConfig } from "next";
import path from "path";
import fs from "fs";

// Only set turbopack root when running inside the monorepo (local dev).
// In Docker the build context is apps/web/ so ../../ doesn't exist — omitting
// this prevents Next.js from writing .next output to the filesystem root.
const monorepoRoot = path.join(process.cwd(), "../..");
const hasTurbopackRoot = fs.existsSync(path.join(monorepoRoot, "package.json"));

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  // Turbopack's filesystem cache (on by default since v16.1 for `next dev`)
  // writes persistently to .next and grew unbounded — disabled for both dev
  // and build so .next never accumulates a cache.
  experimental: {
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
  },
  ...(hasTurbopackRoot && {
    turbopack: {
      root: monorepoRoot,
    },
  }),
};

export default nextConfig;
