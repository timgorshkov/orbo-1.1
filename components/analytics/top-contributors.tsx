'use client';

import React, { useEffect, useState } from 'react';

interface ContributorData {
  participant_id: string;
  full_name: string | null;
  tg_first_name: string | null;
  tg_last_name: string | null;
  username: string | null;
  tg_user_id: number;
  activity_count: number;
  message_count: number;
  reaction_count: number;
  rank: number;
  rank_change: number;
}

interface Props {
  orgId: string;
  tgChatId?: string;
  limit?: number;
}

export default function TopContributors({ orgId, tgChatId, limit = 10 }: Props) {
  const [data, setData] = useState<ContributorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const params = new URLSearchParams({ limit: limit.toString() });
        if (tgChatId) params.append('tgChatId', tgChatId);

        const response = await fetch(`/api/analytics/${orgId}/contributors?${params}`);
        if (!response.ok) throw new Error('Failed to fetch contributors');

        const result = await response.json();
        setData(result.data);
      } catch (err) {
        console.error('Error fetching contributors:', err);
        setError('Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [orgId, tgChatId, limit]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Лидеры (топ-{limit})</h3>
        <div className="h-80 flex items-center justify-center text-gray-500">
          Загрузка...
        </div>
      </div>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Лидеры (топ-{limit})</h3>
        <div className="h-80 flex items-center justify-center text-gray-500">
          {error || 'Нет данных за последнюю неделю'}
        </div>
      </div>
    );
  }

  const getRankChangeIcon = (change: number) => {
    if (change === 0) return '';
    if (change > 0) return '↑';
    return '↓';
  };

  const getRankChangeColor = (change: number) => {
    if (change === 0) return 'text-gray-400';
    if (change > 0) return 'text-green-600';
    return 'text-red-600';
  };

  const getDisplayName = (contributor: ContributorData): string => {
    // Priority: full_name > tg_first_name + tg_last_name > username > tg_user_id
    if (contributor.full_name) return contributor.full_name;
    
    const tgName = [contributor.tg_first_name, contributor.tg_last_name]
      .filter(Boolean)
      .join(' ');
    if (tgName) return tgName;
    
    if (contributor.username) return `@${contributor.username}`;
    return `ID: ${contributor.tg_user_id}`;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Лидеры (топ-{limit})</h3>
        <span className="text-xs text-gray-500">За последнюю неделю</span>
      </div>

      <div className="space-y-2">
        {data.map((contributor, index) => (
          <div 
            key={contributor.participant_id || contributor.tg_user_id} 
            className="flex items-center gap-3 py-2 px-3 hover:bg-gray-50 rounded-lg transition-colors"
          >
            {/* Rank change indicator */}
            <div className="w-6 flex justify-center">
              {contributor.rank_change !== 0 && (
                <span className={`text-sm font-medium ${getRankChangeColor(contributor.rank_change)}`}>
                  {getRankChangeIcon(contributor.rank_change)}
                </span>
              )}
            </div>

            {/* Rank badge */}
            <div 
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                index < 3 
                  ? 'bg-amber-100 text-amber-800' 
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {contributor.rank}
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <span className="text-sm text-gray-900 truncate block">
                {getDisplayName(contributor)}
              </span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span className="whitespace-nowrap">
                {contributor.message_count} сообщ.
              </span>
              <span className="whitespace-nowrap">
                {contributor.reaction_count} реакц.
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

