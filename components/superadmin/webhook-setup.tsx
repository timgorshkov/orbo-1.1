'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function getTimeAgo(unixTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixTimestamp;
  
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} дн назад`;
  return `${Math.floor(diff / 604800)} нед назад`;
}

interface WebhookInfo {
  url: string;
  hasCustomCertificate: boolean;
  pendingUpdateCount: number;
  lastErrorDate?: number;
  lastErrorMessage?: string;
  maxConnections?: number;
  allowedUpdates?: string[];
}

interface EventBotInfo extends WebhookInfo {
  configured: boolean;
  botUsername?: string;
  message?: string;
}

interface WebhookData {
  main: WebhookInfo;
  notifications: WebhookInfo;
  event?: EventBotInfo;
}

export function WebhookSetup() {
  const [loading, setLoading] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<WebhookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupBotType, setSetupBotType] = useState<'main' | 'notifications' | 'event' | null>(null);

  const fetchWebhookInfo = async () => {
    try {
      setError(null);
      const response = await fetch('/api/superadmin/telegram/setup-webhook');
      
      if (!response.ok) {
        throw new Error('Failed to fetch webhook info');
      }
      
      const data = await response.json();
      setWebhookInfo(data);
    } catch (err: any) {
      setError(err.message || 'Error fetching webhook info');
    }
  };

  const setupWebhook = async (botType: 'main' | 'notifications' | 'event', dropPending: boolean = false) => {
    try {
      setLoading(true);
      setSetupBotType(botType);
      setError(null);
      
      const response = await fetch('/api/superadmin/telegram/setup-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botType, dropPendingUpdates: dropPending })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to setup webhook');
      }
      
      // Refresh webhook info
      await fetchWebhookInfo();
      
      const message = dropPending 
        ? `✅ Webhook сброшен и перенастроен для ${botType} bot!`
        : `✅ Webhook successfully configured for ${botType} bot!`;
      alert(message);
    } catch (err: any) {
      setError(err.message || 'Error setting up webhook');
      alert(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
      setSetupBotType(null);
    }
  };

  // Auto-fetch on mount
  useEffect(() => {
    fetchWebhookInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderWebhookInfo = (botType: 'main' | 'notifications' | 'event', info?: WebhookInfo) => {
    if (!info) {
      return <p className="text-sm text-gray-500">Загрузка...</p>;
    }

    const hasError = info.lastErrorMessage && info.lastErrorDate;
    const isConfigured = info.url && info.url.length > 0;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Статус:</span>
          {isConfigured ? (
            <Badge variant="default">✅ Настроен</Badge>
          ) : (
            <Badge variant="destructive">❌ Не настроен</Badge>
          )}
        </div>

        {isConfigured && (
          <>
            <div className="text-sm">
              <span className="font-medium">URL:</span>{' '}
              <code className="bg-gray-100 px-2 py-1 rounded text-xs">{info.url}</code>
            </div>

            <div className="text-sm">
              <span className="font-medium">Allowed Updates:</span>{' '}
              <div className="flex flex-wrap gap-1 mt-1">
                {info.allowedUpdates?.map((update) => (
                  <Badge key={update} variant="outline" className="text-xs">
                    {update}
                  </Badge>
                ))}
              </div>
            </div>

            {info.pendingUpdateCount > 0 && (
              <div className="text-sm text-yellow-600">
                ⚠️ Pending updates: {info.pendingUpdateCount}
              </div>
            )}

            {hasError && (
              <div className="text-sm bg-red-50 p-2 rounded border border-red-200">
                <div className="font-medium text-red-700">Last Error:</div>
                <div className="text-red-600">{info.lastErrorMessage}</div>
                {info.lastErrorDate && (
                  <div className="text-xs text-red-500 mt-1">
                    Время: {new Date(info.lastErrorDate * 1000).toLocaleString('ru-RU')}
                    {' '}
                    ({getTimeAgo(info.lastErrorDate)})
                  </div>
                )}
                <div className="text-xs text-gray-500 mt-2 italic">
                  💡 Это последняя ошибка от Telegram. Если сообщения обрабатываются корректно, 
                  ошибка могла произойти во время деплоя и не влияет на работу.
                </div>
              </div>
            )}

            <div className="text-sm text-gray-500">
              Max connections: {info.maxConnections || 40}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhook Configuration</CardTitle>
        <CardDescription>
          Управление настройками webhook для Telegram ботов
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Bot */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Main Bot</h3>
              <div className="flex gap-2">
                <Button
                  onClick={() => setupWebhook('main')}
                  disabled={loading}
                  size="sm"
                >
                  {loading && setupBotType === 'main' ? 'Настройка...' : 'Setup'}
                </Button>
                {(webhookInfo?.main?.lastErrorMessage || (webhookInfo?.main?.pendingUpdateCount || 0) > 0) && (
                  <Button
                    onClick={() => setupWebhook('main', true)}
                    disabled={loading}
                    size="sm"
                    variant="outline"
                    title="Сбросить ошибку и очередь"
                  >
                    🔄 Reset
                  </Button>
                )}
              </div>
            </div>
            
            {renderWebhookInfo('main', webhookInfo?.main)}
          </div>

          {/* Notifications Bot */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Notifications Bot</h3>
              <div className="flex gap-2">
                <Button
                  onClick={() => setupWebhook('notifications')}
                  disabled={loading}
                  size="sm"
                >
                  {loading && setupBotType === 'notifications' ? 'Настройка...' : 'Setup'}
                </Button>
                {(webhookInfo?.notifications?.lastErrorMessage || (webhookInfo?.notifications?.pendingUpdateCount || 0) > 0) && (
                  <Button
                    onClick={() => setupWebhook('notifications', true)}
                    disabled={loading}
                    size="sm"
                    variant="outline"
                    title="Сбросить ошибку и очередь"
                  >
                    🔄 Reset
                  </Button>
                )}
              </div>
            </div>
            
            {renderWebhookInfo('notifications', webhookInfo?.notifications)}
          </div>

          {/* Event Bot */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Event Bot</h3>
              <div className="flex gap-2">
                {webhookInfo?.event?.configured !== false && (
                  <>
                    <Button
                      onClick={() => setupWebhook('event')}
                      disabled={loading}
                      size="sm"
                    >
                      {loading && setupBotType === 'event' ? 'Настройка...' : 'Setup'}
                    </Button>
                    {(webhookInfo?.event?.lastErrorMessage || (webhookInfo?.event?.pendingUpdateCount || 0) > 0) && (
                      <Button
                        onClick={() => setupWebhook('event', true)}
                        disabled={loading}
                        size="sm"
                        variant="outline"
                        title="Сбросить ошибку и очередь"
                      >
                        🔄 Reset
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
            
            {webhookInfo?.event?.configured === false ? (
              <div className="text-sm text-gray-500">
                <Badge variant="secondary">⚙️ Не настроен</Badge>
                <p className="mt-2 text-xs">{webhookInfo.event.message}</p>
                <p className="mt-1 text-xs text-gray-400">
                  Добавьте TELEGRAM_EVENT_BOT_TOKEN в .env
                </p>
              </div>
            ) : webhookInfo?.event ? (
              <div className="space-y-2">
                {webhookInfo.event.botUsername && (
                  <div className="text-sm">
                    <span className="font-medium">Бот:</span>{' '}
                    <a 
                      href={`https://t.me/${webhookInfo.event.botUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      @{webhookInfo.event.botUsername}
                    </a>
                  </div>
                )}
                {renderWebhookInfo('event', webhookInfo.event)}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Загрузка...</p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <Button
            onClick={fetchWebhookInfo}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            🔄 Обновить информацию
          </Button>
        </div>

        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Важно:</strong> Main bot должен иметь{' '}
            <code className="bg-blue-100 px-1 rounded">message_reaction</code> в allowed_updates
            для работы аналитики реакций.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

