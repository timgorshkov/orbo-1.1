import { redirect } from 'next/navigation'
import { getUnifiedSession } from '@/lib/auth/unified-auth'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('RootPage')

/**
 * App domain root page (my.orbo.ru)
 * Redirects to /orgs if authenticated, /signin otherwise
 * 
 * Note: Website domain (orbo.ru) is handled via middleware rewrite to /site routes
 */
export default async function Home() {
  try {
    const session = await getUnifiedSession()
    
    if (!session?.user) {
      redirect('/signin')
    }
    
    // Пользователь авторизован, отправляем на страницу выбора организации
    redirect('/orgs')
  } catch (error: any) {
    // NEXT_REDIRECT не является ошибкой - это нормальное поведение Next.js
    if (error?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error // Пробрасываем дальше
    }
    
    // Реальная неожиданная ошибка
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Unexpected error')
    redirect('/signin')
  }
}
