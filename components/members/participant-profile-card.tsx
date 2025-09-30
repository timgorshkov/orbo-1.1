'use client'

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { ParticipantDetailResult } from '@/lib/types/participant';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';

interface ParticipantProfileCardProps {
  orgId: string;
  detail: ParticipantDetailResult;
  onDetailUpdate?: (next?: ParticipantDetailResult) => void;
}

interface FieldState {
  full_name: string;
  username: string;
  email: string;
  phone: string;
  activity_score: number | null;
  risk_score: number | null;
  notes: string;
}

export default function ParticipantProfileCard({ orgId, detail, onDetailUpdate }: ParticipantProfileCardProps) {
  const participant = detail.participant;
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldState>({
    full_name: participant.full_name || '',
    username: participant.username || '',
    email: participant.email || '',
    phone: participant.phone || '',
    activity_score: participant.activity_score ?? null,
    risk_score: participant.risk_score ?? null,
    notes: (participant.traits_cache as any)?.notes || ''
  });

  const handleChange = (key: keyof FieldState, value: string) => {
    if (key === 'activity_score' || key === 'risk_score') {
      setFields(prev => ({
        ...prev,
        [key]: value === '' ? null : Number(value)
      }));
      return;
    }

    setFields(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSubmit = async () => {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/participants/${detail.requestedParticipantId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          full_name: fields.full_name,
          username: fields.username,
          email: fields.email,
          phone: fields.phone,
          activity_score: fields.activity_score,
          risk_score: fields.risk_score,
          traits_cache: {
            ...(participant.traits_cache || {}),
            notes: fields.notes
          }
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Не удалось обновить профиль');
      }

      const data = await response.json();
      setEditing(false);
      if (data?.detail && onDetailUpdate) {
        onDetailUpdate(data.detail);
      }
    } catch (err: any) {
      setError(err.message || 'Не удалось обновить профиль');
    } finally {
      setPending(false);
    }
  };

  const createdAt = participant.created_at ? format(new Date(participant.created_at), 'dd.MM.yyyy') : null;
  const lastActivity = participant.last_activity_at ? format(new Date(participant.last_activity_at), 'dd.MM.yyyy HH:mm') : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Профиль участника</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-neutral-500">Полное имя</label>
            <Input
              value={fields.full_name}
              onChange={e => handleChange('full_name', e.target.value)}
              disabled={!editing || pending}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-500">Username</label>
            <Input
              value={fields.username}
              onChange={e => handleChange('username', e.target.value)}
              disabled={!editing || pending}
              placeholder="telegram_username"
            />
          </div>
          <div>
            <label className="text-sm text-neutral-500">Email</label>
            <Input
              type="email"
              value={fields.email}
              onChange={e => handleChange('email', e.target.value)}
              disabled={!editing || pending}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-500">Телефон</label>
            <Input
              value={fields.phone}
              onChange={e => handleChange('phone', e.target.value)}
              disabled={!editing || pending}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-neutral-500">Activity score</label>
            <Input
              type="number"
              value={fields.activity_score ?? ''}
              onChange={e => handleChange('activity_score', e.target.value)}
              disabled={!editing || pending}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-500">Risk score</label>
            <Input
              type="number"
              value={fields.risk_score ?? ''}
              onChange={e => handleChange('risk_score', e.target.value)}
              disabled={!editing || pending}
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-neutral-500">Заметки</label>
          <Textarea
            value={fields.notes}
            onChange={e => handleChange('notes', e.target.value)}
            disabled={!editing || pending}
            rows={4}
          />
        </div>

        <div className="flex items-center gap-4 text-sm text-neutral-500">
          {participant.tg_user_id && (
            <span>ID: {participant.tg_user_id}</span>
          )}
          {createdAt && <span>Добавлен: {createdAt}</span>}
          {lastActivity && <span>Последняя активность: {lastActivity}</span>}
        </div>

        {detail.groups.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-neutral-700 mb-2">Группы</h3>
            <div className="space-y-2">
              {detail.groups.map(group => (
                <div key={group.tg_group_id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{group.title || `Группа ${group.tg_chat_id}`}</div>
                    <div className="text-xs text-neutral-500">ID: {group.tg_chat_id}</div>
                  </div>
                  <div className="text-xs text-neutral-500">
                    Статус: {group.is_active ? 'Активен' : 'Неактивен'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={pending}>
                Отмена
              </Button>
              <Button onClick={handleSubmit} disabled={pending}>
                {pending ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </>
          ) : (
            <Button onClick={() => setEditing(true)}>
              Редактировать
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
