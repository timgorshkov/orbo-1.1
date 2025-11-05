'use client';

import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface EngagementData {
  category: string;
  count: number;
}

interface Props {
  orgId: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  'core': 'Ядро',
  'experienced': 'Опытные',
  'newcomers': 'Новички',
  'silent': 'Молчуны',
  'other': 'Остальные'
};

const COLORS: Record<string, string> = {
  'core': '#10b981',        // green
  'experienced': '#3b82f6', // blue
  'newcomers': '#f59e0b',   // amber
  'silent': '#ef4444',      // red
  'other': '#6b7280'        // gray
};

export default function EngagementPie({ orgId }: Props) {
  const [data, setData] = useState<EngagementData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch(`/api/analytics/${orgId}/engagement`);
        if (!response.ok) throw new Error('Failed to fetch engagement');

        const result = await response.json();
        setData(result.data);
      } catch (err) {
        console.error('Error fetching engagement:', err);
        setError('Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [orgId]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Вовлечённость</h3>
        <div className="h-80 flex items-center justify-center text-gray-500">
          Загрузка...
        </div>
      </div>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium mb-4">Вовлечённость</h3>
        <div className="h-80 flex items-center justify-center text-gray-500">
          {error || 'Нет данных'}
        </div>
      </div>
    );
  }

  // Prepare data for chart
  const chartData = data.map(item => ({
    name: CATEGORY_LABELS[item.category] || item.category,
    value: item.count,
    category: item.category
  }));

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-medium mb-4">Вовлечённость</h3>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.category] || '#6b7280'} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => `${value} чел.`} />
          </PieChart>
        </ResponsiveContainer>

        {/* Legend with counts */}
        <div className="flex flex-col justify-center space-y-3">
          {chartData.map((item) => (
            <div key={item.category} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded" 
                  style={{ backgroundColor: COLORS[item.category] || '#6b7280' }}
                />
                <span className="text-sm text-gray-700">{item.name}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-medium text-gray-900">{item.value}</span>
                <span className="text-xs text-gray-500 ml-1">
                  ({total > 0 ? ((item.value / total) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Categories explanation */}
      <div className="mt-6 pt-4 border-t text-xs text-gray-500 space-y-1">
        <p><strong>Ядро:</strong> Активность &gt; месяца + ≥3 сообщений/неделю</p>
        <p><strong>Опытные:</strong> Активность &gt; месяца, но &lt;3 сообщений/неделю</p>
        <p><strong>Новички:</strong> Присоединились менее месяца назад (через Telegram)</p>
        <p><strong>Молчуны:</strong> Нет сообщений за 30 дней</p>
      </div>
    </div>
  );
}

