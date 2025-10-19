import { redirect } from 'next/navigation';
import { createClientServer } from '@/lib/server/supabaseServer';

export default async function Home() {
  try {
    const supabase = await createClientServer();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    console.log('[Root Page] User check:', { hasUser: !!user, hasError: !!error });
    
    if (error) {
      console.error('[Root Page] Auth error:', error);
      redirect('/signin');
    }
    
    if (!user) {
      console.log('[Root Page] No user, redirecting to signin');
      redirect('/signin');
    }
    
    // Пользователь авторизован, отправляем на страницу выбора организации
    console.log('[Root Page] User authenticated, redirecting to /orgs');
    redirect('/orgs');
  } catch (error) {
    console.error('[Root Page] Unexpected error:', error);
    // В случае ошибки отправляем на страницу логина
    redirect('/signin');
  }
}
