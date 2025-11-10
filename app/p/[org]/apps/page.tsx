import { createClientServer } from '@/lib/server/supabaseServer';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AppWindow, Plus } from 'lucide-react';

interface App {
  id: string;
  name: string;
  description: string;
  icon: string;
  app_type: string;
  status: string;
}

interface PageProps {
  params: { org: string };
}

export default async function PublicAppsPage({ params }: PageProps) {
  const supabase = await createClientServer();
  
  // Get organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', params.org)
    .single();
  
  if (orgError || !org) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Организация не найдена
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Проверьте правильность ссылки
          </p>
        </div>
      </div>
    );
  }
  
  // Check if user is authenticated and is org member/admin
  let isAuthenticated = false;
  let isOrgMember = false;
  let isAdmin = false;
  let userId: string | null = null;
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (user) {
    isAuthenticated = true;
    userId = user.id;
    
    // Check membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', org.id)
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (membership) {
      isAdmin = ['owner', 'admin'].includes(membership.role);
      
      // If admin, redirect to internal page
      if (isAdmin) {
        redirect(`/app/${org.id}/apps`);
      }
    }
    
    // Check if participant
    const { data: telegramAccount } = await supabase
      .from('user_telegram_accounts')
      .select('telegram_user_id')
      .eq('user_id', user.id)
      .eq('org_id', org.id)
      .maybeSingle();
    
    if (telegramAccount) {
      const { data: participant } = await supabase
        .from('participants')
        .select('id')
        .eq('org_id', org.id)
        .eq('tg_user_id', telegramAccount.telegram_user_id)
        .is('merged_into', null)
        .maybeSingle();
      
      isOrgMember = !!participant;
    }
  }
  
  // Fetch active apps
  const { data: apps, error: appsError } = await supabase
    .from('apps')
    .select('id, name, description, icon, app_type, status')
    .eq('org_id', org.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  
  if (appsError) {
    console.error('Error fetching apps:', appsError);
  }
  
  const activeApps = apps || [];
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                📱 Приложения
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {org.name}
              </p>
            </div>
            
            {!isAuthenticated && (
              <Link
                href={`/signin?redirect=/p/${org.id}/apps`}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Войти
              </Link>
            )}
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {activeApps.length === 0 ? (
          // Empty State
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <AppWindow className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Пока нет доступных приложений
              </h2>
              
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Администраторы скоро добавят приложения для вашего сообщества
              </p>
              
              {!isAuthenticated && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  <Link href={`/signin?redirect=/p/${org.id}/apps`} className="text-blue-600 hover:underline">
                    Войдите
                  </Link>, чтобы получить доступ к приложениям
                </p>
              )}
            </div>
          </div>
        ) : (
          // Apps Grid
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeApps.map((app) => (
              <Link
                key={app.id}
                href={`/p/${org.id}/apps/${app.id}`}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all group"
              >
                <div className="flex items-start space-x-4">
                  <div className="text-5xl flex-shrink-0">{app.icon}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 mb-2">
                      {app.name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
                      {app.description}
                    </p>
                    <div className="flex items-center space-x-2">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
                        {app.app_type}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
        
        {/* Info Banner for non-members */}
        {isAuthenticated && !isOrgMember && activeApps.length > 0 && (
          <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              ℹ️ Чтобы создавать объявления и взаимодействовать с приложениями, присоединитесь к Telegram-группе сообщества
            </p>
          </div>
        )}
      </main>
      
      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-700 mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-gray-600 dark:text-gray-400">
          Powered by <a href="https://www.orbo.ru" target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Orbo</a>
        </div>
      </footer>
    </div>
  );
}

