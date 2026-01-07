'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Search, Loader2, Store, Star, ExternalLink, Check, Filter } from 'lucide-react';
import { createClientLogger } from '@/lib/logger';

interface CatalogApp {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  icon_url: string | null;
  category: string;
  tags: string[];
  featured: boolean;
  partner_name: string | null;
  bot_username: string | null;
  miniapp_url: string | null;
}

const CATEGORIES = [
  { value: 'all', label: 'Все' },
  { value: 'engagement', label: 'Вовлечение' },
  { value: 'moderation', label: 'Модерация' },
  { value: 'analytics', label: 'Аналитика' },
  { value: 'ai', label: 'AI' },
  { value: 'other', label: 'Другое' },
];

export default function AppsCatalogPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params?.org as string;
  const clientLogger = createClientLogger('AppsCatalog', { orgId });
  
  const [apps, setApps] = useState<CatalogApp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectedApps, setConnectedApps] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchCatalog();
    fetchConnectedApps();
  }, [selectedCategory, searchQuery]);

  const fetchCatalog = async () => {
    try {
      setIsLoading(true);
      const queryParams = new URLSearchParams();
      if (selectedCategory !== 'all') {
        queryParams.set('category', selectedCategory);
      }
      if (searchQuery.trim()) {
        queryParams.set('search', searchQuery.trim());
      }
      
      const response = await fetch(`/api/apps/catalog?${queryParams}`);
      if (response.ok) {
        const data = await response.json();
        setApps(data.apps || []);
      }
    } catch (error) {
      clientLogger.error({ error }, 'Error fetching catalog');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchConnectedApps = async () => {
    try {
      const response = await fetch(`/api/apps/org/${orgId}`);
      if (response.ok) {
        const data = await response.json();
        const catalogIds = new Set<string>(
          (data.apps || [])
            .filter((a: any) => a.app_type === 'catalog')
            .map((a: any) => a.source_id as string)
        );
        setConnectedApps(catalogIds);
      }
    } catch (error) {
      clientLogger.error({ error }, 'Error fetching connected apps');
    }
  };

  const handleConnect = async (app: CatalogApp) => {
    setConnecting(app.id);
    try {
      const response = await fetch(`/api/apps/catalog/${app.id}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId })
      });
      
      if (response.ok) {
        setConnectedApps(prev => {
          const newSet = new Set(prev);
          newSet.add(app.id);
          return newSet;
        });
        // Redirect to apps list with success message
        router.push(`/p/${orgId}/apps?connected=${app.id}`);
      } else {
        const error = await response.json();
        alert(error.error || 'Не удалось подключить приложение');
      }
    } catch (error) {
      clientLogger.error({ error }, 'Error connecting app');
      alert('Ошибка при подключении');
    } finally {
      setConnecting(null);
    }
  };

  const getCategoryLabel = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.label || category;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/p/${orgId}/apps`}
          className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад к приложениям
        </Link>
        
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
            <Store className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Каталог приложений
          </h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Готовые приложения от партнёров для вашего сообщества
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск приложений..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          
          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400 hidden md:block" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        </div>
      )}

      {/* Apps Grid */}
      {!isLoading && apps.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {apps.map((app) => {
            const isConnected = connectedApps.has(app.id);
            const isConnecting = connecting === app.id;
            
            return (
              <div
                key={app.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Featured badge */}
                {app.featured && (
                  <div className="bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-medium px-3 py-1 flex items-center justify-center gap-1">
                    <Star className="w-3 h-3" />
                    Рекомендовано
                  </div>
                )}
                
                <div className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    {app.icon_url ? (
                      <img 
                        src={app.icon_url} 
                        alt={app.name} 
                        className="w-14 h-14 rounded-xl object-cover bg-gray-100 dark:bg-gray-700" 
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                        <Store className="w-7 h-7 text-white" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                        {app.name}
                      </h3>
                      {app.partner_name && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          от {app.partner_name}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                    {app.short_description}
                  </p>
                  
                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded text-xs">
                      {getCategoryLabel(app.category)}
                    </span>
                    {app.tags?.slice(0, 2).map(tag => (
                      <span key={tag} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {isConnected ? (
                      <button
                        disabled
                        className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg font-medium"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Подключено
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(app)}
                        disabled={isConnecting}
                        className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                      >
                        {isConnecting ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : null}
                        Подключить
                      </button>
                    )}
                    
                    <Link
                      href={`/p/${orgId}/apps/catalog/${app.slug || app.id}`}
                      className="px-3 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Подробнее
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && apps.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Store className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Приложения не найдены
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {searchQuery || selectedCategory !== 'all' 
              ? 'Попробуйте изменить фильтры'
              : 'Скоро здесь появятся приложения от партнёров'}
          </p>
        </div>
      )}
    </div>
  );
}

