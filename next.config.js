/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Expose server-side env vars to the client (for Telegram bot username)
  env: {
    NEXT_PUBLIC_TELEGRAM_EVENT_BOT_USERNAME: process.env.TELEGRAM_EVENT_BOT_USERNAME || 'orbo_event_bot',
  },
  experimental: {
    // Include Hawk.so in standalone build (external package for Node.js)
    serverComponentsExternalPackages: ['@hawk.so/nodejs'],
    // Добавьте исключение для директории temp
    outputFileTracingExcludes: {
      '*': ['./temp/**/*'],
    },
    // Ensure pino and hawk are traced
    outputFileTracingIncludes: {
      '/api/**/*': ['./node_modules/@hawk.so/**/*', './node_modules/pino/**/*'],
    },
  },
  // Allow external images from storage providers
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.selcdn.ru',
      },
      {
        protocol: 'https',
        hostname: 's3.ru-1.storage.selcloud.ru',
      },
    ],
  },
}

module.exports = nextConfig
