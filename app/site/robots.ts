import { MetadataRoute } from 'next'

/**
 * Dynamic robots.txt for orbo.ru (public website)
 * Allows crawling of all public pages
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/_next/',
          '/auth/',
        ],
      },
      {
        userAgent: 'Yandex',
        allow: '/',
        disallow: [
          '/api/',
          '/_next/',
          '/auth/',
        ],
      },
    ],
    sitemap: 'https://orbo.ru/sitemap.xml',
    host: 'https://orbo.ru',
  }
}
