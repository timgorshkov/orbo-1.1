'use client';

import React, { useEffect, useState } from 'react';

interface ReactionsRepliesData {
  current_replies: number;
  current_reactions: number;
  current_reply_ratio: number;
  previous_replies: number;
  previous_reactions: number;
  previous_reply_ratio: number;
}

interface Props {
  orgId: string;
  tgChatId?: string;
  periodDays?: number;
}

export default function ReactionsRepliesStats({ orgId, tgChatId, periodDays = 14 }: Props) {
  const [data, setData] = useState<ReactionsRepliesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const params = new URLSearchParams({ periodDays: periodDays.toString() });
        if (tgChatId) params.append('tgChatId', tgChatId);

        const response = await fetch(`/api/analytics/${orgId}/reactions-replies?${params}`);
        if (!response.ok) throw new Error('Failed to fetch reactions-replies');

        const result = await response.json();
        setData(result.data);
      } catch (err) {
        console.error('Error fetching reactions-replies:', err);
        setError('Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [orgId, tgChatId, periodDays]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Реакции и ответы ({periodDays} дней)</h3>
        <div className="h-48 flex items-center justify-center text-gray-500">
          Загрузка...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Реакции и ответы ({periodDays} дней)</h3>
        <div className="h-48 flex items-center justify-center text-gray-500">
          {error || 'Нет данных'}
        </div>
      </div>
    );
  }

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0 && current === 0) return 0;
    if (previous === 0) return 100;
    if (!isFinite(current) || !isFinite(previous)) return 0;
    return ((current - previous) / previous) * 100;
  };

  const repliesChange = calculateChange(data.current_replies, data.previous_replies);
  const reactionsChange = calculateChange(data.current_reactions, data.previous_reactions);
  const replyRatioChange = calculateChange(data.current_reply_ratio, data.previous_reply_ratio);

  const formatChange = (change: number) => {
    if (!isFinite(change)) return '—';
    const sign = change >= 0 ? '+' : '';
    return `${sign}${Math.min(Math.abs(change), 999).toFixed(0)}%`;
  };

  const getChangeColor = (change: number) => {
    if (!isFinite(change) || change === 0) return 'text-gray-500';
    if (change > 0) return 'text-green-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium">Реакции и ответы ({periodDays} дней)</h3>
        <span className="text-xs text-gray-500">vs предыдущий период</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Replies */}
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-1">Ответы</p>
          <p className="text-3xl font-bold text-gray-900">{data.current_replies}</p>
          <p className={`text-sm mt-1 ${getChangeColor(repliesChange)}`}>
            {formatChange(repliesChange)}
          </p>
        </div>

        {/* Reactions */}
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-1">Реакции</p>
          <p className="text-3xl font-bold text-gray-900">{data.current_reactions}</p>
          <p className={`text-sm mt-1 ${getChangeColor(reactionsChange)}`}>
            {formatChange(reactionsChange)}
          </p>
        </div>

        {/* Reply Ratio */}
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-1">Доля ответов</p>
          <p className="text-3xl font-bold text-gray-900">
            {(data.current_reply_ratio * 100).toFixed(1)}%
          </p>
          <p className={`text-sm mt-1 ${getChangeColor(replyRatioChange)}`}>
            {formatChange(replyRatioChange)}
          </p>
        </div>
      </div>

      {/* Context */}
      <div className="mt-6 pt-4 border-t text-xs text-gray-500">
        <p>
          <strong>Доля ответов</strong> — процент сообщений с reply_to_message от общего числа сообщений.
          Высокая доля указывает на активные дискуссии.
        </p>
      </div>
    </div>
  );
}

