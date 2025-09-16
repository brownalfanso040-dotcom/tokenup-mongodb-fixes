import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude Node.js modules from client bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
        'child_process': false,
        'fs/promises': false,
      };
      
      // Exclude MongoDB and other server-side modules
      config.externals = config.externals || [];
      config.externals.push({
        mongodb: 'mongodb',
        'mongodb-client-encryption': 'mongodb-client-encryption',
      });
    }
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ['mongodb'],
  },
};

export default nextConfig;
