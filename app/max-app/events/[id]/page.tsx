'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Script from 'next/script';
import { renderTelegramContent } from '@/lib/utils/telegramMarkdown';
import { Calendar, MapPin, Users, Clock, ExternalLink, CheckCircle2, Loader2, AlertCircle, Download } from 'lucide-react';

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

/**
 * MAX WebApp for Event Registration.
 * Mirrors the Telegram MiniApp but uses MAX's WebApp SDK.
 */
export default function MaxEventPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [viewState, setViewState] = useState<ViewState>('loading');
  const [event, setEvent] = useState<Event | null>(null);
  const [fields, setFields] = useState<RegistrationField[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isRegistered, setIsRegistered] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [hasOrboPayments, setHasOrboPayments] = useState(false);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentSettings, setConsentSettings] = useState<{
    collect_pd_consent: boolean;
    collect_announcements_consent: boolean;
    has_privacy_policy: boolean;
    privacy_policy_url: string | null;
  } | null>(null);
  const [pdConsentChecked, setPdConsentChecked] = useState(false);
  const [announcementsConsentChecked, setAnnouncementsConsentChecked] = useState(false);
  const [maxUser, setMaxUser] = useState<{ id: number; first_name: string; last_name?: string; username?: string } | null>(null);
  const [webAppReady, setWebAppReady] = useState(false);

  // Helper: extract initData from URL hash (#WebAppData=...) — MAX passes it here
  const getInitDataFromHash = (): string => {
    try {
      const hash = window.location.hash;
      if (!hash) return '';
      const hashParams = new URLSearchParams(hash.slice(1));
      return hashParams.get('WebAppData') || '';
    } catch { return ''; }
  };

  // Helper: get initData — URL hash → SDK → sessionStorage
  const getInitData = (): string => {
    const fromHash = getInitDataFromHash();
    if (fromHash) {
      try { sessionStorage.setItem('max_init_data', fromHash); } catch {}
      return fromHash;
    }
    const wa = (window as any).WebApp;
    const sdkData = wa?.initData;
    if (sdkData && sdkData.length > 0) {
      try { sessionStorage.setItem('max_init_data', sdkData); } catch {}
      return sdkData;
    }
    try { return sessionStorage.getItem('max_init_data') || ''; } catch { return ''; }
  };

  // Initialize MAX WebApp
  useEffect(() => {
    const initWebApp = () => {
      // Primary: read from URL hash (MAX delivers everything here)
      const initDataHash = getInitDataFromHash();
      if (initDataHash) {
        try { sessionStorage.setItem('max_init_data', initDataHash); } catch {}
        // Extract user from initData hash
        try {
          const innerParams = new URLSearchParams(initDataHash);
          const userStr = innerParams.get('user');
          if (userStr) {
            const user = JSON.parse(userStr);
            setMaxUser(user);
            try { sessionStorage.setItem('max_user', userStr); } catch {}
          }
        } catch {}
        setWebAppReady(true);
        return true;
      }

      // Fallback: SDK (window.WebApp)
      const wa = (window as any).WebApp;
      if (!wa) return false;
      wa.ready?.();
      wa.expand?.();

      if (wa.themeParams?.bg_color) {
        document.body.style.backgroundColor = wa.themeParams.bg_color;
      }
      if (wa.initData && wa.initData.length > 0) {
        try { sessionStorage.setItem('max_init_data', wa.initData); } catch {}
      }
      if (wa.initDataUnsafe?.user) {
        setMaxUser(wa.initDataUnsafe.user);
        try { sessionStorage.setItem('max_user', JSON.stringify(wa.initDataUnsafe.user)); } catch {}
      } else {
        try {
          const stored = sessionStorage.getItem('max_user');
          if (stored) setMaxUser(JSON.parse(stored));
        } catch {}
      }
      setWebAppReady(true);
      return true;
    };

    if (!initWebApp()) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (initWebApp() || attempts >= 20) {
          clearInterval(interval);
          if (attempts >= 20) {
            // Last resort: sessionStorage
            try {
              const stored = sessionStorage.getItem('max_user');
              if (stored) setMaxUser(JSON.parse(stored));
            } catch {}
            setWebAppReady(true);
          }
        }
      }, 100);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load event data
  useEffect(() => {
    if (!eventId || !webAppReady) return;

    const loadEvent = async () => {
      try {
        const initData = getInitData();
        const response = await fetch(`/api/max/webapp/events/${eventId}`, {
          headers: { 'X-Max-Init-Data': initData },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load event');

        setEvent(data.event);
        setFields(data.fields || []);
        if (data.consentSettings) setConsentSettings(data.consentSettings);
        setIsRegistered(data.isRegistered || false);
        setPaymentStatus(data.paymentStatus || null);
        setQrToken(data.userRegistration?.qr_token || null);
        setHasOrboPayments(data.hasOrboPayments || false);
        setRegistrationId(data.userRegistration?.id || null);

        let user = (window as any).WebApp?.initDataUnsafe?.user;
        if (!user) {
          try {
            const stored = sessionStorage.getItem('max_user');
            if (stored) user = JSON.parse(stored);
          } catch {}
        }
        if (user) {
          setMaxUser(user);
          const prefill: Record<string, string> = {};
          const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
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

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });

  const formatTime = (timeStr: string) => timeStr?.substring(0, 5) || '';

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = { RUB: '₽', USD: '$', EUR: '€', KZT: '₸' };
    return symbols[currency] || currency;
  };

  // Handle registration
  const handleRegister = useCallback(async () => {
    if (!event) return;

    if (consentSettings?.collect_pd_consent && !pdConsentChecked) {
      setError('Необходимо дать согласие на обработку персональных данных');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const initData = getInitData();
      const response = await fetch(`/api/max/webapp/events/${eventId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Max-Init-Data': initData },
        body: JSON.stringify({
          registration_data: formData,
          pd_consent: consentSettings?.collect_pd_consent ? pdConsentChecked : undefined,
          announcements_consent: consentSettings?.collect_announcements_consent ? announcementsConsentChecked : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Registration failed');

      setIsRegistered(true);
      if (data.registration?.id) setRegistrationId(data.registration.id);
      if (data.registration?.qr_token) setQrToken(data.registration.qr_token);
      if (data.registration?.payment_status) setPaymentStatus(data.registration.payment_status);

      if (event.requires_payment && (hasOrboPayments || event.payment_link)) {
        setViewState('payment');
      } else {
        setViewState('success');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [event, eventId, formData, consentSettings, pdConsentChecked, announcementsConsentChecked]);

  const validateForm = (): boolean => {
    const missing = fields
      .filter(f => f.required && !formData[f.field_key])
      .map(f => f.field_label);
    if (missing.length > 0) {
      setError(`Заполните: ${missing.join(', ')}`);
      return false;
    }
    return true;
  };

  const handleFormSubmit = () => {
    if (!validateForm()) return;
    handleRegister();
  };

  const performCancelRegistration = useCallback(async () => {
    setIsCancelling(true);
    setError(null);
    try {
      const initData = getInitData();
      const response = await fetch(`/api/max/webapp/events/${eventId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Max-Init-Data': initData },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to cancel registration');
      setIsRegistered(false);
      setPaymentStatus(null);
      setViewState('event');
    } catch (err: any) {
      setError(err.message || 'Failed to cancel registration');
    } finally {
      setIsCancelling(false);
    }
  }, [eventId]);

  const handleCancelRegistration = useCallback(async () => {
    if (!event) return;
    if (!confirm('Отменить регистрацию на мероприятие?')) return;
    await performCancelRegistration();
  }, [event, performCancelRegistration]);

  // ─── Render states ────────────────────────────────────────

  if (viewState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (viewState === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Ошибка</h1>
        <p className="text-gray-600 text-center">{error || 'Не удалось загрузить событие'}</p>
      </div>
    );
  }

  if (viewState === 'success') {
    const isPaid = paymentStatus === 'paid';
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <div className="flex-shrink-0 bg-green-500 text-white p-8 text-center">
          <CheckCircle2 className="w-20 h-20 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Вы зарегистрированы!</h1>
          <p className="opacity-90">{event?.title}</p>
        </div>

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
            {(!event?.requires_payment || isPaid) && event?.location_info && (
              event?.event_type === 'online' ? (
                <div className="flex items-start gap-3 text-gray-700">
                  <ExternalLink className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium">Ссылка на трансляцию:</span>
                    <a href={event.location_info.startsWith('http') ? event.location_info : `https://${event.location_info}`}
                      target="_blank" rel="noopener noreferrer" className="block text-blue-500 mt-1">
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
                      <a href={event.map_link} target="_blank" rel="noopener noreferrer" className="block text-blue-500 mt-1">
                        Открыть на карте →
                      </a>
                    )}
                  </div>
                </div>
              )
            )}
          </div>

          {/* Payment section — shown BEFORE QR so it's the first thing visible on mobile */}
          {event?.requires_payment && (
            <div className="mt-6">
              {isPaid ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center gap-2 text-green-700 font-medium">
                    <CheckCircle2 className="w-5 h-5" />
                    Оплата подтверждена
                  </div>
                </div>
              ) : (
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
                    <p className="text-sm text-gray-600 mb-4 whitespace-pre-wrap">{event.payment_instructions}</p>
                  )}
                  {hasOrboPayments && registrationId ? (
                    <a
                      href={`/p/${event.org_id}/pay?type=event&registrationId=${registrationId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 bg-green-600 text-white rounded-xl font-semibold"
                    >
                      💳 Оплатить
                    </a>
                  ) : event.payment_link ? (
                    <>
                      <a href={event.payment_link} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-amber-500 text-white rounded-xl font-semibold">
                        💳 Перейти к оплате
                      </a>
                      <p className="text-xs text-gray-500 text-center mt-3">
                        Если вы уже оплатили, дождитесь учёта оплаты организатором
                      </p>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* QR Code Ticket — shown after payment section */}
          {qrToken && event?.enable_qr_checkin !== false &&
            (!(event?.requires_payment || event?.is_paid) || paymentStatus === 'paid') && (
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
              <p className="text-xs text-gray-500 mt-3">Покажите этот QR-код на входе</p>
            </div>
          )}

          {event && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const icsUrl = `${window.location.origin}/api/events/${event.id}/ics`;
                  window.open(icsUrl, '_blank');
                }}
                className="flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm active:bg-gray-200"
              >
                <Download className="w-4 h-4" />
                iCal
              </button>
              <button
                onClick={() => {
                  const dateStr = event.event_date.split('T')[0];
                  const startTimeStr = event.start_time?.substring(0, 5) || '10:00';
                  const endTimeStr = event.end_time?.substring(0, 5) || '12:00';
                  const startDate = new Date(`${dateStr}T${startTimeStr}:00+03:00`);
                  const endDate = new Date(`${dateStr}T${endTimeStr}:00+03:00`);
                  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                  const gp = new URLSearchParams({
                    action: 'TEMPLATE', text: event.title,
                    dates: `${fmt(startDate)}/${fmt(endDate)}`,
                    details: event.description || '',
                    location: event.event_type === 'online' ? (event.location_info || 'Online') : (event.location_info || ''),
                  });
                  window.open(`https://calendar.google.com/calendar/render?${gp.toString()}`, '_blank');
                }}
                className="flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm active:bg-gray-200"
              >
                <Calendar className="w-4 h-4" />
                Google
              </button>
            </div>
          )}

        </div>

        <div className="flex-shrink-0 p-4 border-t border-gray-100">
          <button onClick={() => (window as any).WebApp?.close?.()}
            className="w-full py-3 text-center text-gray-500 font-medium">
            Закрыть
          </button>
          <button onClick={handleCancelRegistration} disabled={isCancelling}
            className="w-full mt-4 py-2 text-center text-gray-400 text-xs hover:text-red-500 transition-colors">
            {isCancelling ? 'Отмена...' : 'Отменить регистрацию'}
          </button>
        </div>
      </div>
    );
  }

  if (viewState === 'payment') {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <div className="flex-shrink-0 p-6 border-b border-gray-100">
          <h1 className="text-xl font-semibold text-gray-900">Оплата</h1>
          <p className="text-gray-600 mt-1">{event?.title}</p>
        </div>
        <div className="flex-1 p-6">
          {event?.default_price && (
            <div className="text-center mb-6">
              <p className="text-3xl font-bold text-gray-900">
                {event.default_price.toLocaleString('ru-RU')} {getCurrencySymbol(event.currency || 'RUB')}
              </p>
            </div>
          )}
          {hasOrboPayments && registrationId ? (
            <a
              href={`/p/${event?.org_id}/pay?type=event&registrationId=${registrationId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-4 bg-green-600 text-white rounded-xl font-semibold text-lg"
            >
              💳 Оплатить
            </a>
          ) : event?.payment_link ? (
            <a href={event.payment_link} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-4 bg-green-500 text-white rounded-xl font-semibold text-lg">
              Перейти к оплате
            </a>
          ) : null}
          {!hasOrboPayments && event?.payment_instructions && (
            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{event.payment_instructions}</p>
            </div>
          )}
        </div>
        <div className="flex-shrink-0 p-4 border-t border-gray-100">
          <button onClick={() => setViewState('success')} className="w-full py-3 text-gray-600 font-medium">
            Оплачу позже
          </button>
        </div>
      </div>
    );
  }

  if (viewState === 'form') {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <div className="flex-shrink-0 p-4 border-b border-gray-100">
          <button onClick={() => setViewState('event')} className="text-blue-600 font-medium mb-2">
            ← Назад
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Регистрация</h1>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          <div className="space-y-4">
            {fields.map(field => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.field_label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {field.field_type === 'textarea' ? (
                  <textarea value={formData[field.field_key] || ''}
                    onChange={e => setFormData(prev => ({ ...prev, [field.field_key]: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={3} placeholder={field.field_label} />
                ) : field.field_type === 'select' ? (
                  <select value={formData[field.field_key] || ''}
                    onChange={e => setFormData(prev => ({ ...prev, [field.field_key]: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
                    <option value="">Выберите...</option>
                    {field.options?.options?.map((opt, i) => (
                      <option key={i} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input type={field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'}
                    value={formData[field.field_key] || ''}
                    onChange={e => setFormData(prev => ({ ...prev, [field.field_key]: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={field.field_label} />
                )}
              </div>
            ))}

            {/* Consent checkboxes */}
            {consentSettings?.collect_pd_consent && (
              <label className="flex items-start gap-3 pt-2">
                <input type="checkbox" checked={pdConsentChecked}
                  onChange={e => setPdConsentChecked(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 accent-blue-600 flex-shrink-0" />
                <span className="text-xs text-gray-600 leading-relaxed">
                  Даю согласие на обработку персональных данных для регистрации, участия
                  в мероприятии, получения организационных уведомлений в соответствии
                  с{' '}
                  {consentSettings.privacy_policy_url ? (
                    <a href={consentSettings.privacy_policy_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                      Политикой обработки ПД
                    </a>
                  ) : 'Политикой обработки ПД'}.
                  <span className="text-red-500 ml-1">*</span>
                </span>
              </label>
            )}
            {consentSettings?.collect_announcements_consent && (
              <label className="flex items-start gap-3 pt-1">
                <input type="checkbox" checked={announcementsConsentChecked}
                  onChange={e => setAnnouncementsConsentChecked(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 accent-blue-600 flex-shrink-0" />
                <span className="text-xs text-gray-600 leading-relaxed">
                  Согласен получать по e-mail, в Max или Telegram анонсы будущих
                  мероприятий, новости и предложения активностей.
                </span>
              </label>
            )}
          </div>
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
          )}
        </div>

        <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-white">
          <button onClick={handleFormSubmit} disabled={isSubmitting || (consentSettings?.collect_pd_consent && !pdConsentChecked)}
            className="w-full py-4 bg-blue-500 text-white rounded-xl font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {isSubmitting ? (<><Loader2 className="w-5 h-5 animate-spin" />Регистрация...</>) : 'Зарегистрироваться'}
          </button>
        </div>
      </div>
    );
  }

  // ─── Main event details view ──────────────────────────────

  return (
    <>
      <Script src="https://dev.max.ru/max-web-app.js" strategy="afterInteractive" />

      <div className="min-h-screen flex flex-col bg-white">
        {event?.cover_image_url && (
          <div className="relative w-full aspect-[16/9] flex-shrink-0 overflow-hidden">
            <img src={event.cover_image_url} alt={event.title}
              className="absolute inset-0 w-full h-full object-cover" loading="eager" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute top-4 left-4">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                event.event_type === 'online' ? 'bg-blue-500 text-white' : 'bg-orange-500 text-white'
              }`}>
                {event.event_type === 'online' ? 'Онлайн' : 'Офлайн'}
              </span>
            </div>
            <div className="absolute bottom-4 left-4 right-4">
              <h1 className="text-2xl font-bold text-white drop-shadow-lg">{event.title}</h1>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {!event?.cover_image_url && (
            <div className="p-4 pb-0">
              <h1 className="text-2xl font-bold text-gray-900">{event?.title}</h1>
            </div>
          )}

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
                    <a href={event.map_link} target="_blank" rel="noopener noreferrer"
                      className="ml-2 text-blue-500 text-sm">На карте →</a>
                  )}
                </div>
              </div>
            )}
            {event?.capacity && (
              <div className="flex items-center gap-3 text-gray-700">
                <Users className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <span>{event.registered_count || 0} / {event.capacity} мест</span>
              </div>
            )}
            {event?.requires_payment && event?.default_price && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg font-medium">
                {event.default_price.toLocaleString('ru-RU')} {getCurrencySymbol(event.currency || 'RUB')}
              </div>
            )}
          </div>

          {event?.description && (
            <div className="px-4 pb-4">
              <div className="border-t border-gray-100 pt-4">
                <div className="prose prose-sm max-w-none text-gray-700 prose-p:my-2 prose-p:leading-relaxed prose-strong:font-semibold prose-a:text-blue-500">
                  {renderTelegramContent(event.description)}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-white safe-area-bottom">
          {isRegistered ? (
            <div className="text-center">
              {event?.requires_payment && paymentStatus !== 'paid' ? (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg mb-2">
                  <div className="text-sm text-orange-800 mb-2">
                    Вы ввели данные для регистрации. Для подтверждения участия необходимо оплатить.
                  </div>
                  {hasOrboPayments && registrationId ? (
                    <a href={`/p/${event.org_id}/pay?type=event&registrationId=${registrationId}`} target="_blank" rel="noopener noreferrer"
                      className="inline-block py-2 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg text-sm">
                      Оплатить
                    </a>
                  ) : event?.payment_link ? (
                    <a href={event.payment_link} target="_blank" rel="noopener noreferrer"
                      className="inline-block py-2 px-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg text-sm">
                      Перейти к оплате
                    </a>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-green-600 font-medium mb-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Вы зарегистрированы
                </div>
              )}
              <button onClick={handleCancelRegistration} disabled={isCancelling}
                className="mt-3 text-gray-400 text-xs hover:text-red-500 transition-colors">
                {isCancelling ? 'Отмена...' : 'Отменить регистрацию'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => { fields.length > 0 ? setViewState('form') : handleRegister(); }}
              disabled={isSubmitting || event?.status !== 'published'}
              className="w-full py-4 bg-blue-500 text-white rounded-xl font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {isSubmitting ? (
                <><Loader2 className="w-5 h-5 animate-spin" />Регистрация...</>
              ) : event?.requires_payment ? (
                `Зарегистрироваться • ${event.default_price?.toLocaleString('ru-RU')} ${getCurrencySymbol(event.currency || 'RUB')}`
              ) : 'Зарегистрироваться'}
            </button>
          )}
          {error && <p className="mt-2 text-center text-sm text-red-500">{error}</p>}
        </div>
      </div>
    </>
  );
}
