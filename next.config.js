/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '@neondatabase/serverless', 'ws'],
  },
};

module.exports = nextConfig;
