'use client'

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ParticipantDetailResult } from '@/lib/types/participant';

interface ParticipantTraitsCardProps {
  orgId: string;
  detail: ParticipantDetailResult;
  onDetailUpdate?: (next?: ParticipantDetailResult) => void;
}

interface TraitDraft {
  key: string;
  value: string;
  source: string;
  valueType: string;
  notes: string;
}

export default function ParticipantTraitsCard({ orgId, detail, onDetailUpdate }: ParticipantTraitsCardProps) {
  const [draft, setDraft] = useState<TraitDraft>({
    key: '',
    value: '',
    source: 'manual',
    valueType: 'text',
    notes: ''
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddTrait = async () => {
    if (!draft.key.trim() || !draft.value.trim()) {
      setError('Заполните ключ и значение');
      return;
    }

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
          action: 'addTrait',
          key: draft.key.trim(),
          value: draft.value.trim(),
          valueType: draft.valueType,
          source: draft.source,
          metadata: draft.notes ? { notes: draft.notes } : null
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Не удалось добавить характеристику');
      }

      const data = await response.json();
      setDraft({ key: '', value: '', source: 'manual', valueType: 'text', notes: '' });
      if (data?.detail && onDetailUpdate) {
        onDetailUpdate(data.detail);
      }
    } catch (err: any) {
      setError(err.message || 'Не удалось добавить характеристику');
    } finally {
      setPending(false);
    }
  };

  const handleRemoveTrait = async (traitId: string) => {
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
          action: 'removeTrait',
          traitId
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Не удалось удалить характеристику');
      }

      const data = await response.json();
      if (data?.detail && onDetailUpdate) {
        onDetailUpdate(data.detail);
      }
    } catch (err: any) {
      setError(err.message || 'Не удалось удалить характеристику');
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Характеристики участника</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-neutral-500">Ключ</label>
              <Input
                value={draft.key}
                onChange={e => setDraft(prev => ({ ...prev, key: e.target.value }))}
                placeholder="Пример: роль, цвет, стиль общения"
                disabled={pending}
              />
            </div>
            <div>
              <label className="text-sm text-neutral-500">Источник</label>
              <Input
                value={draft.source}
                onChange={e => setDraft(prev => ({ ...prev, source: e.target.value }))}
                placeholder="manual / ai / moderator"
                disabled={pending}
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-neutral-500">Значение</label>
            <Textarea
              value={draft.value}
              onChange={e => setDraft(prev => ({ ...prev, value: e.target.value }))}
              rows={3}
              placeholder="Описание или короткая характеристика"
              disabled={pending}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-500">Заметки</label>
            <Textarea
              value={draft.notes}
              onChange={e => setDraft(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
              placeholder="Дополнительные детали, ссылки, контекст"
              disabled={pending}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleAddTrait} disabled={pending}>
              {pending ? 'Сохранение…' : 'Добавить характеристику'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {detail.traits.length === 0 ? (
            <div className="text-sm text-neutral-500">Нет характеристик</div>
          ) : (
            detail.traits.map(trait => (
              <div key={trait.id} className="rounded border px-4 py-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium">{trait.trait_key}</div>
                    <div className="text-sm text-neutral-700 whitespace-pre-wrap">
                      {trait.trait_value}
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">
                      Источник: {trait.source || 'manual'} | Обновлено: {new Date(trait.updated_at).toLocaleString('ru')}
                    </div>
                    {trait.metadata?.notes && (
                      <div className="text-xs text-neutral-500 mt-1">
                        Заметки: {trait.metadata.notes}
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" onClick={() => handleRemoveTrait(trait.id)} disabled={pending}>
                    Удалить
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
