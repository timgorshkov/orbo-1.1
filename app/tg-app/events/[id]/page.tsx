'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Script from 'next/script';
import ReactMarkdown from 'react-markdown';
// Note: Using native img instead of Next.js Image for better Telegram WebApp compatibility
import { Calendar, MapPin, Users, Clock, ExternalLink, CheckCircle2, Loader2, ChevronUp, AlertCircle, X, Download } from 'lucide-react';

// Telegram WebApp types are defined in @/lib/types/telegram-webapp.d.ts

interface Event {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  event_type: 'online' | 'offline';
  location_info: string | null;
  map_link?: string | null;
  event_date: string;
  end_date?: string | null;
  start_time: string;
  end_time: string;
  is_paid: boolean;
  requires_payment?: boolean;
  default_price?: number | null;
  currency?: string;
  payment_link?: string | null;
  payment_instructions?: string | null;
  capacity?: number | null;
  registered_count?: number;
  status: string;
  org_id?: string;
  org_name?: string;
  enable_qr_checkin?: boolean;
}

interface RegistrationField {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox';
  required: boolean;
  field_order: number;
  options?: { options?: string[] } | null;
}

type ViewState = 'loading' | 'event' | 'form' | 'payment' | 'success' | 'error';

export default function TelegramEventPage() {
  const params = useParams();
  const eventId = params.id as string;
  
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [event, setEvent] = useState<Event | null>(null);
  const [fields, setFields] = useState<RegistrationField[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isRegistered, setIsRegistered] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telegramUser, setTelegramUser] = useState<{ id: number; first_name: string; last_name?: string; username?: string } | null>(null);
  const [webAppReady, setWebAppReady] = useState(false);

  // Helper to get initData (from WebApp or sessionStorage)
  const getInitData = (): string => {
    // First try to get from WebApp
    const webAppInitData = window.Telegram?.WebApp?.initData;
    if (webAppInitData && webAppInitData.length > 0) {
      // Store for future use within session
      try {
        sessionStorage.setItem('tg_init_data', webAppInitData);
      } catch (e) {
        // Ignore storage errors
      }
      return webAppInitData;
    }
    
    // Fallback to stored initData
    try {
      return sessionStorage.getItem('tg_init_data') || '';
    } catch (e) {
      return '';
    }
  };

  // Initialize Telegram WebApp
  useEffect(() => {
    const initWebApp = () => {
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        
        // Set theme
        if (tg.themeParams.bg_color) {
          document.body.style.backgroundColor = tg.themeParams.bg_color;
        }
        
        // Store initData if available
        if (tg.initData && tg.initData.length > 0) {
          try {
            sessionStorage.setItem('tg_init_data', tg.initData);
          } catch (e) {
            // Ignore storage errors
          }
        }
        
        // Get user data
        if (tg.initDataUnsafe.user) {
          setTelegramUser(tg.initDataUnsafe.user);
          // Also store user info
          try {
            sessionStorage.setItem('tg_user', JSON.stringify(tg.initDataUnsafe.user));
          } catch (e) {
            // Ignore
          }
        } else {
          // Try to restore user from storage
          try {
            const storedUser = sessionStorage.getItem('tg_user');
            if (storedUser) {
              setTelegramUser(JSON.parse(storedUser));
            }
          } catch (e) {
            // Ignore
          }
        }
        
        setWebAppReady(true);
        return true;
      }
      return false;
    };
    
    // Try immediately
    if (!initWebApp()) {
      // If not ready, wait and retry a few times
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (initWebApp() || attempts >= 20) {
          clearInterval(interval);
          if (attempts >= 20) {
            // Fallback: still allow viewing even without WebApp
            // Try to restore user from storage
            try {
              const storedUser = sessionStorage.getItem('tg_user');
              if (storedUser) {
                setTelegramUser(JSON.parse(storedUser));
              }
            } catch (e) {
              // Ignore
            }
            setWebAppReady(true);
          }
        }
      }, 100);
      
      return () => clearInterval(interval);
    }
  }, []);

  // Load event data - wait for WebApp to be ready
  useEffect(() => {
    if (!eventId || !webAppReady) return;
    
    const loadEvent = async () => {
      try {
        const initData = getInitData();
        
        const response = await fetch(`/api/telegram/webapp/events/${eventId}`, {
          headers: {
            'X-Telegram-Init-Data': initData,
          },
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load event');
        }
        
        setEvent(data.event);
        setFields(data.fields || []);
        setIsRegistered(data.isRegistered || false);
        setPaymentStatus(data.paymentStatus || null);
        setQrToken(data.userRegistration?.qr_token || null);
        
        // Pre-fill form with Telegram user data
        let tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        
        // Try to get from storage if not available
        if (!tgUser) {
          try {
            const storedUser = sessionStorage.getItem('tg_user');
            if (storedUser) {
              tgUser = JSON.parse(storedUser);
            }
          } catch (e) {
            // Ignore
          }
        }
        
        if (tgUser) {
          setTelegramUser(tgUser);
          const prefill: Record<string, string> = {};
          const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
          
          data.fields?.forEach((field: RegistrationField) => {
            if (field.field_key === 'full_name' || field.field_key === 'name') {
              prefill[field.field_key] = fullName;
            }
          });
          
          setFormData(prefill);
        }
        
        setViewState(data.isRegistered ? 'success' : 'event');
      } catch (err: any) {
        setError(err.message);
        setViewState('error');
      }
    };
    
    loadEvent();
  }, [eventId, webAppReady]);

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    });
  };

  const formatTime = (timeStr: string) => {
    return timeStr?.substring(0, 5) || '';
  };

  // Handle registration
  const handleRegister = useCallback(async () => {
    if (!event) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const initData = getInitData();
      
      const response = await fetch(`/api/telegram/webapp/events/${eventId}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
        },
        body: JSON.stringify({
          registration_data: formData,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }
      
      // Success!
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setIsRegistered(true);
      
      // Set QR token if provided
      if (data.registration?.qr_token) {
        setQrToken(data.registration.qr_token);
      }
      
      // Set payment status if provided
      if (data.registration?.payment_status) {
        setPaymentStatus(data.registration.payment_status);
      }
      
      // If paid event, show payment step
      if (event.requires_payment && event.payment_link) {
        setViewState('payment');
      } else {
        setViewState('success');
      }
    } catch (err: any) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [event, eventId, formData]);

  // Validate required fields
  const validateForm = (): boolean => {
    const missingFields = fields
      .filter(f => f.required && !formData[f.field_key])
      .map(f => f.field_label);
    
    if (missingFields.length > 0) {
      setError(`Заполните: ${missingFields.join(', ')}`);
      return false;
    }
    return true;
  };

  // Handle form submit
  const handleFormSubmit = () => {
    if (!validateForm()) return;
    handleRegister();
  };

  // Perform cancel registration
  const performCancelRegistration = useCallback(async () => {
    setIsCancelling(true);
    setError(null);
    
    try {
      const initData = getInitData();
      
      const response = await fetch(`/api/telegram/webapp/events/${eventId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
        },
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel registration');
      }
      
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setIsRegistered(false);
      setPaymentStatus(null);
      setViewState('event');
    } catch (err: any) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
      setError(err.message || 'Failed to cancel registration');
    } finally {
      setIsCancelling(false);
    }
  }, [eventId]);

  // Handle cancel registration with confirmation
  const handleCancelRegistration = useCallback(async () => {
    if (!event) return;
    
    // Show confirmation
    const tg = window.Telegram?.WebApp;
    if (tg?.showConfirm) {
      tg.showConfirm('Отменить регистрацию на мероприятие?', async (confirmed) => {
        if (!confirmed) return;
        await performCancelRegistration();
      });
    } else {
      if (!confirm('Отменить регистрацию на мероприятие?')) return;
      await performCancelRegistration();
    }
  }, [event, performCancelRegistration]);

  // Currency symbol
  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = { RUB: '₽', USD: '$', EUR: '€', KZT: '₸' };
    return symbols[currency] || currency;
  };

  // Render loading
  if (viewState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Render error
  if (viewState === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Ошибка</h1>
        <p className="text-gray-600 text-center">{error || 'Не удалось загрузить событие'}</p>
      </div>
    );
  }

  // Render success
  if (viewState === 'success') {
    const isPaid = paymentStatus === 'paid';
    // Use MiniApp internal URL for seamless experience
    const eventsCalendarUrl = event?.org_id 
      ? `/tg-app/orgs/${event.org_id}/events`
      : null;
    
    return (
      <div className="min-h-screen flex flex-col bg-white">
        {/* Header with checkmark */}
        <div className="flex-shrink-0 bg-green-500 text-white p-8 text-center">
          <CheckCircle2 className="w-20 h-20 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Вы зарегистрированы!</h1>
          <p className="opacity-90">{event?.title}</p>
        </div>
        
        {/* Event details */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-gray-700">
              <Calendar className="w-5 h-5 text-gray-400" />
              <span>{event?.event_date && formatDate(event.event_date)}</span>
            </div>
            
            <div className="flex items-center gap-3 text-gray-700">
              <Clock className="w-5 h-5 text-gray-400" />
              <span>{formatTime(event?.start_time || '')} — {formatTime(event?.end_time || '')}</span>
            </div>
            
            {/* Location/Online link - show if paid or free event */}
            {(!event?.requires_payment || isPaid) && event?.location_info && (
              <>
                {event?.event_type === 'online' ? (
                  <div className="flex items-start gap-3 text-gray-700">
                    <ExternalLink className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium">Ссылка на трансляцию:</span>
                      <a 
                        href={event.location_info.startsWith('http') ? event.location_info : `https://${event.location_info}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="block text-blue-500 mt-1"
                      >
                        Перейти к трансляции →
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 text-gray-700">
                    <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span>{event.location_info}</span>
                      {event.map_link && (
                        <a 
                          href={event.map_link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="block text-blue-500 mt-1"
                        >
                          Открыть на карте →
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          
          {/* QR Code Ticket */}
          {qrToken && event?.enable_qr_checkin !== false && (
            <div className="mt-6 bg-gray-50 p-6 rounded-xl text-center">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Ваш электронный билет</h3>
              <div className="bg-white p-3 rounded-xl inline-block shadow-sm">
                <img
                  src={`https://quickchart.io/qr?text=${encodeURIComponent(
                    `${window.location.origin}/checkin?token=${qrToken}`
                  )}&size=300&margin=1&format=svg`}
                  alt="QR код для check-in"
                  className="w-48 h-48"
                />
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Покажите этот QR-код на входе
              </p>
            </div>
          )}
          
          {/* Add to Calendar buttons */}
          {event && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                  // Open in external browser for better compatibility
                  const icsUrl = `${window.location.origin}/api/events/${event.id}/ics`;
                  window.Telegram?.WebApp?.openLink?.(icsUrl) || window.open(icsUrl, '_blank');
                }}
                className="flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm active:bg-gray-200"
              >
                <Download className="w-4 h-4" />
                iCal
              </button>
              <button
                onClick={() => {
                  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                  const dateStr = event.event_date.split('T')[0]
                  const startTimeStr = event.start_time?.substring(0, 5) || '10:00'
                  const endTimeStr = event.end_time?.substring(0, 5) || '12:00'
                  const startDate = new Date(`${dateStr}T${startTimeStr}:00+03:00`)
                  const endDate = new Date(`${dateStr}T${endTimeStr}:00+03:00`)
                  const formatGoogleDate = (date: Date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
                  const googleDates = `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`
                  
                  let description = event.description || ''
                  if (event.event_type === 'online' && event.location_info) {
                    description += `\n\nСсылка: ${event.location_info}`
                  }
                  
                  const location = event.event_type === 'online' ? (event.location_info || 'Online') : (event.location_info || '')
                  const params = new URLSearchParams({
                    action: 'TEMPLATE',
                    text: event.title,
                    dates: googleDates,
                    details: description,
                    location: location
                  })
                  
                  const googleCalendarUrl = `https://calendar.google.com/calendar/render?${params.toString()}`
                  // Always open in external browser
                  window.Telegram?.WebApp?.openLink?.(googleCalendarUrl) || window.open(googleCalendarUrl, '_blank');
                }}
                className="flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm active:bg-gray-200"
              >
                <Calendar className="w-4 h-4" />
                Google
              </button>
            </div>
          )}
          
          {/* Payment section for paid events */}
          {event?.requires_payment && (
            <div className="mt-6">
              {isPaid ? (
                // Payment confirmed
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center gap-2 text-green-700 font-medium">
                    <CheckCircle2 className="w-5 h-5" />
                    Оплата подтверждена
                  </div>
                </div>
              ) : (
                // Payment pending
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-center gap-2 text-amber-700 font-medium mb-2">
                    <AlertCircle className="w-5 h-5" />
                    Ожидает оплаты
                  </div>
                  
                  {event.default_price && (
                    <p className="text-lg font-semibold text-gray-900 mb-3">
                      К оплате: {event.default_price.toLocaleString('ru-RU')} {getCurrencySymbol(event.currency || 'RUB')}
                    </p>
                  )}
                  
                  {event.payment_instructions && (
                    <p className="text-sm text-gray-600 mb-4 whitespace-pre-wrap">
                      {event.payment_instructions}
                    </p>
                  )}
                  
                  {event.payment_link && (
                    <>
                      <a
                        href={event.payment_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-amber-500 text-white rounded-xl font-semibold"
                      >
                        💳 Перейти к оплате
                      </a>
                      <p className="text-xs text-gray-500 text-center mt-3">
                        Если вы уже оплатили, дождитесь учёта оплаты организатором
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Footer with links */}
        <div className="flex-shrink-0 p-4 border-t border-gray-100">
          {eventsCalendarUrl && (
            <button
              onClick={() => {
                window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                window.location.href = eventsCalendarUrl;
              }}
              className="block w-full py-2 text-center text-blue-500 text-sm mb-2"
            >
              📅 Все события
            </button>
          )}
          <button
            onClick={() => {
              window.Telegram?.WebApp?.close();
            }}
            className="w-full py-3 text-center text-gray-500 font-medium"
          >
            Закрыть
          </button>
          
          {/* Cancel registration button - subtle at the bottom */}
          <button
            onClick={handleCancelRegistration}
            disabled={isCancelling}
            className="w-full mt-4 py-2 text-center text-gray-400 text-xs hover:text-red-500 transition-colors"
          >
            {isCancelling ? 'Отмена...' : 'Отменить регистрацию'}
          </button>
        </div>
      </div>
    );
  }

  // Render payment step
  if (viewState === 'payment') {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <div className="flex-shrink-0 p-6 border-b border-gray-100">
          <h1 className="text-xl font-semibold text-gray-900">Оплата</h1>
          <p className="text-gray-600 mt-1">{event?.title}</p>
        </div>
        
        <div className="flex-1 p-6">
          {/* Price */}
          {event?.default_price && (
            <div className="text-center mb-6">
              <p className="text-3xl font-bold text-gray-900">
                {event.default_price.toLocaleString('ru-RU')} {getCurrencySymbol(event.currency || 'RUB')}
              </p>
            </div>
          )}
          
          {/* Payment link */}
          {event?.payment_link && (
            <a
              href={event.payment_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-4 bg-green-500 text-white rounded-xl font-semibold text-lg"
            >
              💳 Перейти к оплате
            </a>
          )}
          
          {/* Payment instructions */}
          {event?.payment_instructions && (
            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {event.payment_instructions}
              </p>
            </div>
          )}
        </div>
        
        <div className="flex-shrink-0 p-4 border-t border-gray-100">
          <button
            onClick={() => setViewState('success')}
            className="w-full py-3 text-gray-600 font-medium"
          >
            Оплачу позже
          </button>
        </div>
      </div>
    );
  }

  // Render form
  if (viewState === 'form') {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-gray-100">
          <button
            onClick={() => setViewState('event')}
            className="text-blue-600 font-medium mb-2"
          >
            ← Назад
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Регистрация</h1>
        </div>
        
        {/* Form */}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="space-y-4">
            {fields.map(field => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.field_label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                
                {field.field_type === 'textarea' ? (
                  <textarea
                    value={formData[field.field_key] || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, [field.field_key]: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={3}
                    placeholder={field.field_label}
                  />
                ) : field.field_type === 'select' ? (
                  <select
                    value={formData[field.field_key] || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, [field.field_key]: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    <option value="">Выберите...</option>
                    {field.options?.options?.map((opt, i) => (
                      <option key={i} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'}
                    value={formData[field.field_key] || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, [field.field_key]: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={field.field_label}
                  />
                )}
              </div>
            ))}
          </div>
          
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}
        </div>
        
        {/* Submit button */}
        <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-white">
          <button
            onClick={handleFormSubmit}
            disabled={isSubmitting}
            className="w-full py-4 bg-blue-500 text-white rounded-xl font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Регистрация...
              </>
            ) : (
              'Зарегистрироваться'
            )}
          </button>
        </div>
      </div>
    );
  }

  // Render event details (main view)
  return (
    <>
      {/* Telegram WebApp Script - use afterInteractive to avoid hydration mismatch */}
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      
      <div className="min-h-screen flex flex-col bg-white">
        {/* Cover image */}
        {event?.cover_image_url && (
          <div className="relative w-full aspect-[16/9] flex-shrink-0 overflow-hidden">
            <img
              src={event.cover_image_url}
              alt={event.title}
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            
            {/* Event type badge */}
            <div className="absolute top-4 left-4">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                event.event_type === 'online' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-orange-500 text-white'
              }`}>
                {event.event_type === 'online' ? '🌐 Онлайн' : '📍 Офлайн'}
              </span>
            </div>
            
            {/* Title on image */}
            <div className="absolute bottom-4 left-4 right-4">
              <h1 className="text-2xl font-bold text-white drop-shadow-lg">
                {event.title}
              </h1>
            </div>
          </div>
        )}
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* If no cover, show title here */}
          {!event?.cover_image_url && (
            <div className="p-4 pb-0">
              <h1 className="text-2xl font-bold text-gray-900">{event?.title}</h1>
            </div>
          )}
          
          {/* Quick info */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3 text-gray-700">
              <Calendar className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <span className="font-medium">{event?.event_date && formatDate(event.event_date)}</span>
            </div>
            
            <div className="flex items-center gap-3 text-gray-700">
              <Clock className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <span>{formatTime(event?.start_time || '')} — {formatTime(event?.end_time || '')}</span>
            </div>
            
            {event?.location_info && (
              <div className="flex items-start gap-3 text-gray-700">
                <MapPin className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span>{event.location_info}</span>
                  {event.map_link && (
                    <a 
                      href={event.map_link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="ml-2 text-blue-500 text-sm"
                    >
                      На карте →
                    </a>
                  )}
                </div>
              </div>
            )}
            
            {event?.capacity && (
              <div className="flex items-center gap-3 text-gray-700">
                <Users className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <span>
                  {event.registered_count || 0} / {event.capacity} мест
                </span>
              </div>
            )}
            
            {/* Price */}
            {event?.requires_payment && event?.default_price && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg font-medium">
                💰 {event.default_price.toLocaleString('ru-RU')} {getCurrencySymbol(event.currency || 'RUB')}
              </div>
            )}
          </div>
          
          {/* Description with markdown support */}
          {event?.description && (
            <div className="px-4 pb-4">
              <div className="border-t border-gray-100 pt-4">
                <div className="prose prose-sm max-w-none text-gray-700 
                  prose-p:my-2 prose-p:leading-relaxed
                  prose-strong:font-semibold prose-strong:text-gray-900
                  prose-em:italic
                  prose-a:text-blue-500 prose-a:no-underline hover:prose-a:underline
                  prose-ul:my-2 prose-ul:pl-4 prose-li:my-0.5
                  prose-ol:my-2 prose-ol:pl-4
                  prose-headings:font-semibold prose-headings:text-gray-900
                  prose-h1:text-lg prose-h2:text-base prose-h3:text-base
                  prose-blockquote:border-l-2 prose-blockquote:border-gray-300 prose-blockquote:pl-3 prose-blockquote:italic prose-blockquote:text-gray-600
                  prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:text-gray-800
                  prose-pre:bg-gray-100 prose-pre:p-3 prose-pre:rounded-lg prose-pre:overflow-x-auto
                ">
                  <ReactMarkdown>
                    {event.description}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Fixed CTA button */}
        <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-white safe-area-bottom">
          {isRegistered ? (
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-green-600 font-medium mb-2">
                <CheckCircle2 className="w-5 h-5" />
                Вы зарегистрированы
              </div>
              {event?.requires_payment && event?.payment_link && paymentStatus !== 'paid' && (
                <a
                  href={event.payment_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 text-sm"
                >
                  Перейти к оплате →
                </a>
              )}
              {/* Cancel registration - subtle link */}
              <button
                onClick={handleCancelRegistration}
                disabled={isCancelling}
                className="mt-3 text-gray-400 text-xs hover:text-red-500 transition-colors"
              >
                {isCancelling ? 'Отмена...' : 'Отменить регистрацию'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (fields.length > 0) {
                  setViewState('form');
                } else {
                  handleRegister();
                }
              }}
              disabled={isSubmitting || event?.status !== 'published'}
              className="w-full py-4 bg-blue-500 text-white rounded-xl font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Регистрация...
                </>
              ) : event?.requires_payment ? (
                `Зарегистрироваться • ${event.default_price?.toLocaleString('ru-RU')} ${getCurrencySymbol(event.currency || 'RUB')}`
              ) : (
                'Зарегистрироваться'
              )}
            </button>
          )}
          
          {error && (
            <p className="mt-2 text-center text-sm text-red-500">{error}</p>
          )}
        </div>
      </div>
    </>
  );
}

