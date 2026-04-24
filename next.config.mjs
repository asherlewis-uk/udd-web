/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Surface real type errors at build time. tsconfig is strict: true and
    // `pnpm typecheck` runs `tsc --noEmit` independently; there is no
    // reason to suppress build-time type checking. If a legitimate third-
    // party .d.ts drift ever forces this back to true, document the
    // specific package + expected unblocker inline rather than flipping
    // silently.
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
