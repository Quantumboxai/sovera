/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output bundles a minimal Node server + only the deps actually used.
  // Required for the slim Docker image used by the Container App.
  output: 'standalone',
  transpilePackages: ['@sovera/client'],
  experimental: { typedRoutes: true }
};
export default nextConfig;
