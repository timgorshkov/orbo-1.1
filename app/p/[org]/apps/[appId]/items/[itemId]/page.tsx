'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Head from 'next/head';
import { ArrowLeft, Calendar, MapPin, User, Tag, Trash2, Loader2, AlertCircle, Share2, Copy, Check, List } from 'lucide-react';

interface App {
  id: string;
  name: string;
  description: string;
  icon: string;
  org_id: string;
}

interface Collection {
  id: string;
  schema: any;
}

interface AppItem {
  id: string;
  data: Record<string, any>;
  status: string;
  created_at: string;
  created_by_participant_id: string | null;
}

interface Participant {
  id: string;
  full_name: string | null;
  username: string | null;
  photo_url: string | null;
}

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.org as string;
  const appId = params.appId as string;
  const itemId = params.itemId as string;

  const [app, setApp] = useState<App | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [item, setItem] = useState<AppItem | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    fetchItemDetails();
  }, [itemId]);

  const fetchItemDetails = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch app
      const appResponse = await fetch(`/api/apps/${appId}`);
      if (!appResponse.ok) throw new Error('App not found');
      const appData = await appResponse.json();
      setApp(appData.app);

      // Fetch collection
      const collectionResponse = await fetch(`/api/apps/${appId}/collections`);
      if (!collectionResponse.ok) throw new Error('Failed to fetch collection');
      const collectionData = await collectionResponse.json();
      if (collectionData.collections && collectionData.collections.length > 0) {
        setCollection(collectionData.collections[0]);
      }

      // Fetch item
      const itemResponse = await fetch(`/api/apps/${appId}/items/${itemId}`);
      if (!itemResponse.ok) throw new Error('Item not found');
      const itemData = await itemResponse.json();
      
      console.log('[ItemDetail] Full item data:', itemData.item);
      console.log('[ItemDetail] Has participant?', !!itemData.item.participant);
      console.log('[ItemDetail] Participant data:', itemData.item.participant);
      console.log('[ItemDetail] Creator ID:', itemData.item.creator_id);
      console.log('[ItemDetail] Org ID:', itemData.item.org_id);
      
      setItem(itemData.item);

      // Fetch participant (author) if available
      if (itemData.item.participant) {
        console.log('[ItemDetail] Setting participant:', itemData.item.participant);
        setParticipant(itemData.item.participant);
      } else {
        console.warn('[ItemDetail] No participant data in API response');
      }

      // Check if current user is owner or admin
      try {
        const authResponse = await fetch('/api/auth/status');
        console.log('[ItemDetail] Auth response ok?', authResponse.ok);
        
        if (authResponse.ok) {
          const authData = await authResponse.json();
          console.log('[ItemDetail] Auth data:', authData);
          
          if (authData.authenticated && authData.user) {
            // Check if user is creator
            const isCreator = itemData.item.creator_id === authData.user.id;
            console.log('[ItemDetail] Is creator?', isCreator);
            console.log('[ItemDetail] Item creator_id:', itemData.item.creator_id);
            console.log('[ItemDetail] Current user id:', authData.user.id);
            
            // Check if user is org admin/member by fetching membership
            let isOrgAdmin = false;
            try {
              const membershipResponse = await fetch(`/api/memberships?org_id=${orgId}&user_id=${authData.user.id}`);
              if (membershipResponse.ok) {
                const membershipData = await membershipResponse.json();
                isOrgAdmin = membershipData.memberships && membershipData.memberships.length > 0;
              }
            } catch (membershipErr) {
              console.warn('[ItemDetail] Could not check membership:', membershipErr);
            }
            console.log('[ItemDetail] Is org admin?', isOrgAdmin);
            
            const finalIsOwner = isCreator || isOrgAdmin;
            console.log('[ItemDetail] Final isOwner:', finalIsOwner);
            setIsOwner(finalIsOwner);
            setIsAdmin(isOrgAdmin); // Set admin status for toolbar
          } else {
            console.log('[ItemDetail] User not authenticated');
          }
        } else {
          console.log('[ItemDetail] Auth check failed');
        }
      } catch (err) {
        console.error('[ItemDetail] Error checking ownership:', err);
      } finally {
        setIsCheckingAuth(false);
      }
    } catch (err: any) {
      console.error('Error fetching item:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Вы уверены, что хотите удалить это объявление?')) {
      return;
    }

    try {
      const response = await fetch(`/api/apps/${appId}/items/${itemId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete item');

      router.push(`/p/${orgId}/apps/${appId}`);
    } catch (err: any) {
      console.error('Error deleting item:', err);
      alert('Не удалось удалить объявление');
    }
  };

  const handleCopyLink = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
      alert('Не удалось скопировать ссылку');
    }
  };

  const renderFieldValue = (fieldName: string, value: any, field: any) => {
    if (!value) return <span className="text-gray-400 dark:text-gray-500">Не указано</span>;

    switch (field?.type) {
      case 'image':
      case 'images':
        const images = Array.isArray(value) ? value : [value];
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {images.map((img, idx) => (
              <img
                key={idx}
                src={img}
                alt={`Фото ${idx + 1}`}
                className="w-full aspect-square object-cover rounded-lg"
              />
            ))}
          </div>
        );

      case 'number':
        return (
          <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {new Intl.NumberFormat('ru-RU').format(value)} ₽
          </span>
        );

      case 'select':
        const option = field.options?.find((opt: any) => opt.value === value);
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
            <Tag className="w-3 h-3 mr-1" />
            {option?.label || value}
          </span>
        );

      case 'text':
        return (
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {value}
          </p>
        );

      case 'boolean':
        return value ? '✅ Да' : '❌ Нет';

      case 'date':
        return new Date(value).toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

      default:
        return <span className="text-gray-900 dark:text-white">{value}</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !app || !collection || !item) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {error || 'Объявление не найдено'}
          </h1>
          <Link
            href={`/p/${orgId}/apps/${appId}`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 mt-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Вернуться к списку
          </Link>
        </div>
      </div>
    );
  }

  // Get title and description fields
  const titleField = collection.schema.fields.find((f: any) => f.name === 'title' || f.type === 'string');
  const descriptionField = collection.schema.fields.find((f: any) => f.name === 'description' || f.type === 'text');
  
  const title = titleField ? item.data[titleField.name] : 'Без названия';
  const description = descriptionField ? item.data[descriptionField.name] : '';
  const imageUrl = item.data.image_url || '/orbo-logo-2-no-bg.png';
  const price = item.data.price ? `${new Intl.NumberFormat('ru-RU').format(item.data.price)} ₽` : '';
  const category = item.data.category || '';

  // Build SEO meta
  const pageTitle = `${title} - ${app.name}`;
  const pageDescription = description?.slice(0, 160) || `${category ? category + ' - ' : ''}${price}`;
  const pageUrl = `https://app.orbo.ru/p/${orgId}/apps/${appId}/items/${itemId}`;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        
        {/* Open Graph */}
        <meta property="og:type" content="article" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:image" content={imageUrl} />
        <meta property="og:site_name" content="Orbo" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="twitter:image" content={imageUrl} />
        
        {/* Telegram specific */}
        <meta property="telegram:card" content="summary_large_image" />
      </Head>
      
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Admin Toolbar */}
      {isAdmin && !isCheckingAuth && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 border-b border-blue-800">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-white text-sm font-medium">Режим администратора</span>
              </div>
              <div className="flex items-center space-x-2">
                <Link
                  href={`/p/${orgId}/apps/${appId}`}
                  className="inline-flex items-center px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  <List className="w-4 h-4 mr-1.5" />
                  Все объявления
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-6">
          <Link
            href={`/p/${orgId}/apps/${appId}`}
            className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад к списку
          </Link>

          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-4">
              <div className="text-4xl">{app.icon}</div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  {title}
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {app.name}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowShareModal(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Поделиться
              </button>
              {isOwner && (
                <button
                  onClick={handleDelete}
                  className="inline-flex items-center px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Удалить
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Image - if exists */}
          {item.data.image_url && (
            <div className="w-full aspect-[16/9] bg-gray-100 dark:bg-gray-700">
              <img
                src={item.data.image_url}
                alt={title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}

          <div className="p-4 space-y-4">
            {/* Contacts Block - with author name */}
            {(item.data.phone || participant?.username || participant?.full_name) && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                {participant?.full_name && (
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    {participant.full_name}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  {item.data.phone && (
                    <a
                      href={`tel:${item.data.phone}`}
                      className="inline-flex items-center text-sm text-blue-700 dark:text-blue-300 hover:underline"
                    >
                      <span className="mr-1">📱</span>
                      {item.data.phone}
                    </a>
                  )}
                  {participant?.username && (
                    <a
                      href={`https://t.me/${participant.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-sm text-blue-700 dark:text-blue-300 hover:underline"
                    >
                      <span className="mr-1">✈️</span>
                      @{participant.username}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            {description && (
              <div>
                <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                  {description}
                </p>
              </div>
            )}

            {/* Other Fields (price, etc) */}
            {collection.schema.fields.map((field: any) => {
              const value = item.data[field.name];
              
              // Skip already displayed fields
              if (!value) return null;
              if (field.name === 'title' || field.name === 'description') return null;
              if (field.name === 'image_url' || field.name === 'phone') return null;
              if (field.name === 'category') return null; // Will show at bottom
              
              // Price field - prominent
              if (field.type === 'number' && field.name === 'price') {
                return (
                  <div key={field.name} className="py-2">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {new Intl.NumberFormat('ru-RU').format(value)} ₽
                    </div>
                  </div>
                );
              }

              // Other fields
              return (
                <div key={field.name} className="text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{field.label}: </span>
                  <span className="text-gray-600 dark:text-gray-400">{renderFieldValue(field.name, value, field)}</span>
                </div>
              );
            })}

            {/* Category + Date at bottom */}
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                {/* Category */}
                {item.data.category && collection.schema.fields.find((f: any) => f.name === 'category') && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
                    {(() => {
                      const categoryField = collection.schema.fields.find((f: any) => f.name === 'category');
                      const option = categoryField?.options?.find((opt: any) => opt.value === item.data.category);
                      return option?.label || item.data.category;
                    })()}
                  </span>
                )}
                {/* Date */}
                <span className="inline-flex items-center">
                  <Calendar className="w-3 h-3 mr-1" />
                  {new Date(item.created_at).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
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

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowShareModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Поделиться
              </h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* Copy Link Button */}
              <button
                onClick={handleCopyLink}
                className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                {linkCopied ? (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    Ссылка скопирована!
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5 mr-2" />
                    Скопировать ссылку
                  </>
                )}
              </button>

              {/* Future: Telegram Groups */}
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center pt-2">
                Скоро: публикация в Telegram-группы
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

