'use client'

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ParticipantDetailResult } from '@/lib/types/participant';

interface ParticipantDuplicatesCardProps {
  orgId: string;
  detail: ParticipantDetailResult;
  onDetailUpdate?: (next?: ParticipantDetailResult) => void;
}

type DuplicateEntry = (ParticipantDetailResult['duplicates'][number] & {
  match_score?: number;
  reasons?: string[];
});

export default function ParticipantDuplicatesCard({ orgId, detail, onDetailUpdate }: ParticipantDuplicatesCardProps) {
  // Фильтруем текущего участника из начальных дубликатов
  const currentParticipantId = detail.requestedParticipantId;
  const initialDuplicates = (detail.duplicates || []).filter(dup => dup.id !== currentParticipantId);
  
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<DuplicateEntry[]>(initialDuplicates);
  const [search, setSearch] = useState('');
  const [checking, setChecking] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialDuplicates[0]?.id ?? null);

const filteredSuggestions = useMemo(() => {
    if (!search.trim()) return suggestions;
    const term = search.trim().toLowerCase();
    return suggestions.filter(dup => {
      return (
        dup.full_name?.toLowerCase().includes(term) ||
        dup.username?.toLowerCase().includes(term) ||
        dup.email?.toLowerCase().includes(term) ||
        dup.phone?.toLowerCase().includes(term)
      );
    });
  }, [suggestions, search]);

  const handleFreshCheck = useCallback(async () => {
    setChecking(true);
    setError(null);

    try {
      const response = await fetch('/api/participants/check-duplicates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          currentParticipantId,
          email: detail.participant.email,
          phone: detail.participant.phone,
          username: detail.participant.username,
          tg_user_id: detail.participant.tg_user_id,
          full_name: detail.participant.full_name,
          first_name: detail.participant.first_name,
          last_name: detail.participant.last_name
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || 'Не удалось обновить список совпадений');
      }

      const data = await response.json();

      const mapped: DuplicateEntry[] = (data?.matches || []).map((match: any) => ({
        id: match.id,
        full_name: match.full_name,
        username: match.username,
        email: match.email,
        phone: match.phone,
        tg_user_id: match.tg_user_id,
        created_at: undefined,
        match_score: typeof match.match_score === 'number' ? match.match_score : undefined,
        reasons: Array.isArray(match.reasons) ? match.reasons : undefined
      }));

      setSuggestions(mapped);
      if (mapped.length > 0) {
        setSelectedId(mapped[0].id);
      } else {
        setSelectedId(null);
      }
    } catch (err: any) {
      setError(err.message || 'Не удалось обновить список совпадений');
    } finally {
      setChecking(false);
    }
  }, [detail.participant, orgId, currentParticipantId]);

  // Автоматически обновляем список при монтировании компонента
  useEffect(() => {
    handleFreshCheck();
  }, [handleFreshCheck]);

  const handleMerge = async () => {
    if (!selectedId) {
      setError('Выберите участника для объединения');
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
          action: 'mergeDuplicates',
          targetId: detail.requestedParticipantId, // ✅ Текущий профиль = canonical (target)
          duplicateId: selectedId // ✅ Выбранный дубликат = source (будет объединен в target)
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Не удалось объединить дубликаты');
      }

      const data = await response.json();
      
      // Показываем информацию о результатах объединения
      if (data?.merge_result) {
        const result = data.merge_result;
        let message = 'Профили успешно объединены!\n\n';
        
        if (result.merged_fields && result.merged_fields.length > 0) {
          message += `Заполнено полей: ${result.merged_fields.length}\n`;
          result.merged_fields.forEach((field: any) => {
            message += `  • ${field.field}: ${field.value}\n`;
          });
        }
        
        if (result.conflicts && result.conflicts.length > 0) {
          message += `\nКонфликтующих значений: ${result.conflicts.length}\n`;
          message += 'Они сохранены в характеристиках:\n';
          result.conflicts.forEach((conflict: any) => {
            message += `  • ${conflict.field}: "${conflict.duplicate_value}" → сохранено как "${conflict.saved_as}"\n`;
          });
        }
        
        alert(message);
      }
      
      if (data?.detail && onDetailUpdate) {
        onDetailUpdate(data.detail);
      }
      if (data?.merged_into) {
        window.location.href = `/app/${orgId}/members/${data.merged_into}`;
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
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <label className="text-sm text-neutral-500">Поиск по совпадениям</label>
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Имя, username, email или телефон"
            />
          </div>
          <Button type="button" variant="outline" onClick={handleFreshCheck} disabled={checking}>
            {checking ? 'Проверяем…' : 'Обновить список'}
          </Button>
        </div>

        {filteredSuggestions.length === 0 ? (
          <div className="py-6 text-sm text-neutral-500">Совпадения не найдены</div>
        ) : (
        <div className="space-y-3">
          {filteredSuggestions.map(duplicate => {
            const selected = selectedId === duplicate.id;
            return (
              <label
                key={duplicate.id}
                className={`rounded border ${selected ? 'border-amber-400 ring-2 ring-amber-200' : 'border-amber-200'} bg-white p-3 block cursor-pointer`}
                onClick={() => setSelectedId(duplicate.id)}
              >
                <div className="flex items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="duplicateSelection"
                    value={duplicate.id}
                    checked={selected}
                    onChange={() => setSelectedId(duplicate.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium">
                      {duplicate.full_name || duplicate.username || duplicate.email || duplicate.phone || 'Участник'}
                    </div>
                    <div className="text-xs text-neutral-500 space-x-2 mt-1">
                      {duplicate.email && <span>Email: {duplicate.email}</span>}
                      {duplicate.phone && <span>Телефон: {duplicate.phone}</span>}
                      {duplicate.username && <span>Username: @{duplicate.username}</span>}
                      {duplicate.tg_user_id && <span>ID: {duplicate.tg_user_id}</span>}
                    </div>
                    {typeof duplicate.match_score === 'number' && (
                      <div className="text-xs text-neutral-500 mt-2">
                        Совпадение: {duplicate.match_score}%
                        {duplicate.reasons?.length ? (
                          <ul className="mt-1 text-neutral-400 space-y-1">
                            {duplicate.reasons.map((reason, index) => (
                              <li key={index}>{reason}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        )}
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
        {selectedId && (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            Выбран участник для объединения: {selectedId}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={handleMerge} disabled={pending || !selectedId}>
            {pending ? 'Объединение…' : 'Объединить выбранного участника'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
