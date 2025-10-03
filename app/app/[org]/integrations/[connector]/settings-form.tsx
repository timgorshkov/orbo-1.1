'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getcourseConnectors } from '@/constants/integrations';

type SettingsFormProps = {
  orgId: string;
  connectorCode: string;
  config?: Record<string, unknown> | null;
};

export function IntegrationSettingsForm({ orgId, connectorCode, config }: SettingsFormProps) {
  const [baseUrl, setBaseUrl] = useState<string>(typeof config?.baseUrl === 'string' ? config?.baseUrl : '');
  const [apiKey, setApiKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/integrations/${connectorCode}/connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          baseUrl,
          apiKey,
          syncMode: 'manual'
        })
      });

      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Не удалось сохранить настройки');
      }

      setApiKey('');
      setMessage({ type: 'success', text: 'Настройки сохранены' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Произошла ошибка' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="baseUrl">Базовый URL GetCourse</Label>
        <Input
          id="baseUrl"
          placeholder={getcourseConnectors.baseUrlPlaceholder}
          value={baseUrl}
          onChange={event => setBaseUrl(event.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="apiKey">API-ключ</Label>
        <Input
          id="apiKey"
          type="password"
          placeholder="Введите API-ключ"
          value={apiKey}
          onChange={event => setApiKey(event.target.value)}
        />
        <p className="text-xs text-neutral-500">Можно оставить пустым, чтобы использовать сохраненный ключ.</p>
      </div>

      {message && (
        <div className={message.type === 'success' ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
          {message.text}
        </div>
      )}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Сохранение…' : 'Сохранить настройки'}
      </Button>
    </form>
  );
}

