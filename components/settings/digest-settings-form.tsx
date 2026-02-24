'use client';

/**
 * Digest Settings Form
 * Configure weekly digest: enable/disable, day, time, test send
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AssistBotBanner from '@/components/notifications/assist-bot-banner';

interface DigestSettings {
  enabled: boolean;
  day: number;
  time: string;
  lastSentAt: string | null;
}

interface DigestSettingsFormProps {
  orgId: string;
  initialSettings: DigestSettings;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Воскресенье' },
  { value: 1, label: 'Понедельник' },
  { value: 2, label: 'Вторник' },
  { value: 3, label: 'Среда' },
  { value: 4, label: 'Четверг' },
  { value: 5, label: 'Пятница' },
  { value: 6, label: 'Суббота' },
];

export default function DigestSettingsForm({ orgId, initialSettings }: DigestSettingsFormProps) {
  const [settings, setSettings] = useState<DigestSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);

    try {
      const response = await fetch(`/api/organizations/${orgId}/digest-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          digest_enabled: settings.enabled,
          digest_day: settings.day,
          digest_time: settings.time,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save settings');
      }

      alert('Настройки сохранены');
    } catch (error) {
      console.error('Failed to save digest settings:', error);
      alert('Ошибка сохранения: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/digest/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });

      const result = await response.json();

      if (!response.ok) {
        setTestResult({
          success: false,
          message: result.message || result.error || 'Failed to send test digest',
        });
      } else {
        setTestResult({
          success: true,
          message: `Дайджест отправлен! Стоимость: ${result.cost.usd.toFixed(4)} USD (${result.cost.rub.toFixed(2)} ₽)`,
        });
      }
    } catch (error) {
      console.error('Failed to send test digest:', error);
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <AssistBotBanner orgId={orgId} compact />
      {/* Main Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Настройки еженедельного дайджеста</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium">Еженедельный дайджест</label>
              <p className="text-sm text-gray-600">
                Автоматическая отправка дайджеста активности сообщества
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Day of Week Select */}
          <div>
            <label className="block font-medium mb-2">День недели</label>
            <select
              value={settings.day}
              onChange={(e) => setSettings({ ...settings, day: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={!settings.enabled}
            >
              {DAYS_OF_WEEK.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>

          {/* Time Select */}
          <div>
            <label className="block font-medium mb-2">Время отправки</label>
            <input
              type="time"
              value={settings.time.slice(0, 5)} // HH:MM:SS -> HH:MM
              onChange={(e) => setSettings({ ...settings, time: e.target.value + ':00' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={!settings.enabled}
            />
            <p className="text-sm text-gray-600 mt-1">Время по часовому поясу организации</p>
          </div>

          {/* Save Button */}
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Сохранение...' : 'Сохранить настройки'}
          </Button>
        </CardContent>
      </Card>

      {/* Test Send Card */}
      <Card>
        <CardHeader>
          <CardTitle>Тестовая отправка</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Отправить тестовый дайджест за последние 7 дней себе в Telegram (@orbo_assist_bot).
            Дайджест будет содержать AI-комментарии и рекомендации.
          </p>

          <Button
            onClick={handleTestSend}
            disabled={testing}
            variant="outline"
            className="w-full"
          >
            {testing ? 'Отправка...' : 'Отправить тестовый дайджест'}
          </Button>

          {testResult && (
            <div
              className={`p-4 rounded-lg ${
                testResult.success
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              {testResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Card */}
      {settings.lastSentAt && (
        <Card>
          <CardHeader>
            <CardTitle>Статус</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Последняя отправка:</span>
              <span className="font-medium">
                {new Date(settings.lastSentAt).toLocaleString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

