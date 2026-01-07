import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import Link from 'next/link'
import { Plus, ExternalLink, Star, Users } from 'lucide-react'

const logger = createServiceLogger('SuperadminPublicAppsPage');

interface PublicApp {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  icon_url: string | null;
  category: string;
  status: string;
  featured: boolean;
  partner_name: string | null;
  bot_username: string | null;
  created_at: string;
  connections_count: number;
}

export default async function SuperadminPublicAppsPage() {
  await requireSuperadmin()
  
  const supabaseAdmin = createAdminServer()
  
  // Получаем все приложения
  const { data: apps, error } = await supabaseAdmin
    .from('public_apps')
    .select(`
      id,
      name,
      slug,
      short_description,
      icon_url,
      category,
      status,
      featured,
      partner_name,
      bot_username,
      created_at
    `)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  
  if (error) {
    logger.error({ error: error.message }, 'Error fetching public apps');
  }
  
  // Получаем количество подключений для каждого приложения
  const { data: connectionCounts } = await supabaseAdmin
    .from('public_app_connections')
    .select('public_app_id')
    .eq('status', 'active');
  
  // Считаем подключения
  const countsMap = new Map<string, number>();
  (connectionCounts || []).forEach((conn: any) => {
    const count = countsMap.get(conn.public_app_id) || 0;
    countsMap.set(conn.public_app_id, count + 1);
  });
  
  // Преобразуем count
  const appsWithStats: PublicApp[] = (apps || []).map(app => ({
    ...app,
    connections_count: countsMap.get(app.id) || 0
  }));
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">Активно</span>;
      case 'draft':
        return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-700">Черновик</span>;
      case 'deprecated':
        return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">Удалено</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">{status}</span>;
    }
  };
  
  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      engagement: 'Вовлечение',
      moderation: 'Модерация',
      analytics: 'Аналитика',
      ai: 'AI',
      other: 'Другое'
    };
    return labels[category] || category;
  };
  
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Каталог приложений</h2>
          <p className="text-gray-600 mt-1">
            Управление партнёрскими MiniApps в публичном каталоге
          </p>
        </div>
        <Link
          href="/superadmin/public-apps/new"
          className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Добавить приложение
        </Link>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">
            {appsWithStats.length}
          </div>
          <div className="text-sm text-gray-500">Всего приложений</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-green-600">
            {appsWithStats.filter(a => a.status === 'active').length}
          </div>
          <div className="text-sm text-gray-500">Активных</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-purple-600">
            {appsWithStats.reduce((sum, a) => sum + a.connections_count, 0)}
          </div>
          <div className="text-sm text-gray-500">Всего подключений</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-amber-600">
            {appsWithStats.filter(a => a.featured).length}
          </div>
          <div className="text-sm text-gray-500">Рекомендованных</div>
        </div>
      </div>
      
      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Приложение
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Категория
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Партнёр
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Подключения
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Статус
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Действия
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {appsWithStats.map((app) => (
              <tr key={app.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {app.icon_url ? (
                      <img 
                        src={app.icon_url} 
                        alt="" 
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white text-lg">
                        {app.name[0]}
                      </div>
                    )}
                    <div className="ml-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {app.name}
                        </span>
                        {app.featured && (
                          <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {app.slug}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">
                    {getCategoryLabel(app.category)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {app.partner_name || '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center text-sm text-gray-500">
                    <Users className="w-4 h-4 mr-1" />
                    {app.connections_count}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(app.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    {app.bot_username && (
                      <a
                        href={`https://t.me/${app.bot_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-gray-600"
                        title="Открыть бота"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <Link
                      href={`/superadmin/public-apps/${app.id}`}
                      className="text-purple-600 hover:text-purple-900"
                    >
                      Редактировать
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            
            {appsWithStats.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  Нет приложений в каталоге
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

