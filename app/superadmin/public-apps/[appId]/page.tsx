'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Loader2, Trash2, ExternalLink, Users, Star, StarOff } from 'lucide-react';

interface PublicApp {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  full_description: string | null;
  icon_url: string | null;
  banner_url: string | null;
  screenshots: string[];
  bot_username: string | null;
  miniapp_url: string | null;
  bot_deep_link_template: string | null;
  setup_instructions: string | null;
  features: string[];
  category: string;
  tags: string[];
  partner_name: string | null;
  partner_website: string | null;
  partner_contact: string | null;
  status: string;
  featured: boolean;
  sort_order: number;
  created_at: string;
}

interface AppStats {
  total_connections: number;
  active_connections: number;
  total_groups: number;
}

const CATEGORIES = [
  { value: 'engagement', label: 'Вовлечение' },
  { value: 'moderation', label: 'Модерация' },
  { value: 'analytics', label: 'Аналитика' },
  { value: 'ai', label: 'AI' },
  { value: 'other', label: 'Другое' },
];

const STATUSES = [
  { value: 'draft', label: 'Черновик' },
  { value: 'active', label: 'Активно' },
  { value: 'deprecated', label: 'Удалено' },
];

export default function EditPublicAppPage() {
  const params = useParams();
  const router = useRouter();
  const appId = params?.appId as string;
  
  const [app, setApp] = useState<PublicApp | null>(null);
  const [stats, setStats] = useState<AppStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form fields
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    short_description: '',
    full_description: '',
    icon_url: '',
    banner_url: '',
    bot_username: '',
    miniapp_url: '',
    bot_deep_link_template: '',
    setup_instructions: '',
    features: '',
    category: 'other',
    tags: '',
    partner_name: '',
    partner_website: '',
    partner_contact: '',
    status: 'draft',
    featured: false,
    sort_order: 0
  });
  
  useEffect(() => {
    fetchApp();
  }, [appId]);
  
  const fetchApp = async () => {
    try {
      const response = await fetch(`/api/admin/public-apps/${appId}`);
      if (response.ok) {
        const data = await response.json();
        setApp(data.app);
        setStats(data.stats);
        
        // Populate form
        setFormData({
          name: data.app.name || '',
          slug: data.app.slug || '',
          short_description: data.app.short_description || '',
          full_description: data.app.full_description || '',
          icon_url: data.app.icon_url || '',
          banner_url: data.app.banner_url || '',
          bot_username: data.app.bot_username || '',
          miniapp_url: data.app.miniapp_url || '',
          bot_deep_link_template: data.app.bot_deep_link_template || '',
          setup_instructions: data.app.setup_instructions || '',
          features: (data.app.features || []).join('\n'),
          category: data.app.category || 'other',
          tags: (data.app.tags || []).join(', '),
          partner_name: data.app.partner_name || '',
          partner_website: data.app.partner_website || '',
          partner_contact: data.app.partner_contact || '',
          status: data.app.status || 'draft',
          featured: data.app.featured || false,
          sort_order: data.app.sort_order || 0
        });
      } else if (response.status === 404) {
        setError('Приложение не найдено');
      }
    } catch (err) {
      setError('Ошибка загрузки');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/public-apps/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          features: formData.features.split('\n').map(f => f.trim()).filter(Boolean),
          tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean)
        })
      });
      
      if (response.ok) {
        router.push('/superadmin/public-apps');
      } else {
        const data = await response.json();
        alert(data.error || 'Ошибка сохранения');
      }
    } catch (err) {
      alert('Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDelete = async () => {
    if (!confirm('Удалить приложение? Оно будет помечено как deprecated.')) return;
    
    try {
      const response = await fetch(`/api/admin/public-apps/${appId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        router.push('/superadmin/public-apps');
      }
    } catch (err) {
      alert('Ошибка удаления');
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
        <Link href="/superadmin/public-apps" className="text-purple-600 hover:underline mt-4 inline-block">
          Назад к списку
        </Link>
      </div>
    );
  }
  
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/superadmin/public-apps"
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{app?.name}</h2>
            <p className="text-gray-600">Редактирование приложения</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDelete}
            className="inline-flex items-center px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Удалить
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Сохранить
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Основная информация</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Название *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Slug *
                  </label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Краткое описание
                </label>
                <input
                  type="text"
                  value={formData.short_description}
                  onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Полное описание
                </label>
                <textarea
                  value={formData.full_description}
                  onChange={(e) => setFormData({ ...formData, full_description: e.target.value })}
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Категория
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Статус
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    {STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Теги (через запятую)
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="нетворкинг, b2b, мэтчинг"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
          
          {/* Integration */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Интеграция</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Username бота *
                  </label>
                  <input
                    type="text"
                    value={formData.bot_username}
                    onChange={(e) => setFormData({ ...formData, bot_username: e.target.value })}
                    placeholder="votumfit_bot"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    MiniApp URL
                  </label>
                  <input
                    type="text"
                    value={formData.miniapp_url}
                    onChange={(e) => setFormData({ ...formData, miniapp_url: e.target.value })}
                    placeholder="t.me/votumfit_bot/app"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deep Link шаблон
                </label>
                <input
                  type="text"
                  value={formData.bot_deep_link_template}
                  onChange={(e) => setFormData({ ...formData, bot_deep_link_template: e.target.value })}
                  placeholder="https://t.me/votumfit_bot?start=org_{org_id}"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Инструкция по подключению
                </label>
                <textarea
                  value={formData.setup_instructions}
                  onChange={(e) => setFormData({ ...formData, setup_instructions: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
          
          {/* Features */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Возможности</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Список возможностей (каждая на новой строке)
              </label>
              <textarea
                value={formData.features}
                onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                rows={6}
                placeholder="Публикация запросов&#10;Автоматический мэтчинг&#10;Уведомления о совпадениях"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>
          
          {/* Partner */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Партнёр</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Название партнёра
                  </label>
                  <input
                    type="text"
                    value={formData.partner_name}
                    onChange={(e) => setFormData({ ...formData, partner_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Сайт партнёра
                  </label>
                  <input
                    type="text"
                    value={formData.partner_website}
                    onChange={(e) => setFormData({ ...formData, partner_website: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Контакт партнёра
                </label>
                <input
                  type="text"
                  value={formData.partner_contact}
                  onChange={(e) => setFormData({ ...formData, partner_contact: e.target.value })}
                  placeholder="@username или email"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
          
          {/* Media */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Медиа</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL иконки
                  </label>
                  <input
                    type="text"
                    value={formData.icon_url}
                    onChange={(e) => setFormData({ ...formData, icon_url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL баннера
                  </label>
                  <input
                    type="text"
                    value={formData.banner_url}
                    onChange={(e) => setFormData({ ...formData, banner_url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Sidebar */}
        <div className="space-y-6">
          {/* Stats */}
          {stats && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Статистика</h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Подключений</span>
                  <span className="font-semibold">{stats.total_connections}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Активных</span>
                  <span className="font-semibold text-green-600">{stats.active_connections}</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Settings */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Настройки</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">Рекомендованное</div>
                  <div className="text-sm text-gray-500">Показывать в начале списка</div>
                </div>
                <button
                  onClick={() => setFormData({ ...formData, featured: !formData.featured })}
                  className={`p-2 rounded-lg transition-colors ${
                    formData.featured 
                      ? 'bg-amber-100 text-amber-600' 
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  }`}
                >
                  {formData.featured ? (
                    <Star className="w-5 h-5 fill-current" />
                  ) : (
                    <StarOff className="w-5 h-5" />
                  )}
                </button>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Порядок сортировки
                </label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
          
          {/* Quick Links */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Ссылки</h3>
            
            <div className="space-y-2">
              {formData.bot_username && (
                <a
                  href={`https://t.me/${formData.bot_username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-purple-600 hover:text-purple-800"
                >
                  <ExternalLink className="w-4 h-4" />
                  @{formData.bot_username}
                </a>
              )}
              {formData.miniapp_url && (
                <a
                  href={formData.miniapp_url.startsWith('http') ? formData.miniapp_url : `https://${formData.miniapp_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-purple-600 hover:text-purple-800"
                >
                  <ExternalLink className="w-4 h-4" />
                  MiniApp
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

