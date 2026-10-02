import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  transpilePackages: ['@swipe/contracts', '@swipe/domain', '@swipe/server'],
};
export default nextConfig;
