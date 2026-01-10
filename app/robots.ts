import { MetadataRoute } from 'next'

/**
 * Dynamic robots.txt for my.orbo.ru (application)
 * Disallows all crawling for the app subdomain
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
  }
}
