'use client';

import React, { useEffect, useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface RegistrationData {
  date: string;
  registrations: number;
  payments: number;
}

interface Props {
  orgId: string;
  days?: number;
}

export default function EventRegistrationsChart({ orgId, days = 30 }: Props) {
  const [data, setData] = useState<RegistrationData[]>([]);
  const [totals, setTotals] = useState({ registrations: 0, payments: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const params = new URLSearchParams({ days: days.toString() });

        const response = await fetch(`/api/analytics/${orgId}/event-registrations?${params}`);
        if (!response.ok) throw new Error('Failed to fetch registrations');

        const result = await response.json();
        setData(result.data);
        setTotals(result.totals);
      } catch (err) {
        console.error('Error fetching event registrations:', err);
        setError('Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [orgId, days]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <h3 className="text-lg font-medium mb-4">Регистрации на события ({days} дней)</h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          Загрузка...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <h3 className="text-lg font-medium mb-4">Регистрации на события ({days} дней)</h3>
        <div className="h-64 flex items-center justify-center text-red-600">
          {error}
        </div>
      </div>
    );
  }

  // If no registrations at all, don't render the component
  if (totals.registrations === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <div className="mb-4">
        <h3 className="text-lg font-medium">Регистрации на события ({days} дней)</h3>
        <div className="flex gap-6 mt-2">
          <div>
            <div className="text-sm text-neutral-500">Всего регистраций</div>
            <div className="text-2xl font-bold">{totals.registrations}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-500">Оплачено</div>
            <div className="text-2xl font-bold text-green-600">{totals.payments}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-500">Конверсия в оплату</div>
            <div className="text-2xl font-bold">
              {totals.registrations > 0 
                ? Math.round((totals.payments / totals.registrations) * 100) 
                : 0}%
            </div>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart 
          data={data}
          margin={{ top: 5, right: 5, left: -15, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 11 }}
            tickFormatter={(value) => {
              const date = new Date(value);
              return `${date.getDate()}/${date.getMonth() + 1}`;
            }}
            interval="preserveStartEnd"
          />
          <YAxis 
            yAxisId="left" 
            tick={{ fontSize: 11 }} 
            width={30}
            tickFormatter={(value) => value > 0 ? value : ''}
          />
          <YAxis 
            yAxisId="right" 
            orientation="right" 
            tick={{ fontSize: 11 }} 
            width={30}
            tickFormatter={(value) => value > 0 ? value : ''}
          />
          <Tooltip 
            labelFormatter={(value) => {
              const date = new Date(value);
              return date.toLocaleDateString('ru-RU');
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
          <Bar 
            yAxisId="left"
            dataKey="registrations" 
            fill="#3b82f6" 
            name="Регистрации"
            radius={[4, 4, 0, 0]}
          />
          <Line 
            yAxisId="right"
            type="monotone" 
            dataKey="payments" 
            stroke="#10b981" 
            strokeWidth={2}
            name="Оплаты"
            dot={{ fill: '#10b981', r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
