'use client'

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ParticipantDetailResult } from '@/lib/types/participant';

interface ParticipantDuplicatesCardProps {
  orgId: string;
  detail: ParticipantDetailResult;
  onDetailUpdate?: (next?: ParticipantDetailResult) => void;
}

export default function ParticipantDuplicatesCard({ orgId, detail, onDetailUpdate }: ParticipantDuplicatesCardProps) {
  const duplicates = detail.duplicates || [];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (duplicates.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-neutral-500">
          Дубликаты не найдены
        </CardContent>
      </Card>
    );
  }

  const handleMerge = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/participants/${detail.requestedParticipantId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          action: 'mergeDuplicates',
          duplicates: duplicates.map(d => d.id)
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Не удалось объединить дубликаты');
      }

      const data = await response.json();
      if (data?.detail && onDetailUpdate) {
        onDetailUpdate(data.detail);
      }
    } catch (err: any) {
      setError(err.message || 'Не удалось объединить дубликаты');
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Найденные дубликаты</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {duplicates.map(duplicate => (
            <div key={duplicate.id} className="rounded border px-4 py-3">
              <div className="text-sm font-medium">{duplicate.full_name || duplicate.username || 'Без имени'}</div>
              {duplicate.username && (
                <div className="text-xs text-neutral-500">@{duplicate.username}</div>
              )}
              {duplicate.tg_user_id && (
                <div className="text-xs text-neutral-500">ID: {duplicate.tg_user_id}</div>
              )}
              {duplicate.created_at && (
                <div className="text-xs text-neutral-400">
                  Создан: {new Date(duplicate.created_at).toLocaleString('ru')}
                </div>
              )}
            </div>
          ))}
        </div>
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={handleMerge} disabled={pending}>
            {pending ? 'Объединение…' : 'Объединить дубликаты'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
