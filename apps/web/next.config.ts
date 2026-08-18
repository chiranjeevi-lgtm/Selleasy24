import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Listing photos come from the API's dev storage route locally and from the
  // Spaces CDN in deployed environments.
  images: { remotePatterns: [{ protocol: 'https', hostname: '**.digitaloceanspaces.com' }] },
};

export default config;
