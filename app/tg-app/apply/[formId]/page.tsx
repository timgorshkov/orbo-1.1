'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { 
  Users, 
  CheckCircle2, 
  Loader2, 
  ChevronRight,
  AlertCircle,
  Send
} from 'lucide-react';

// Telegram WebApp types are defined in @/lib/types/telegram-webapp.d.ts

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
  telegram_group?: {
    title: string;
    invite_link?: string;
  } | null;
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
  utm_source?: string;
  utm_campaign?: string;
  existing_application?: ExistingApplication;
}

type PageState = 'loading' | 'landing' | 'status' | 'form' | 'submitting' | 'success' | 'error';

export default function ApplicationFormPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const formId = params.formId as string;
  const sourceCode = searchParams.get('s') || searchParams.get('source');
  
  const [pageState, setPageState] = useState<PageState>('loading');
  const [formData, setFormData] = useState<FormData | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [tgUser, setTgUser] = useState<any>(null);
  const [isWebAppReady, setIsWebAppReady] = useState(false);
  const [applicationId, setApplicationId] = useState<string | null>(null);

  // Initialize Telegram WebApp
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      const webApp = window.Telegram.WebApp;
      webApp.ready();
      webApp.expand();
      
      setTgUser(webApp.initDataUnsafe?.user);
      setIsWebAppReady(true);
      
      // Apply theme
      if (webApp.themeParams.bg_color) {
        document.body.style.backgroundColor = webApp.themeParams.bg_color;
      }
    }
  }, []);

  // Fetch form data
  useEffect(() => {
    if (!formId || !isWebAppReady) return;
    
    async function fetchForm() {
      try {
        // Build URL with tg_user_id to check for existing application
        const params = new URLSearchParams();
        if (sourceCode) params.set('source', sourceCode);
        if (tgUser?.id) params.set('tg_user_id', String(tgUser.id));
        
        const queryString = params.toString();
        const url = `/api/applications/forms/${formId}/public${queryString ? `?${queryString}` : ''}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.error) {
          setError(data.error);
          setPageState('error');
          return;
        }
        
        setFormData(data);
        
        // Check if user already has an application
        if (data.existing_application) {
          const app = data.existing_application;
          
          // Prefill form with existing data
          if (app.form_data && typeof app.form_data === 'object') {
            setFormValues(app.form_data);
          }
          
          // Show status page for existing application
          setPageState('status');
          setApplicationId(app.id);
        } else {
          // New application - show landing
          setPageState('landing');
          
          // Prefill form values from Telegram user
          if (data.form_schema && tgUser) {
            const prefilled: Record<string, string> = {};
            data.form_schema.forEach((field: FormField) => {
              if (field.prefill === 'telegram_name') {
                prefilled[field.id] = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
              } else if (field.prefill === 'telegram_username') {
                prefilled[field.id] = tgUser.username || '';
              }
            });
            setFormValues(prefilled);
          }
        }
      } catch (err) {
        console.error('Failed to fetch form:', err);
        setError('Не удалось загрузить форму');
        setPageState('error');
      }
    }
    
    fetchForm();
  }, [formId, sourceCode, tgUser, isWebAppReady]);

  // Handle Main Button
  const handleMainButtonClick = useCallback(async () => {
    if (!window.Telegram?.WebApp || !formData || !tgUser) return;
    
    const webApp = window.Telegram.WebApp;
    
    if (pageState === 'landing') {
      // Check if form has fields
      if (formData.form_schema && formData.form_schema.length > 0) {
        setPageState('form');
        webApp.MainButton.setText('Отправить заявку');
        webApp.BackButton.show();
      } else {
        // No form, submit immediately
        await submitApplication();
      }
    } else if (pageState === 'status') {
      // User wants to edit existing application
      if (formData.form_schema && formData.form_schema.length > 0) {
        setPageState('form');
        webApp.MainButton.setText('Сохранить изменения');
        webApp.BackButton.show();
      }
    } else if (pageState === 'form') {
      // Validate required fields
      const missingFields = (formData.form_schema || [])
        .filter(f => f.required && !formValues[f.id])
        .map(f => f.label);
      
      if (missingFields.length > 0) {
        webApp.HapticFeedback?.notificationOccurred('error');
        setError(`Заполните обязательные поля: ${missingFields.join(', ')}`);
        return;
      }
      
      await submitApplication();
    }
  }, [pageState, formData, formValues, tgUser]);

  // Submit application
  const submitApplication = async () => {
    if (!window.Telegram?.WebApp || !formData || !tgUser) return;
    
    const webApp = window.Telegram.WebApp;
    
    setPageState('submitting');
    webApp.MainButton.showProgress(true);
    webApp.MainButton.disable();
    
    try {
      const res = await fetch(`/api/applications/forms/${formId}/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tg_user_id: tgUser.id,
          tg_user_data: {
            user_id: tgUser.id,
            username: tgUser.username,
            first_name: tgUser.first_name,
            last_name: tgUser.last_name,
            photo_url: tgUser.photo_url
          },
          form_data: formValues,
          source_code: sourceCode,
          utm_data: {
            utm_source: formData.utm_source,
            utm_campaign: formData.utm_campaign
          }
        })
      });
      
      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setApplicationId(data.application_id);
      setPageState('success');
      
      // Different feedback for new vs existing application
      if (data.is_existing) {
        webApp.HapticFeedback?.notificationOccurred('warning');
      } else {
        webApp.HapticFeedback?.notificationOccurred('success');
      }
      
      webApp.MainButton.hide();
      webApp.BackButton.hide();
      
    } catch (err: any) {
      console.error('Failed to submit application:', err);
      setError(err.message || 'Не удалось отправить заявку');
      setPageState('form');
      webApp.HapticFeedback?.notificationOccurred('error');
    } finally {
      webApp.MainButton.hideProgress();
      webApp.MainButton.enable();
    }
  };

  // Setup MainButton
  useEffect(() => {
    if (!isWebAppReady || !window.Telegram?.WebApp) return;
    
    const webApp = window.Telegram.WebApp;
    const mainButton = webApp.MainButton;
    
    if (pageState === 'landing' && formData) {
      const buttonText = formData.landing?.cta_button_text || 'Подать заявку';
      mainButton.setText(buttonText);
      mainButton.show();
      mainButton.onClick(handleMainButtonClick);
    } else if (pageState === 'status' && formData) {
      // For existing applications that are still pending - allow to edit
      const app = formData.existing_application;
      if (app?.is_pending && formData.form_schema?.length > 0) {
        mainButton.setText('Редактировать заявку');
        mainButton.show();
        mainButton.onClick(handleMainButtonClick);
      } else {
        mainButton.hide();
      }
    } else if (pageState === 'form') {
      mainButton.setText('Сохранить изменения');
      mainButton.show();
      mainButton.onClick(handleMainButtonClick);
    } else if (pageState === 'submitting' || pageState === 'success') {
      mainButton.hide();
    }
    
    return () => {
      mainButton.offClick(handleMainButtonClick);
    };
  }, [isWebAppReady, pageState, formData, handleMainButtonClick]);

  // Setup BackButton
  useEffect(() => {
    if (!isWebAppReady || !window.Telegram?.WebApp) return;
    
    const webApp = window.Telegram.WebApp;
    const backButton = webApp.BackButton;
    
    const handleBack = () => {
      if (pageState === 'form') {
        // Go back to status if existing application, otherwise to landing
        if (formData?.existing_application) {
          setPageState('status');
          const app = formData.existing_application;
          if (app.is_pending && formData.form_schema?.length > 0) {
            webApp.MainButton.setText('Редактировать заявку');
          } else {
            webApp.MainButton.hide();
          }
        } else {
          setPageState('landing');
          webApp.MainButton.setText(formData?.landing?.cta_button_text || 'Подать заявку');
        }
        setError(null);
        backButton.hide();
      }
    };
    
    if (pageState === 'form') {
      backButton.show();
      backButton.onClick(handleBack);
    } else {
      backButton.hide();
    }
    
    return () => {
      backButton.offClick(handleBack);
    };
  }, [isWebAppReady, pageState, formData]);

  // Render loading state
  if (pageState === 'loading') {
    return (
      <>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </>
    );
  }

  // Render error state
  if (pageState === 'error' && !formData) {
    return (
      <>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
          <h1 className="text-xl font-semibold mb-2">Ошибка</h1>
          <p className="text-gray-600">{error || 'Форма не найдена'}</p>
        </div>
      </>
    );
  }

  if (!formData) return null;

  const landing = formData.landing || {};
  const accentColor = landing.accent_color || '#4f46e5';
  const bgColor = landing.background_color || '#ffffff';
  const textColor = landing.text_color || '#1f2937';

  // Render status page for existing applications
  if (pageState === 'status' && formData.existing_application) {
    const app = formData.existing_application;
    const createdAt = new Date(app.created_at);
    const dateStr = createdAt.toLocaleDateString('ru-RU', { 
      day: 'numeric', 
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    return (
      <>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <div className="min-h-screen bg-gray-50">
          {/* Header with org info */}
          <div className="bg-white border-b px-4 py-4">
            <div className="flex items-center gap-3">
              {formData.org_logo && (
                <img 
                  src={formData.org_logo} 
                  alt={formData.org_name}
                  className="w-12 h-12 rounded-xl object-cover"
                />
              )}
              <div>
                <h1 className="font-semibold">{formData.org_name}</h1>
                <p className="text-sm text-gray-500">{landing.title || 'Заявка'}</p>
              </div>
            </div>
          </div>
          
          {/* Status Card */}
          <div className="p-4">
            <div className="bg-white rounded-2xl border overflow-hidden">
              {/* Status Header */}
              <div 
                className={`px-4 py-3 ${
                  app.is_approved ? 'bg-green-50 text-green-700' :
                  app.is_rejected ? 'bg-red-50 text-red-700' :
                  'bg-blue-50 text-blue-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  {app.is_approved ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : app.is_rejected ? (
                    <AlertCircle className="w-5 h-5" />
                  ) : (
                    <Loader2 className="w-5 h-5" />
                  )}
                  <span className="font-medium">
                    {app.is_approved ? 'Заявка одобрена' :
                     app.is_rejected ? 'Заявка отклонена' :
                     'Заявка на рассмотрении'}
                  </span>
                </div>
              </div>
              
              {/* Status Details */}
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
              
              {/* Filled Data Preview */}
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
            </div>
            
            {/* Info text for pending */}
            {app.is_pending && (
              <p className="text-center text-sm text-gray-500 mt-4">
                Мы рассмотрим вашу заявку и свяжемся с вами
              </p>
            )}
            
            {/* Approved - show group info */}
            {app.is_approved && (
              <div className="mt-4 p-4 bg-green-50 rounded-xl border border-green-200">
                <p className="text-green-800 font-medium mb-2">
                  🎉 Добро пожаловать!
                </p>
                {app.telegram_group?.invite_link ? (
                  <a
                    href={app.telegram_group.invite_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-3 px-4 bg-green-600 text-white text-center rounded-xl font-medium hover:bg-green-700 transition-colors"
                  >
                    Перейти в группу «{app.telegram_group.title}»
                  </a>
                ) : app.telegram_group?.title ? (
                  <p className="text-sm text-green-700">
                    Ваша заявка одобрена! Теперь вы можете вступить в группу «{app.telegram_group.title}».
                    Перейдите в чат группы — ваша заявка на вступление уже подтверждена.
                  </p>
                ) : (
                  <p className="text-sm text-green-700">
                    Ваша заявка одобрена! Теперь вы можете вступить в группу.
                  </p>
                )}
              </div>
            )}
            
            {/* Rejected - show info */}
            {app.is_rejected && (
              <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-200">
                <p className="text-sm text-red-700">
                  К сожалению, ваша заявка была отклонена. 
                  Если вы считаете это ошибкой, свяжитесь с администратором сообщества.
                </p>
              </div>
            )}
            
            {/* Close button */}
            <button
              onClick={() => window.Telegram?.WebApp?.close()}
              className="w-full mt-6 py-3 text-gray-500 text-sm"
            >
              Закрыть
            </button>
          </div>
        </div>
      </>
    );
  }

  // Render landing page
  if (pageState === 'landing') {
    return (
      <>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <div 
          className="min-h-screen"
          style={{ backgroundColor: bgColor, color: textColor }}
        >
          {/* Cover Image */}
          {landing.cover_image_url && (
            <div className="w-full h-48 overflow-hidden">
              <img 
                src={landing.cover_image_url} 
                alt={landing.title || 'Cover'} 
                className="w-full h-full object-cover"
              />
            </div>
          )}
          
          {/* Content */}
          <div className="p-6">
            {/* Org Logo */}
            {landing.show_org_logo && formData.org_logo && (
              <div className="flex justify-center mb-4">
                <img 
                  src={formData.org_logo} 
                  alt={formData.org_name}
                  className="w-16 h-16 rounded-xl object-cover"
                />
              </div>
            )}
            
            {/* Title */}
            <h1 className="text-2xl font-bold text-center mb-2">
              {landing.title || formData.org_name}
            </h1>
            
            {/* Subtitle */}
            {landing.subtitle && (
              <p className="text-center opacity-80 mb-4">
                {landing.subtitle}
              </p>
            )}
            
            {/* Member Count */}
            {landing.show_member_count && formData.member_count && (
              <div className="flex items-center justify-center gap-2 text-sm opacity-70 mb-6">
                <Users className="w-4 h-4" />
                <span>{formData.member_count.toLocaleString()} участников</span>
              </div>
            )}
            
            {/* Benefits */}
            {landing.benefits && landing.benefits.length > 0 && (
              <div className="space-y-3 mb-6">
                {landing.benefits.map((benefit, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ backgroundColor: `${accentColor}15` }}
                  >
                    <CheckCircle2 
                      className="w-5 h-5 flex-shrink-0" 
                      style={{ color: accentColor }}
                    />
                    <span>{benefit.text}</span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Description */}
            {landing.description && (
              <div className="prose prose-sm max-w-none mb-6 opacity-90">
                <p className="whitespace-pre-wrap">{landing.description}</p>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // Render form page
  if (pageState === 'form' || pageState === 'submitting') {
    return (
      <>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <div className="min-h-screen bg-gray-50">
          {/* Header */}
          <div className="bg-white border-b px-4 py-3">
            <h1 className="text-lg font-semibold">{landing.title || 'Заявка'}</h1>
            <p className="text-sm text-gray-500">{formData.org_name}</p>
          </div>
          
          {/* Error */}
          {error && (
            <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}
          
          {/* Form Fields */}
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
          
          {/* Submitting overlay */}
          {pageState === 'submitting' && (
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-6 flex flex-col items-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
                <p className="text-gray-600">Отправка заявки...</p>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  // Render success page
  if (pageState === 'success') {
    const successPage = formData.success_page || {};
    
    return (
      <>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
          <div 
            className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
            style={{ backgroundColor: `${accentColor}20` }}
          >
            <CheckCircle2 className="w-10 h-10" style={{ color: accentColor }} />
          </div>
          
          <h1 className="text-2xl font-bold mb-2">
            {successPage.title || 'Заявка отправлена!'}
          </h1>
          
          <p className="text-gray-600 mb-6">
            {successPage.message || 'Мы рассмотрим вашу заявку и свяжемся с вами'}
          </p>
          
          {/* Additional buttons */}
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
          
          {/* Close button */}
          <button
            onClick={() => window.Telegram?.WebApp?.close()}
            className="mt-8 text-gray-500 underline"
          >
            Закрыть
          </button>
        </div>
      </>
    );
  }

  return null;
}
