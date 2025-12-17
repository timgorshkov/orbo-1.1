/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Добавьте исключение для директории temp
  experimental: {
    outputFileTracingExcludes: {
      '*': ['./temp/**/*'],
    },
  },
}

module.exports = nextConfig
