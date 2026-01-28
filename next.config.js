/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '@neondatabase/serverless'],
  },
};

module.exports = nextConfig;
