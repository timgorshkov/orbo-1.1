import { redirect } from 'next/navigation';
import { createClientServer } from '@/lib/server/supabaseServer';
import { cookies } from 'next/headers';

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
        console.log('[Root Page] Invalid auth token detected, clearing session');
        
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
        console.log('[Root Page] Auth error (non-critical):', error.message);
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
    console.error('[Root Page] Unexpected error:', error);
    redirect('/signin');
  }
}
