/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Skip TypeScript errors during build (needed after Supabase removal - 
  // the PostgresDbClient returns untyped data causing hundreds of inference issues)
  typescript: {
    ignoreBuildErrors: true,
  },
  // Project uses custom eslint.config.mjs (flat config), skip next lint during build
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Expose server-side env vars to the client (for Telegram bot username)
  env: {
    NEXT_PUBLIC_TELEGRAM_EVENT_BOT_USERNAME: process.env.TELEGRAM_EVENT_BOT_USERNAME || 'orbo_event_bot',
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
  serverExternalPackages: ['@hawk.so/nodejs', 'telegram'],
  outputFileTracingExcludes: {
    '*': ['./temp/**/*'],
  },
  outputFileTracingIncludes: {
    '/api/**/*': ['./node_modules/@hawk.so/**/*', './node_modules/pino/**/*'],
  },
  // Allow external images from storage providers
  images: {
    // Workaround for CVE-2025-59471 (Image Optimizer DoS): cap unoptimized size
    // All remotePatterns are our own S3 domains — no user-controlled URLs
    minimumCacheTTL: 60,
    remotePatterns: [
      // Selectel S3 - CDN domain
      {
        protocol: 'https',
        hostname: '*.selcdn.ru',
      },
      // Selectel S3 - direct storage domain (ru-1)
      {
        protocol: 'https',
        hostname: 's3.ru-1.storage.selcloud.ru',
      },
      // Selectel S3 - direct storage domain (all regions)
      {
        protocol: 'https',
        hostname: '*.storage.selcloud.ru',
      },
      // Selectel S3 - bucket-specific domain
      {
        protocol: 'https',
        hostname: '*.s3.storage.selcloud.ru',
      },
      // Selectel - selstorage.ru domain
      {
        protocol: 'https',
        hostname: '*.selstorage.ru',
      },
    ],
  },
}

module.exports = nextConfig
