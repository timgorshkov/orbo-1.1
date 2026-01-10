import { MetadataRoute } from 'next'

/**
 * Sitemap for orbo.ru (public website)
 * Lists all public pages for search engine indexing
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://orbo.ru'
  const lastModified = new Date()

  // Public website pages
  const routes = [
    '',           // главная
    '/product',   // обзор продукта
    '/crm',       // CRM участников
    '/events',    // События
    '/notifications', // Уведомления
    '/whatsapp-migration', // Миграция с WhatsApp
    '/agencies',  // Лендинг для агентств
    '/events-organizers', // Лендинг для организаторов мероприятий
    '/terms',     // Условия использования
    '/privacy',   // Политика конфиденциальности
  ]

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified,
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : route === '/product' ? 0.9 : 0.8,
  }))
}
