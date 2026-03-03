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

/** Score indicating how "complete" a participant profile is (0–100). */
function profileCompleteness(p: {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  tg_username?: string | null;
  username?: string | null;
  tg_user_id?: string | null;
  bio?: string | null;
  photo_url?: string | null;
  custom_attributes?: any;
}): number {
  let score = 0;
  if (p.full_name) score += 20;
  if (p.email) score += 15;
  if (p.phone) score += 15;
  if (p.tg_username || p.username) score += 15;
  if (p.tg_user_id) score += 10;
  if (p.bio) score += 10;
  if (p.photo_url) score += 10;
  const attrs = p.custom_attributes;
  if (attrs && typeof attrs === 'object' && Object.keys(attrs).length > 0) score += 5;
  return score;
}

export default function ParticipantDuplicatesCard({ orgId, detail, onDetailUpdate }: ParticipantDuplicatesCardProps) {
  const currentParticipantId = detail.requestedParticipantId;
  const canonicalId = detail.canonicalParticipantId;
  const initialDuplicates = (detail.duplicates || []).filter(dup => dup.id !== currentParticipantId);

  const [pending, setPending] = useState(false);
  const [unmerging, setUnmerging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<DuplicateEntry[]>(initialDuplicates);
  const [search, setSearch] = useState('');
  const [checking, setChecking] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialDuplicates[0]?.id ?? null);

  // Already-merged (attached) profiles live in detail.duplicates
  const attachedProfiles: ParticipantDetailResult['duplicates'] = detail.duplicates || [];

  const filteredSuggestions = useMemo(() => {
    if (!search.trim()) return suggestions;
    const term = search.trim().toLowerCase();
    const normalizeName = (name: string | undefined | null): string => {
      if (!name) return '';
      return name.replace(/^WhatsApp\s+/i, '').toLowerCase();
    };
    return suggestions.filter(dup => {
      const normalizedFullName = normalizeName(dup.full_name);
      const normalizedTerm = term.replace(/^whatsapp\s+/i, '');
      return (
        normalizedFullName.includes(normalizedTerm) ||
        dup.full_name?.toLowerCase().includes(term) ||
        (dup as any).username?.toLowerCase().includes(term) ||
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
        headers: { 'Content-Type': 'application/json' },
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
      setSelectedId(mapped.length > 0 ? mapped[0].id : null);
    } catch (err: any) {
      setError(err.message || 'Не удалось обновить список совпадений');
    } finally {
      setChecking(false);
    }
  }, [detail.participant, orgId, currentParticipantId]);

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
      const response = await fetch(`/api/participants/${canonicalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          action: 'mergeDuplicates',
          targetId: canonicalId,
          duplicateId: selectedId
        })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Не удалось объединить дубликаты');
      }
      const data = await response.json();
      if (data?.merge_result) {
        const result = data.merge_result;
        let message = 'Профили успешно объединены!\n\n';
        if (result.merged_fields?.length) {
          message += `Заполнено полей: ${result.merged_fields.length}\n`;
          result.merged_fields.forEach((field: any) => {
            message += `  • ${field.field}: ${field.value}\n`;
          });
        }
        if (result.conflicts?.length) {
          message += `\nКонфликтующих значений: ${result.conflicts.length}\n`;
          message += 'Они сохранены в характеристиках:\n';
          result.conflicts.forEach((conflict: any) => {
            message += `  • ${conflict.field}: "${conflict.duplicate_value}" → сохранено как "${conflict.saved_as}"\n`;
          });
        }
        alert(message);
      }
      if (data?.detail && onDetailUpdate) onDetailUpdate(data.detail);
      if (data?.merged_into) window.location.href = `/p/${orgId}/members/${data.merged_into}`;
    } catch (err: any) {
      setError(err.message || 'Не удалось объединить дубликаты');
    } finally {
      setPending(false);
    }
  };

  const handleUnmerge = async (ghostId: string) => {
    if (!confirm('Открепить этот профиль? Накопленные данные (теги, группы, трейты) останутся у основного профиля. Связанный профиль станет самостоятельным участником.')) return;
    setUnmerging(ghostId);
    setError(null);
    try {
      const response = await fetch(`/api/participants/${canonicalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, action: 'unmerge', ghostId })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Не удалось открепить профиль');
      }
      const data = await response.json();
      if (data?.detail && onDetailUpdate) onDetailUpdate(data.detail);
      else window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Не удалось открепить профиль');
    } finally {
      setUnmerging(null);
    }
  };

  const currentScore = profileCompleteness(detail.participant as any);
  const selectedEntry = suggestions.find(s => s.id === selectedId);
  const selectedScore = selectedEntry ? profileCompleteness(selectedEntry as any) : null;
  // Warn if the selected duplicate is more complete than the current profile
  const mergeDirectionWarning =
    selectedScore !== null && selectedScore > currentScore
      ? `⚠️ Выбранный профиль полнее текущего (${selectedScore} vs ${currentScore} баллов). При объединении основным остаётся текущий профиль. Убедитесь, что это верно.`
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Дубликаты и связанные профили</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Already-attached profiles (merged-into-this) */}
        {attachedProfiles.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Прикреплённые профили</p>
            <div className="space-y-2">
              {attachedProfiles.map(ghost => (
                <div
                  key={ghost.id}
                  className="flex items-start justify-between gap-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-blue-900">
                      {ghost.full_name || (ghost as any).username || ghost.email || ghost.phone || 'Участник'}
                    </div>
                    <div className="text-xs text-blue-600 space-x-2 mt-0.5">
                      {ghost.email && <span>Email: {ghost.email}</span>}
                      {ghost.phone && <span>Тел: {ghost.phone}</span>}
                      {(ghost as any).username && <span>@{(ghost as any).username}</span>}
                      {(ghost as any).tg_user_id && <span>TG ID: {(ghost as any).tg_user_id}</span>}
                      {(ghost as any).max_user_id && <span>MAX ID: {(ghost as any).max_user_id}</span>}
                    </div>
                    <div className="text-xs text-blue-400 mt-0.5">
                      Полнота профиля: {profileCompleteness(ghost as any)}%
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                    disabled={unmerging === ghost.id}
                    onClick={() => handleUnmerge(ghost.id)}
                  >
                    {unmerging === ghost.id ? 'Откреп...' : 'Открепить'}
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              При откреплении прикреплённый профиль снова становится самостоятельным участником. Данные (теги, группы), перенесённые при объединении, остаются у основного профиля.
            </p>
          </div>
        )}

        {/* Suggested duplicates */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Найти и объединить дубликаты</p>
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
            <div className="py-4 text-sm text-neutral-500">Совпадения не найдены</div>
          ) : (
            <div className="space-y-2 mt-3">
              {filteredSuggestions.map(duplicate => {
                const selected = selectedId === duplicate.id;
                const dupScore = profileCompleteness(duplicate as any);
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
                          {duplicate.full_name || (duplicate as any).username || duplicate.email || duplicate.phone || 'Участник'}
                        </div>
                        <div className="text-xs text-neutral-500 space-x-2 mt-1">
                          {duplicate.email && <span>Email: {duplicate.email}</span>}
                          {duplicate.phone && <span>Телефон: {duplicate.phone}</span>}
                          {(duplicate as any).username && <span>Username: @{(duplicate as any).username}</span>}
                          {duplicate.tg_user_id && <span>ID: {duplicate.tg_user_id}</span>}
                        </div>
                        <div className="text-xs text-neutral-400 mt-1 flex items-center gap-2">
                          <span>Полнота: {dupScore}%</span>
                          {dupScore > currentScore && (
                            <span className="text-orange-500 font-medium">↑ полнее текущего</span>
                          )}
                        </div>
                        {typeof duplicate.match_score === 'number' && (
                          <div className="text-xs text-neutral-500 mt-1">
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
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 mt-2">
              {error}
            </div>
          )}

          {mergeDirectionWarning && (
            <div className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700 mt-2">
              {mergeDirectionWarning}
            </div>
          )}

          {selectedId && !mergeDirectionWarning && (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 mt-2">
              Выбран участник для объединения. Текущий профиль останется основным, выбранный будет поглощён.
            </div>
          )}

          <div className="flex justify-end gap-2 mt-3">
            <Button onClick={handleMerge} disabled={pending || !selectedId}>
              {pending ? 'Объединение…' : 'Объединить выбранного участника'}
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Объединение необратимо — предварительно убедитесь, что оба профиля принадлежат одному человеку. Используйте кнопку «Открепить» выше, если нужно отменить прошлое объединение.
          </p>
        </div>

      </CardContent>
    </Card>
  );
}
