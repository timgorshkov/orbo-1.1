'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Loader2, AlertCircle, Settings, AlertTriangle, Trash2 } from 'lucide-react';
import DynamicItemCard from '@/components/apps/dynamic-item-card';
import ItemsFilters from '@/components/apps/items-filters';

interface App {
  id: string;
  name: string;
  description: string;
  icon: string;
  logo_url: string | null;
  org_id: string;
}

interface Collection {
  id: string;
  name: string;
  display_name: string;
  schema: any;
  moderation_enabled: boolean;
}

interface Participant {
  id: string;
  full_name: string | null;
  username: string | null;
  photo_url: string | null;
}

interface AppItem {
  id: string;
  data: Record<string, any>;
  status: string;
  created_at: string;
  created_by_participant_id: string | null;
  participant?: Participant | null;
}

export default function PublicItemsFeedPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.org as string;
  const appId = params.appId as string;

  const [app, setApp] = useState<App | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<AppItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<AppItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [sort, setSort] = useState('created_at_desc');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [orgName, setOrgName] = useState<string>('');

  useEffect(() => {
    fetchAppData();
    checkAdminStatus();
  }, [appId]);

  const checkAdminStatus = async () => {
    try {
      const response = await fetch('/api/auth/status');
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.user) {
          // Check if user is admin/owner of this org by fetching membership
          try {
            const membershipResponse = await fetch(`/api/memberships?org_id=${orgId}&user_id=${data.user.id}`);
            if (membershipResponse.ok) {
              const membershipData = await membershipResponse.json();
              if (membershipData.memberships && membershipData.memberships.length > 0) {
                const membership = membershipData.memberships[0];
                // ✅ Only owner and admin can see admin toolbar
                setIsAdmin(membership.role === 'owner' || membership.role === 'admin');
              }
            }
          } catch (membershipErr) {
            console.warn('Could not check membership:', membershipErr);
          }
        }
      }
    } catch (err) {
      console.error('Error checking admin status:', err);
    } finally {
      setIsCheckingAuth(false);
    }
  };

  useEffect(() => {
    applyFiltersAndSort();
  }, [items, filters, sort, isAdmin]);

  const fetchAppData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch app details
      const appResponse = await fetch(`/api/apps/${appId}`);
      if (!appResponse.ok) {
        throw new Error('App not found');
      }
      const appData = await appResponse.json();
      setApp(appData.app);

      // Fetch org name
      try {
        const orgResponse = await fetch(`/api/organizations/${appData.app.org_id}`);
        if (orgResponse.ok) {
          const orgData = await orgResponse.json();
          setOrgName(orgData.organization?.name || 'Сообщество');
        }
      } catch {
        setOrgName('Сообщество');
      }

      // Fetch collection
      const collectionResponse = await fetch(`/api/apps/${appId}/collections`);
      if (!collectionResponse.ok) {
        throw new Error('Failed to fetch collection');
      }
      const collectionData = await collectionResponse.json();
      if (collectionData.collections && collectionData.collections.length > 0) {
        setCollection(collectionData.collections[0]); // First collection
      }

      // Fetch items (published or active - for backward compatibility)
      const itemsResponse = await fetch(`/api/apps/${appId}/items?limit=100`);
      if (!itemsResponse.ok) {
        throw new Error('Failed to fetch items');
      }
      const itemsData = await itemsResponse.json();
      // For public users: filter out pending items (moderation queue)
      // For admins: show all items (will be checked after auth status is loaded)
      setItems(itemsData.items || []);
    } catch (err: any) {
      console.error('Error fetching app data:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let result = [...items];

    // ✅ Removed frontend filtering of pending items
    // API already returns correct items based on user permissions:
    // - Admins see all items
    // - Regular users see published/active + their own pending items

    // Apply filters
    Object.keys(filters).forEach(fieldName => {
      const filterValue = filters[fieldName];
      result = result.filter(item => item.data[fieldName] === filterValue);
    });

    // Apply sort
    if (sort === 'created_at_desc') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sort === 'created_at_asc') {
      result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sort === 'price_asc') {
      result.sort((a, b) => (a.data.price || 0) - (b.data.price || 0));
    } else if (sort === 'price_desc') {
      result.sort((a, b) => (b.data.price || 0) - (a.data.price || 0));
    }

    setFilteredItems(result);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !app || !collection) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {error || 'Приложение не найдено'}
          </h1>
          <Link
            href={`/p/${orgId}/apps`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 mt-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Вернуться к списку приложений
          </Link>
        </div>
      </div>
    );
  }

  const handleDeleteApp = async () => {
    const itemCount = items.length;
    const message = itemCount > 0
      ? `Вы уверены, что хотите удалить это приложение?\n\nБудут удалены:\n- Приложение "${app?.name}"\n- ${itemCount} объектов\n- Все связанные данные\n\nЭто действие необратимо!`
      : `Вы уверены, что хотите удалить приложение "${app?.name}"? Это действие необратимо.`;
    
    if (!confirm(message)) {
      return;
    }

    try {
      const response = await fetch(`/api/apps/${appId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || 'Не удалось удалить приложение');
        return;
      }

      router.push(`/app/${orgId}/apps`);
    } catch (err) {
      console.error('Error deleting app:', err);
      alert('Произошла ошибка при удалении');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Admin Toolbar */}
      {isAdmin && !isCheckingAuth && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 border-b border-blue-800">
          <div className="container mx-auto px-2 md:px-4 py-2 md:py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-white text-xs md:text-sm font-medium hidden sm:inline">Режим администратора</span>
                <span className="text-white text-xs font-medium sm:hidden">Админ</span>
              </div>
              <div className="flex items-center gap-1 md:gap-2">
                <Link
                  href={`/p/${orgId}/apps/${appId}/customize`}
                  className="inline-flex items-center px-2 md:px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-white rounded-lg transition-colors text-sm font-medium"
                  title="Кастомизация"
                >
                  <Settings className="w-4 h-4 md:mr-1.5" />
                  <span className="hidden md:inline">Кастомизация</span>
                </Link>
                <Link
                  href={`/p/${orgId}/apps/${appId}/edit`}
                  className="inline-flex items-center px-2 md:px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm font-medium"
                  title="Настройки"
                >
                  <Settings className="w-4 h-4 md:mr-1.5" />
                  <span className="hidden md:inline">Настройки</span>
                </Link>
                <Link
                  href={`/p/${orgId}/apps/${appId}/moderation`}
                  className="inline-flex items-center px-2 md:px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-white rounded-lg transition-colors text-sm font-medium"
                  title="Модерация"
                >
                  <AlertTriangle className="w-4 h-4 md:mr-1.5" />
                  <span className="hidden md:inline">Модерация</span>
                </Link>
                <button
                  onClick={handleDeleteApp}
                  className="inline-flex items-center px-2 md:px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-white rounded-lg transition-colors text-sm font-medium"
                  title="Удалить"
                >
                  <Trash2 className="w-4 h-4 md:mr-1.5" />
                  <span className="hidden md:inline">Удалить</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <Link
            href={`/p/${orgId}/apps`}
            className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-2 text-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            {orgName || 'Сообщество'}
          </Link>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {app.logo_url ? (
                <img src={app.logo_url} alt={app.name} className="w-12 h-12 md:w-16 md:h-16 rounded-lg object-contain flex-shrink-0" />
              ) : (
                <div className="text-3xl md:text-4xl flex-shrink-0">{app.icon}</div>
              )}
              <div className="min-w-0">
                <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white truncate">
                  {app.name}
                </h1>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 truncate">
                  {app.description}
                </p>
              </div>
            </div>

            <Link
              href={`/p/${orgId}/apps/${appId}/create`}
              className="inline-flex items-center px-3 md:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex-shrink-0"
            >
              <Plus className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Добавить</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Filters */}
        <ItemsFilters
          schema={collection.schema}
          onFilterChange={setFilters}
          onSortChange={setSort}
          onViewChange={setView}
          currentView={view}
          totalCount={filteredItems.length}
        />

        {/* Items Grid/List */}
        {filteredItems.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
            <div className="text-4xl mb-4">📭</div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {items.length === 0 ? 'Пока ничего не добавлено' : 'Ничего не найдено'}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {items.length === 0
                ? `Станьте первым, кто добавит ${collection.display_name.toLowerCase()}`
                : 'Попробуйте изменить фильтры'
              }
            </p>
            <Link
              href={`/p/${orgId}/apps/${appId}/create`}
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Plus className="w-5 h-5 mr-2" />
              Добавить
            </Link>
          </div>
        ) : (
          <div
            className={
              view === 'grid'
                ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'
                : 'space-y-4'
            }
          >
            {filteredItems.map((item) => (
              <DynamicItemCard
                key={item.id}
                item={item}
                schema={collection.schema}
                orgId={orgId}
                appId={appId}
                view={view}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-700 mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-gray-600 dark:text-gray-400">
          Создано на платформе{' '}
          <a 
            href="https://www.orbo.ru" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            Orbo
          </a>
          {' '}— инструменты для Telegram-сообществ
        </div>
      </footer>
    </div>
  );
}

