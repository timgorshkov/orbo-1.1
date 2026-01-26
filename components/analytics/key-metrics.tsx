'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KeyMetricsData {
  total_participants: number;
  current_participants: number;
  current_messages: number;
  current_engagement_rate: number;
  current_replies: number;
  current_reactions: number;
  current_reply_ratio: number;
  previous_participants: number;
  previous_messages: number;
  previous_engagement_rate: number;
  previous_replies: number;
  previous_reactions: number;
  previous_reply_ratio: number;
}

interface KeyMetricsProps {
  orgId: string;
  tgChatId?: string;
  periodDays?: number;
}

export default function KeyMetrics({ orgId, tgChatId, periodDays = 14 }: KeyMetricsProps) {
  const [data, setData] = useState<KeyMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          periodDays: periodDays.toString(),
        });
        if (tgChatId) {
          params.append('tgChatId', tgChatId);
        }

        const response = await fetch(`/api/analytics/${orgId}/key-metrics?${params}`);
        const result = await response.json();

        if (!response.ok) throw new Error(result.error || 'Failed to fetch');
        
        setData(result.data);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [orgId, tgChatId, periodDays]);

  const calculateChange = (current: number, previous: number): number => {
    if (previous === 0 && current === 0) return 0;
    if (previous === 0) return 100;
    if (current === 0) return -100;
    return ((current - previous) / previous) * 100;
  };

  const formatChange = (change: number): string => {
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(0)}%`;
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-4 h-4" />;
    if (change < 0) return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  const getChangeColor = (change: number): string => {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-gray-400';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Основные метрики</h3>
        <div className="h-40 flex items-center justify-center text-gray-500">
          Загрузка...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Основные метрики</h3>
        <div className="h-40 flex items-center justify-center text-gray-500">
          {error || 'Нет данных'}
        </div>
      </div>
    );
  }

  const activeParticipantsChange = calculateChange(data.current_participants, data.previous_participants);
  const messagesChange = calculateChange(data.current_messages, data.previous_messages);
  const engagementChange = data.current_engagement_rate - data.previous_engagement_rate;
  const repliesChange = calculateChange(data.current_replies, data.previous_replies);
  const reactionsChange = calculateChange(data.current_reactions, data.previous_reactions);
  const replyRatioChange = data.current_reply_ratio - data.previous_reply_ratio;

  // Helper to safely convert to number
  const toNumber = (val: any): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseInt(val, 10) || 0;
    if (typeof val === 'bigint') return Number(val);
    return 0;
  };

  const metrics = [
    {
      label: 'Всего участников',
      current: toNumber(data.total_participants),
      change: null, // Общее число не имеет изменения за период
      format: (val: number) => String(val),
      noChange: true,
    },
    {
      label: 'Активных',
      current: data.current_participants,
      change: activeParticipantsChange,
      format: (val: number) => val.toString(),
      subtitle: `из ${data.total_participants}`,
    },
    {
      label: 'Сообщений',
      current: data.current_messages,
      change: messagesChange,
      format: (val: number) => val.toString(),
    },
    {
      label: 'Вовлечённость',
      current: data.current_engagement_rate,
      change: engagementChange,
      format: (val: number) => `${val.toFixed(1)}%`,
      isPercentage: true,
    },
    {
      label: 'Ответов',
      current: toNumber(data.current_replies),
      change: repliesChange,
      format: (val: number) => String(val),
    },
    {
      label: 'Реакций',
      current: toNumber(data.current_reactions),
      change: reactionsChange,
      format: (val: number) => String(val),
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Основные метрики</h3>
        <span className="text-xs text-gray-500">За {periodDays} дней</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {metrics.map((metric, index) => (
          <div 
            key={index} 
            className="p-3 rounded-lg bg-gray-50 border border-gray-200"
          >
            <p className="text-xs text-gray-500 mb-1">{metric.label}</p>
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-xl font-semibold">
                  {metric.format(metric.current)}
                </p>
                {metric.subtitle && (
                  <p className="text-xs text-gray-400">{metric.subtitle}</p>
                )}
              </div>
              {!metric.noChange && metric.change !== null && (
                <div className={`flex items-center gap-0.5 text-xs font-medium ${getChangeColor(metric.change)}`}>
                  {getChangeIcon(metric.change)}
                  <span>
                    {metric.isPercentage 
                      ? `${metric.change > 0 ? '+' : ''}${metric.change.toFixed(1)}%`
                      : formatChange(metric.change)
                    }
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

