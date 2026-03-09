import { headers } from 'next/headers'
import { MetadataRoute } from 'next'

export const dynamic = 'force-dynamic'

/**
 * Sitemap for orbo.ru (public website)
 * Only generated for the website domain — my.orbo.ru returns empty.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const headersList = headers()
  const host = headersList.get('host') || headersList.get('x-forwarded-host') || ''
  const hostname = host.split(':')[0]

  if (hostname !== 'orbo.ru' && hostname !== 'www.orbo.ru') {
    return []
  }

  const baseUrl = 'https://orbo.ru'
  const lastModified = new Date()

  const routes: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' }[] = [
    { path: '',                    priority: 1.0, changeFrequency: 'weekly' },
    { path: '/product',            priority: 0.9, changeFrequency: 'monthly' },
    { path: '/events',             priority: 0.9, changeFrequency: 'monthly' },
    { path: '/crm',                priority: 0.8, changeFrequency: 'monthly' },
    { path: '/notifications',      priority: 0.8, changeFrequency: 'monthly' },
    { path: '/pricing',            priority: 0.8, changeFrequency: 'monthly' },
    { path: '/agencies',           priority: 0.7, changeFrequency: 'monthly' },
    { path: '/events-organizers',  priority: 0.7, changeFrequency: 'monthly' },
    { path: '/telegram-backup',    priority: 0.9, changeFrequency: 'weekly' },
    { path: '/whatsapp-migration', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/terms',              priority: 0.3, changeFrequency: 'monthly' },
    { path: '/privacy',            priority: 0.3, changeFrequency: 'monthly' },
  ]

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${baseUrl}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }))
}
