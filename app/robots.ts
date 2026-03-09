import { headers } from 'next/headers'
import { MetadataRoute } from 'next'

export const dynamic = 'force-dynamic'

/**
 * Domain-aware robots.txt
 * - orbo.ru: allows all public pages, references sitemap
 * - my.orbo.ru: disallows all (app is private)
 */
export default function robots(): MetadataRoute.Robots {
  const headersList = headers()
  const host = headersList.get('host') || headersList.get('x-forwarded-host') || ''
  const hostname = host.split(':')[0]

  if (hostname === 'orbo.ru' || hostname === 'www.orbo.ru') {
    return {
      rules: [
        {
          userAgent: '*',
          allow: '/',
          disallow: ['/api/', '/_next/', '/auth/'],
        },
        {
          userAgent: 'Yandex',
          allow: '/',
          disallow: ['/api/', '/_next/', '/auth/'],
        },
      ],
      sitemap: 'https://orbo.ru/sitemap.xml',
      host: 'https://orbo.ru',
    }
  }

  // my.orbo.ru — private app, disallow all indexing
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
  }
}
