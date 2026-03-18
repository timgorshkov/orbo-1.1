'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Users, CheckCircle2, Loader2, ChevronRight, AlertCircle, ArrowLeft } from 'lucide-react';

interface FormField {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'email' | 'phone';
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  prefill?: string;
  max_length?: number;
}

interface Landing {
  title?: string;
  subtitle?: string;
  description?: string;
  cover_image_url?: string;
  background_color?: string;
  text_color?: string;
  accent_color?: string;
  show_member_count?: boolean;
  show_org_logo?: boolean;
  benefits?: { icon?: string; text: string }[];
  cta_button_text?: string;
}

interface SuccessPage {
  title?: string;
  message?: string;
  show_status_link?: boolean;
  additional_buttons?: { text: string; url: string }[];
}

interface ExistingApplication {
  id: string;
  form_data: Record<string, string>;
  created_at: string;
  stage_name: string;
  is_approved: boolean;
  is_rejected: boolean;
  is_pending: boolean;
  telegram_group?: { title: string } | null;
}

interface FormData {
  form_id: string;
  org_id: string;
  org_name: string;
  org_logo?: string;
  pipeline_type: string;
  landing: Landing;
  form_schema: FormField[];
  success_page: SuccessPage;
  member_count?: number;
  source_id?: string;
  existing_application?: ExistingApplication;
  telegram_group?: { title: string } | null;
}

type PageState = 'loading' | 'landing' | 'status' | 'form' | 'submitting' | 'success' | 'error';

/**
 * MAX WebApp — Application Form (Заявка).
 * Uses same public API as Telegram version, reads user from URL hash.
 */
export default function MaxApplyPage() {
  const params = useParams();
  const formId = params.formId as string;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [formData, setFormData] = useState<FormData | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [maxUser, setMaxUser] = useState<{ id: number; first_name: string; last_name?: string; username?: string } | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [webAppReady, setWebAppReady] = useState(false);

  // Read MAX user from URL hash or sessionStorage
  useEffect(() => {
    const initWebApp = () => {
      // Primary: URL hash (#WebAppData=...)
      try {
        const hash = window.location.hash;
        if (hash) {
          const hashParams = new URLSearchParams(hash.slice(1));
          const webAppData = hashParams.get('WebAppData');
          if (webAppData) {
            try { sessionStorage.setItem('max_init_data', webAppData); } catch {}
            const innerParams = new URLSearchParams(webAppData);
            const userStr = innerParams.get('user');
            if (userStr) {
              const user = JSON.parse(userStr);
              setMaxUser(user);
              try { sessionStorage.setItem('max_user', userStr); } catch {}
            }
            setWebAppReady(true);
            return;
          }
        }
      } catch {}

      // Fallback: sessionStorage (navigated from /max-app)
      try {
        const userStr = sessionStorage.getItem('max_user');
        if (userStr) {
          setMaxUser(JSON.parse(userStr));
          setWebAppReady(true);
          return;
        }
      } catch {}

      // Fallback: SDK
      const wa = (window as any).WebApp;
      if (wa?.initDataUnsafe?.user) {
        setMaxUser(wa.initDataUnsafe.user);
        setWebAppReady(true);
        return;
      }

      // No user — still load form (guest mode won't show existing app)
      setWebAppReady(true);
    };

    initWebApp();

    // Retry once if MAX SDK loads async
    const timer = setTimeout(initWebApp, 300);
    return () => clearTimeout(timer);
  }, []);

  // Fetch form data
  useEffect(() => {
    if (!formId || !webAppReady) return;

    async function fetchForm() {
      try {
        const p = new URLSearchParams();
        if (maxUser?.id) p.set('tg_user_id', String(maxUser.id));

        const url = `/api/applications/forms/${formId}/public${p.toString() ? `?${p}` : ''}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
          setError(data.error);
          setPageState('error');
          return;
        }

        setFormData(data);

        if (data.existing_application) {
          const app = data.existing_application;
          if (app.form_data && typeof app.form_data === 'object') {
            setFormValues(app.form_data);
          }
          setPageState('status');
          setApplicationId(app.id);
        } else {
          setPageState('landing');

          // Prefill from MAX user
          if (data.form_schema && maxUser) {
            const prefilled: Record<string, string> = {};
            data.form_schema.forEach((field: FormField) => {
              if (field.prefill === 'telegram_name') {
                prefilled[field.id] = [maxUser.first_name, maxUser.last_name].filter(Boolean).join(' ');
              } else if (field.prefill === 'telegram_username') {
                prefilled[field.id] = maxUser.username || '';
              }
            });
            setFormValues(prefilled);
          }
        }
      } catch {
        setError('Не удалось загрузить форму');
        setPageState('error');
      }
    }

    fetchForm();
  }, [formId, maxUser, webAppReady]);

  const submitApplication = useCallback(async () => {
    if (!formData || !maxUser) return;

    const missingFields = (formData.form_schema || [])
      .filter(f => f.required && !formValues[f.id])
      .map(f => f.label);

    if (missingFields.length > 0) {
      setError(`Заполните обязательные поля: ${missingFields.join(', ')}`);
      return;
    }

    setError(null);
    setPageState('submitting');

    try {
      const res = await fetch(`/api/applications/forms/${formId}/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tg_user_id: maxUser.id,
          tg_user_data: {
            user_id: maxUser.id,
            username: maxUser.username,
            first_name: maxUser.first_name,
            last_name: maxUser.last_name,
          },
          form_data: formValues,
          utm_data: { utm_source: 'max_miniapp' },
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setApplicationId(data.application_id);
      setPageState('success');
    } catch (err: any) {
      setError(err.message || 'Не удалось отправить заявку');
      setPageState('form');
    }
  }, [formData, maxUser, formId, formValues]);

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (pageState === 'error' && !formData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-xl font-semibold mb-2">Ошибка</h1>
        <p className="text-gray-600">{error || 'Форма не найдена'}</p>
      </div>
    );
  }

  if (!formData) return null;

  const landing = formData.landing || {};
  const accentColor = landing.accent_color || '#4f46e5';
  const bgColor = landing.background_color || '#ffffff';
  const textColor = landing.text_color || '#1f2937';

  // ── Status page ──────────────────────────────────────────────────────────────

  if (pageState === 'status' && formData.existing_application) {
    const app = formData.existing_application;
    const dateStr = new Date(app.created_at).toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    });

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b px-4 py-4">
          <div className="flex items-center gap-3">
            {formData.org_logo && (
              <img src={formData.org_logo} alt={formData.org_name} className="w-12 h-12 rounded-xl object-cover" />
            )}
            <div>
              <h1 className="font-semibold">{formData.org_name}</h1>
              <p className="text-sm text-gray-500">{landing.title || 'Заявка'}</p>
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="bg-white rounded-2xl border overflow-hidden">
            <div className={`px-4 py-3 ${app.is_approved ? 'bg-green-50 text-green-700' : app.is_rejected ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
              <div className="flex items-center gap-2">
                {app.is_approved ? <CheckCircle2 className="w-5 h-5" /> : app.is_rejected ? <AlertCircle className="w-5 h-5" /> : <Loader2 className="w-5 h-5" />}
                <span className="font-medium">
                  {app.is_approved ? 'Заявка одобрена' : app.is_rejected ? 'Заявка отклонена' : 'Заявка на рассмотрении'}
                </span>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Подана</span>
                <span>{dateStr}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Статус</span>
                <span>{app.stage_name}</span>
              </div>
            </div>

            {app.form_data && Object.keys(app.form_data).length > 0 && formData.form_schema && (
              <div className="border-t px-4 py-3">
                <p className="text-sm text-gray-500 mb-2">Ваши данные:</p>
                <div className="space-y-2">
                  {formData.form_schema.map((field) => {
                    const value = app.form_data[field.id];
                    if (!value) return null;
                    return (
                      <div key={field.id} className="text-sm">
                        <span className="text-gray-500">{field.label}: </span>
                        <span>{value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(!app.form_data || Object.keys(app.form_data).length === 0) && formData.form_schema?.length > 0 && app.is_pending && (
              <div className="border-t px-4 py-3">
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p className="text-sm">Заполните анкету, чтобы ускорить рассмотрение заявки</p>
                </div>
              </div>
            )}
          </div>

          {app.is_pending && (
            <p className="text-center text-sm text-gray-500 mt-4">Мы рассмотрим вашу заявку и свяжемся с вами</p>
          )}

          {app.is_approved && (() => {
            const group = app.telegram_group || formData?.telegram_group;
            return (
              <div className="mt-4 p-4 bg-green-50 rounded-xl border border-green-200">
                <p className="text-green-800 font-medium mb-2">🎉 Добро пожаловать!</p>
                <p className="text-sm text-green-700">
                  {group?.title
                    ? `Ваша заявка одобрена! Теперь вы можете вступить в группу «${group.title}».`
                    : 'Ваша заявка одобрена! Теперь вы можете вступить в группу.'}
                </p>
              </div>
            );
          })()}

          {app.is_rejected && (
            <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-200">
              <p className="text-sm text-red-700">К сожалению, ваша заявка была отклонена. Если вы считаете это ошибкой, свяжитесь с администратором сообщества.</p>
            </div>
          )}

          {/* Edit form button for pending */}
          {app.is_pending && formData.form_schema?.length > 0 && (
            <button
              onClick={() => { setError(null); setPageState('form'); }}
              className="w-full mt-4 py-3 rounded-2xl font-semibold text-white"
              style={{ backgroundColor: accentColor }}
            >
              {app.form_data && Object.keys(app.form_data).length > 0 ? 'Редактировать анкету' : 'Заполнить анкету'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Landing ──────────────────────────────────────────────────────────────────

  if (pageState === 'landing') {
    return (
      <div className="min-h-screen" style={{ backgroundColor: bgColor, color: textColor }}>
        {landing.cover_image_url && (
          <div className="w-full h-48 overflow-hidden">
            <img src={landing.cover_image_url} alt={landing.title || 'Cover'} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="p-6">
          {landing.show_org_logo && formData.org_logo && (
            <div className="flex justify-center mb-4">
              <img src={formData.org_logo} alt={formData.org_name} className="w-16 h-16 rounded-xl object-cover" />
            </div>
          )}

          <h1 className="text-2xl font-bold text-center mb-2">{landing.title || formData.org_name}</h1>

          {landing.subtitle && <p className="text-center opacity-80 mb-4">{landing.subtitle}</p>}

          {landing.show_member_count && formData.member_count && (
            <div className="flex items-center justify-center gap-2 text-sm opacity-70 mb-6">
              <Users className="w-4 h-4" />
              <span>{formData.member_count.toLocaleString()} участников</span>
            </div>
          )}

          {landing.benefits && landing.benefits.length > 0 && (
            <div className="space-y-3 mb-6">
              {landing.benefits.map((benefit, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: `${accentColor}15` }}>
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: accentColor }} />
                  <span>{benefit.text}</span>
                </div>
              ))}
            </div>
          )}

          {landing.description && (
            <div className="mb-6 opacity-90">
              <p className="whitespace-pre-wrap text-sm">{landing.description}</p>
            </div>
          )}

          <button
            onClick={() => {
              if (formData.form_schema && formData.form_schema.length > 0) {
                setPageState('form');
              } else {
                submitApplication();
              }
            }}
            className="w-full py-4 rounded-2xl font-semibold text-white text-lg"
            style={{ backgroundColor: accentColor }}
          >
            {landing.cta_button_text || 'Подать заявку'}
          </button>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  if (pageState === 'form' || pageState === 'submitting') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
          <button onClick={() => { setError(null); setPageState(formData.existing_application ? 'status' : 'landing'); }} className="text-gray-500">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold">{landing.title || 'Заявка'}</h1>
            <p className="text-sm text-gray-500">{formData.org_name}</p>
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
        )}

        <div className="p-4 space-y-4">
          {(formData.form_schema || []).map((field) => (
            <div key={field.id}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>

              {field.type === 'textarea' ? (
                <textarea
                  value={formValues[field.id] || ''}
                  onChange={(e) => setFormValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={field.placeholder}
                  maxLength={field.max_length}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  disabled={pageState === 'submitting'}
                />
              ) : field.type === 'select' ? (
                <select
                  value={formValues[field.id] || ''}
                  onChange={(e) => setFormValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  disabled={pageState === 'submitting'}
                >
                  <option value="">Выберите...</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                  value={formValues[field.id] || ''}
                  onChange={(e) => setFormValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={field.placeholder}
                  maxLength={field.max_length}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={pageState === 'submitting'}
                />
              )}
            </div>
          ))}
        </div>

        <div className="p-4">
          <button
            onClick={submitApplication}
            disabled={pageState === 'submitting'}
            className="w-full py-4 rounded-2xl font-semibold text-white text-lg disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ backgroundColor: accentColor }}
          >
            {pageState === 'submitting' ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Отправка...</>
            ) : (
              formData.existing_application ? 'Сохранить изменения' : 'Отправить заявку'
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────────

  if (pageState === 'success') {
    const successPage = formData.success_page || {};

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: `${accentColor}20` }}>
          <CheckCircle2 className="w-10 h-10" style={{ color: accentColor }} />
        </div>

        <h1 className="text-2xl font-bold mb-2">{successPage.title || 'Заявка отправлена!'}</h1>
        <p className="text-gray-600 mb-6">{successPage.message || 'Мы рассмотрим вашу заявку и свяжемся с вами'}</p>

        {successPage.additional_buttons && successPage.additional_buttons.length > 0 && (
          <div className="space-y-3 w-full max-w-xs">
            {successPage.additional_buttons.map((btn, idx) => (
              <a
                key={idx}
                href={btn.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl font-medium"
                style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
              >
                {btn.text}
                <ChevronRight className="w-4 h-4" />
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
