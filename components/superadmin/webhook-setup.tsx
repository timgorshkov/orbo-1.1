'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface WebhookInfo {
  url: string;
  hasCustomCertificate: boolean;
  pendingUpdateCount: number;
  lastErrorDate?: number;
  lastErrorMessage?: string;
  maxConnections?: number;
  allowedUpdates?: string[];
}

interface WebhookData {
  main: WebhookInfo;
  notifications: WebhookInfo;
}

export function WebhookSetup() {
  const [loading, setLoading] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<WebhookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupBotType, setSetupBotType] = useState<'main' | 'notifications' | null>(null);

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

  const setupWebhook = async (botType: 'main' | 'notifications') => {
    try {
      setLoading(true);
      setSetupBotType(botType);
      setError(null);
      
      const response = await fetch('/api/superadmin/telegram/setup-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botType })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to setup webhook');
      }
      
      // Refresh webhook info
      await fetchWebhookInfo();
      
      alert(`✅ Webhook successfully configured for ${botType} bot!`);
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

  const renderWebhookInfo = (botType: 'main' | 'notifications', info?: WebhookInfo) => {
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
              <div className="text-sm text-red-600">
                <span className="font-medium">Last Error:</span> {info.lastErrorMessage}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Main Bot */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Main Bot</h3>
              <Button
                onClick={() => setupWebhook('main')}
                disabled={loading}
                size="sm"
              >
                {loading && setupBotType === 'main' ? 'Настройка...' : 'Setup Webhook'}
              </Button>
            </div>
            
            {renderWebhookInfo('main', webhookInfo?.main)}
          </div>

          {/* Notifications Bot */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Notifications Bot</h3>
              <Button
                onClick={() => setupWebhook('notifications')}
                disabled={loading}
                size="sm"
              >
                {loading && setupBotType === 'notifications' ? 'Настройка...' : 'Setup Webhook'}
              </Button>
            </div>
            
            {renderWebhookInfo('notifications', webhookInfo?.notifications)}
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

