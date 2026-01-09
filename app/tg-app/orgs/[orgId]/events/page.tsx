'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Script from 'next/script';
import { Calendar, MapPin, Users, Clock, Loader2, ChevronRight, Video } from 'lucide-react';

interface Event {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  event_type: 'online' | 'offline';
  location_info: string | null;
  event_date: string;
  end_date?: string | null;
  start_time: string;
  end_time: string;
  requires_payment?: boolean;
  default_price?: number | null;
  currency?: string;
  capacity?: number | null;
  registered_count?: number;
  status: string;
}

interface Organization {
  id: string;
  name: string;
  logo_url?: string | null;
}

export default function TelegramEventsListPage() {
  const params = useParams();
  const orgId = params?.orgId as string;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [webAppReady, setWebAppReady] = useState(false);

  // Initialize WebApp
  useEffect(() => {
    const initWebApp = () => {
      if (window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        setWebAppReady(true);
        
        // Set theme
        const bg = tg.themeParams.bg_color || '#ffffff';
        tg.setHeaderColor(bg);
        tg.setBackgroundColor(bg);
        
        // Store initData for use across navigation
        if (tg.initData && tg.initData.length > 0) {
          try {
            sessionStorage.setItem('tg_init_data', tg.initData);
          } catch (e) {
            // Ignore storage errors
          }
        }
        
        // Store user info
        if (tg.initDataUnsafe?.user) {
          try {
            sessionStorage.setItem('tg_user', JSON.stringify(tg.initDataUnsafe.user));
          } catch (e) {
            // Ignore
          }
        }
      }
    };

    if (window.Telegram?.WebApp) {
      initWebApp();
    } else {
      const timer = setTimeout(initWebApp, 100);
      return () => clearTimeout(timer);
    }
  }, []);

  // Fetch events
  useEffect(() => {
    if (!orgId) return;
    
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/telegram/webapp/orgs/${orgId}/events`);
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch events');
        }
        
        const data = await response.json();
        setOrganization(data.organization);
        setEvents(data.events || []);
      } catch (err) {
        console.error('Error fetching events:', err);
        setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    };
    
    fetchEvents();
  }, [orgId]);

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', { 
      day: 'numeric',
      month: 'short'
    });
  };

  // Format time
  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    return timeStr.slice(0, 5);
  };

  // Get currency symbol
  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = {
      'RUB': '₽',
      'USD': '$',
      'EUR': '€',
      'KZT': '₸',
      'BYN': 'Br'
    };
    return symbols[currency] || currency;
  };

  // Navigate to event
  const openEvent = (eventId: string) => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    window.location.href = `/tg-app/events/${eventId}`;
  };

  if (loading) {
    return (
      <>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
        <div className="min-h-screen flex items-center justify-center bg-white">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
          <p className="text-red-500 text-center mb-4">{error}</p>
          <button
            onClick={() => window.Telegram?.WebApp?.close()}
            className="text-blue-500"
          >
            Закрыть
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-4">
          <div className="flex items-center gap-3">
            {organization?.logo_url && organization.logo_url.length > 0 ? (
              <img
                src={organization.logo_url}
                alt={organization.name}
                width={40}
                height={40}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-500" />
              </div>
            )}
            <div>
              <h1 className="font-semibold text-gray-900">События</h1>
              <p className="text-sm text-gray-500">{organization?.name}</p>
            </div>
          </div>
        </div>
        
        {/* Events list */}
        <div className="p-4">
          {events.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Нет предстоящих событий</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <button
                  key={event.id}
                  onClick={() => openEvent(event.id)}
                  className="w-full bg-white rounded-xl p-4 border border-gray-100 text-left active:bg-gray-50 transition-colors"
                >
                  <div className="flex gap-4">
                    {/* Event image or date badge */}
                    {event.cover_image_url ? (
                      <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                        <img
                          src={event.cover_image_url}
                          alt={event.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 flex-shrink-0 rounded-lg bg-blue-50 flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold text-blue-600">
                          {new Date(event.event_date).getDate()}
                        </span>
                        <span className="text-xs text-blue-500 uppercase">
                          {new Date(event.event_date).toLocaleDateString('ru-RU', { month: 'short' })}
                        </span>
                      </div>
                    )}
                    
                    {/* Event info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 mb-1 truncate">{event.title}</h3>
                      
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDate(event.event_date)}</span>
                        <span>•</span>
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatTime(event.start_time)}</span>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {event.event_type === 'online' ? (
                            <span className="flex items-center gap-1 flex-shrink-0">
                              <Video className="w-3 h-3" />
                              Онлайн
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 min-w-0">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate max-w-[100px]">{event.location_info || 'Офлайн'}</span>
                            </span>
                          )}
                          
                          {event.registered_count !== undefined && event.registered_count > 0 && (
                            <span className="flex items-center gap-1 flex-shrink-0">
                              <Users className="w-3 h-3" />
                              {event.registered_count}
                            </span>
                          )}
                        </div>
                        
                        {event.requires_payment && event.default_price && (
                          <span className="text-green-600 font-medium flex-shrink-0 ml-2 whitespace-nowrap">
                            {event.default_price.toLocaleString('ru-RU')} {getCurrencySymbol(event.currency || 'RUB')}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0 self-center" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Close button */}
        <div className="p-4 pt-0">
          <button
            onClick={() => window.Telegram?.WebApp?.close()}
            className="w-full py-3 text-center text-gray-500 font-medium"
          >
            Закрыть
          </button>
        </div>
      </div>
    </>
  );
}

