'use client';

import React, { useEffect, useState } from 'react';

interface HeatmapData {
  day_of_week: number; // 0 = Sunday, 1 = Monday, etc.
  hour_of_day: number; // 0-23
  message_count: number;
}

interface Props {
  orgId: string;
  tgChatId?: string;
  days?: number;
}

// Days starting from Monday (DB uses 0=Sunday, so we remap)
const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const HOUR_LABELS = ['0-3', '3-6', '6-9', '9-12', '12-15', '15-18', '18-21', '21-24'];

// Convert DB day_of_week (0=Sunday) to our display order (0=Monday)
const convertDayIndex = (dbDayIndex: number): number => {
  return dbDayIndex === 0 ? 6 : dbDayIndex - 1;
};

export default function ActivityHeatmap({ orgId, tgChatId, days = 30 }: Props) {
  const [data, setData] = useState<HeatmapData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const params = new URLSearchParams({ days: days.toString() });
        if (tgChatId) params.append('tgChatId', tgChatId);

        const response = await fetch(`/api/analytics/${orgId}/heatmap?${params}`);
        if (!response.ok) throw new Error('Failed to fetch heatmap');

        const result = await response.json();
        setData(result.data);
      } catch (err) {
        console.error('Error fetching heatmap:', err);
        setError('Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [orgId, tgChatId, days]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Тепловая карта активности</h3>
        <div className="h-80 flex items-center justify-center text-gray-500">
          Загрузка...
        </div>
      </div>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Тепловая карта активности</h3>
        <div className="h-80 flex items-center justify-center text-gray-500">
          {error || 'Нет данных'}
        </div>
      </div>
    );
  }

  // Find max value for color scaling
  const maxCount = Math.max(...data.map(d => d.message_count), 1);

  // Group hours into 3-hour intervals
  const groupedData: { [key: string]: number } = {};
  data.forEach(item => {
    const hourInterval = Math.floor(item.hour_of_day / 3);
    const displayDayIndex = convertDayIndex(item.day_of_week);
    const key = `${hourInterval}-${displayDayIndex}`;
    groupedData[key] = (groupedData[key] || 0) + item.message_count;
  });

  const getColor = (count: number) => {
    if (count === 0) return 'bg-gray-100';
    const intensity = Math.min(count / maxCount, 1);
    if (intensity > 0.75) return 'bg-blue-600';
    if (intensity > 0.5) return 'bg-blue-500';
    if (intensity > 0.25) return 'bg-blue-400';
    return 'bg-blue-300';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-medium mb-4">Тепловая карта активности</h3>
      <p className="text-sm text-gray-600 mb-4">
        Активность по часам и дням недели (последние {days} дней)
      </p>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Day labels (header) */}
          <div className="flex mb-2">
            <div className="w-16 flex-shrink-0" />
            {DAY_LABELS.map((label, index) => (
              <div key={index} className="flex-1 text-center text-xs text-gray-600 px-1 min-w-[40px]">
                {label}
              </div>
            ))}
          </div>

          {/* Heatmap grid (rows = hour intervals, columns = days) */}
          {HOUR_LABELS.map((hourLabel, hourIndex) => (
            <div key={hourIndex} className="flex mb-1">
              {/* Hour label */}
              <div className="w-16 flex-shrink-0 text-xs text-gray-600 flex items-center pr-2">
                {hourLabel}
              </div>

              {/* Day cells */}
              {DAY_LABELS.map((_, dayIndex) => {
                const key = `${hourIndex}-${dayIndex}`;
                const count = groupedData[key] || 0;
                return (
                  <div
                    key={dayIndex}
                    className={`flex-1 h-5 mx-0.5 rounded ${getColor(count)} transition-colors cursor-pointer hover:opacity-80 min-w-[40px]`}
                    title={`${DAY_LABELS[dayIndex]} ${hourLabel}: ${count} сообщений`}
                  />
                );
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-600">
            <span>Меньше</span>
            <div className="flex gap-1">
              <div className="w-4 h-4 rounded bg-gray-100" />
              <div className="w-4 h-4 rounded bg-blue-300" />
              <div className="w-4 h-4 rounded bg-blue-400" />
              <div className="w-4 h-4 rounded bg-blue-500" />
              <div className="w-4 h-4 rounded bg-blue-600" />
            </div>
            <span>Больше</span>
          </div>
        </div>
      </div>
    </div>
  );
}

