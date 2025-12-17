import { redirect } from 'next/navigation';
import { createClientServer } from '@/lib/server/supabaseServer';
import { cookies } from 'next/headers';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('RootPage');

export default async function Home() {
  try {
    const supabase = await createClientServer();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    // Если есть ошибка auth (невалидный токен, отсутствующий пользователь и т.д.)
    if (error) {
      // Если токен невалидный - очищаем сессию
      if (error.message?.includes('missing sub claim') || 
          error.message?.includes('invalid claim') ||
          error.status === 403) {
        logger.warn({ error: error.message }, 'Invalid auth token detected, clearing session');
        
        // Очищаем все Supabase cookies
        const cookieStore = await cookies();
        const allCookies = cookieStore.getAll();
        allCookies.forEach(cookie => {
          if (cookie.name.includes('supabase') || 
              cookie.name.includes('auth-token') ||
              cookie.name.includes('sb-')) {
            cookieStore.delete(cookie.name);
          }
        });
      } else {
        logger.debug({ error: error.message }, 'Auth error (non-critical)');
      }
      
      redirect('/signin');
    }
    
    if (!user) {
      redirect('/signin');
    }
    
    // Пользователь авторизован, отправляем на страницу выбора организации
    redirect('/orgs');
  } catch (error: any) {
    // NEXT_REDIRECT не является ошибкой - это нормальное поведение Next.js
    if (error?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error; // Пробрасываем дальше
    }
    
    // Реальная неожиданная ошибка
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Unexpected error');
    redirect('/signin');
  }
}
