/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Include Hawk.so in standalone build (dynamic import)
  serverExternalPackages: ['@hawk.so/nodejs'],
  // Добавьте исключение для директории temp
  experimental: {
    outputFileTracingExcludes: {
      '*': ['./temp/**/*'],
    },
    // Ensure pino and hawk are traced
    outputFileTracingIncludes: {
      '/api/**/*': ['./node_modules/@hawk.so/**/*', './node_modules/pino/**/*'],
    },
  },
}

module.exports = nextConfig
