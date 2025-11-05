'use client';

import React, { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';

interface TimelineData {
  date: string;
  message_count: number;
  reaction_count: number;
}

interface Props {
  orgId: string;
  tgChatId?: string;
  days?: number;
}

export default function ActivityTimeline({ orgId, tgChatId, days = 30 }: Props) {
  const [data, setData] = useState<TimelineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const params = new URLSearchParams({ days: days.toString() });
        if (tgChatId) params.append('tgChatId', tgChatId);

        const response = await fetch(`/api/analytics/${orgId}/timeline?${params}`);
        if (!response.ok) throw new Error('Failed to fetch timeline');

        const result = await response.json();
        setData(result.data);
      } catch (err) {
        console.error('Error fetching timeline:', err);
        setError('Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [orgId, tgChatId, days]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Активность участников ({days} дней)</h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          Загрузка...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Активность участников ({days} дней)</h3>
        <div className="h-64 flex items-center justify-center text-red-600">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-medium mb-4">Активность участников ({days} дней)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => {
              const date = new Date(value);
              return `${date.getDate()}/${date.getMonth() + 1}`;
            }}
          />
          <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
          <Tooltip 
            labelFormatter={(value) => {
              const date = new Date(value);
              return date.toLocaleDateString('ru-RU');
            }}
          />
          <Legend />
          <Bar 
            yAxisId="left"
            dataKey="message_count" 
            fill="#3b82f6" 
            name="Сообщения"
            radius={[4, 4, 0, 0]}
          />
          <Line 
            yAxisId="right"
            type="monotone" 
            dataKey="reaction_count" 
            stroke="#10b981" 
            strokeWidth={2}
            name="Реакции"
            dot={{ fill: '#10b981', r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

