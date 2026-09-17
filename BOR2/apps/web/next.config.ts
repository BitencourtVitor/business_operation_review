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
  // A versão fica gravada no bundle: é com ela que a aba aberta se compara
  // contra /api/version e descobre que saiu deploy.
  env: {
    NEXT_PUBLIC_BUILD_SHA: process.env.RAILWAY_GIT_COMMIT_SHA ?? "",
  },
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
