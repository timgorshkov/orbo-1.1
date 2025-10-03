'use client';

import { useCallback, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface DuplicateMatch {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  username: string | null;
  match_score: number;
  reasons: string[];
}

type FormState = {
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  username: string;
  tg_user_id: string;
  source: string;
  status: string;
  notes: string;
};

const defaultState: FormState = {
  full_name: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  username: '',
  tg_user_id: '',
  source: 'manual',
  status: 'active',
  notes: ''
};

interface NewParticipantFormProps {
  orgId: string;
}

type CreatePayload = FormState & { orgId: string; force?: boolean };

export function NewParticipantForm({ orgId }: NewParticipantFormProps) {
  const [form, setForm] = useState<FormState>(defaultState);
  const [submitting, setSubmitting] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [duplicatesChecked, setDuplicatesChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedDuplicateId, setSelectedDuplicateId] = useState<string | null>(null);

  const hasContacts = useMemo(() => {
    return Boolean(form.email || form.phone || form.username || form.tg_user_id);
  }, [form.email, form.phone, form.username, form.tg_user_id]);

  const handleInput = useCallback((key: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setForm(defaultState);
    setDuplicates([]);
    setDuplicatesChecked(false);
    setSuccessMessage(null);
    setError(null);
    setSelectedDuplicateId(null);
  }, []);

  const buildPayload = useCallback(
    (override?: Partial<CreatePayload>): CreatePayload => ({
      orgId,
      ...form,
      ...override
    }),
    [form, orgId]
  );

  const checkDuplicates = useCallback(async () => {
    setError(null);
    setDuplicates([]);
    setDuplicatesChecked(true);

    try {
      const response = await fetch('/api/participants/check-duplicates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(buildPayload())
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || 'Не удалось проверить дубликаты');
      }

      const data = await response.json();
      const matches: DuplicateMatch[] = data?.matches || [];
      setDuplicates(matches);
      setSelectedDuplicateId(matches[0]?.id ?? null);
    } catch (err: any) {
      setError(err.message || 'Не удалось проверить дубликаты');
    }
  }, [buildPayload]);

  const submit = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      setSubmitting(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const response = await fetch('/api/participants/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(buildPayload({ force }))
        });

        const data = await response.json();

        if (!response.ok) {
          if (data?.duplicatesFound && data?.matches) {
            const matches: DuplicateMatch[] = data.matches;
            setDuplicates(matches);
            setDuplicatesChecked(true);
            setSelectedDuplicateId(matches[0]?.id ?? null);
            return;
          }
          throw new Error(data?.error || 'Не удалось создать участника');
        }

        setSuccessMessage('Участник успешно создан');
        setDuplicates([]);
        setDuplicatesChecked(false);
        setForm(defaultState);
        setSelectedDuplicateId(null);

        if (data?.participantId) {
          window.location.href = `/app/${orgId}/members/${data.participantId}`;
          return;
        }
      } catch (err: any) {
        setError(err.message || 'Не удалось создать участника');
      } finally {
        setSubmitting(false);
      }
    },
    [buildPayload]
  );

  const handleEnrich = useCallback(async () => {
    if (!selectedDuplicateId) {
      setError('Выберите участника для дополнения данных');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/participants/enrich', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          targetParticipantId: selectedDuplicateId,
          ...form
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось дополнить участника');
      }

      setSuccessMessage('Данные участника успешно дополнены');
      setDuplicates([]);
      setDuplicatesChecked(false);
      setSelectedDuplicateId(null);
      setForm(defaultState);
      if (data?.participantId) {
        window.location.href = `/app/${orgId}/members/${data.participantId}`;
        return;
      }
    } catch (err: any) {
      setError(err.message || 'Не удалось дополнить участника');
    } finally {
      setSubmitting(false);
    }
  }, [form, orgId, selectedDuplicateId]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const submitter = (event.nativeEvent as SubmitEvent)?.submitter as (HTMLButtonElement | null);
      const mode = submitter?.dataset?.mode ?? 'default';

      if (!duplicatesChecked) {
        await checkDuplicates();
        return;
      }

      if (duplicates.length > 0 && mode !== 'force') {
        setError('Выберите участника для дополнения или создайте нового участника.');
        return;
      }

      await submit({ force: mode === 'force' });
    },
    [checkDuplicates, duplicates.length, duplicatesChecked, submit]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-neutral-500">Полное имя</label>
          <Input
            value={form.full_name}
            onChange={event => handleInput('full_name', event.target.value)}
            placeholder="Иван Иванов"
          />
        </div>
        <div>
          <label className="text-sm text-neutral-500">Имя</label>
          <Input
            value={form.first_name}
            onChange={event => handleInput('first_name', event.target.value)}
            placeholder="Иван"
          />
        </div>
        <div>
          <label className="text-sm text-neutral-500">Фамилия</label>
          <Input
            value={form.last_name}
            onChange={event => handleInput('last_name', event.target.value)}
            placeholder="Иванов"
          />
        </div>
        <div>
          <label className="text-sm text-neutral-500">E-mail</label>
          <Input
            type="email"
            value={form.email}
            onChange={event => handleInput('email', event.target.value)}
            placeholder="user@example.com"
          />
        </div>
        <div>
          <label className="text-sm text-neutral-500">Телефон</label>
          <Input
            value={form.phone}
            onChange={event => handleInput('phone', event.target.value)}
            placeholder="+7..."
          />
        </div>
        <div>
          <label className="text-sm text-neutral-500">Telegram username</label>
          <Input
            value={form.username}
            onChange={event => handleInput('username', event.target.value)}
            placeholder="username"
          />
        </div>
        <div>
          <label className="text-sm text-neutral-500">Telegram ID</label>
          <Input
            value={form.tg_user_id}
            onChange={event => handleInput('tg_user_id', event.target.value)}
            placeholder="123456789"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-neutral-500">Источник</label>
            <Input value={form.source} onChange={event => handleInput('source', event.target.value)} />
          </div>
          <div>
            <label className="text-sm text-neutral-500">Статус</label>
            <Input value={form.status} onChange={event => handleInput('status', event.target.value)} />
          </div>
        </div>
      </div>

      <div>
        <label className="text-sm text-neutral-500">Заметки</label>
        <Textarea
          value={form.notes}
          onChange={event => handleInput('notes', event.target.value)}
          rows={4}
        />
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      {duplicates.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-4 space-y-4">
          <h3 className="text-sm font-medium text-amber-800">Найдены потенциальные дубликаты</h3>
          <div className="space-y-3">
            {duplicates.map(match => (
              <label
                key={match.id}
                className={`rounded border ${selectedDuplicateId === match.id ? 'border-amber-400 ring-2 ring-amber-200' : 'border-amber-200'} bg-white p-3 block cursor-pointer`}
                onClick={() => {
                  setSelectedDuplicateId(match.id);
                  setError(null);
                }}
              >
                <div className="flex items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="selectedDuplicate"
                    value={match.id}
                    checked={selectedDuplicateId === match.id}
                    onChange={() => {
                      setSelectedDuplicateId(match.id);
                      setError(null);
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium">
                      {match.full_name || match.username || match.email || match.phone || 'Участник'}
                    </div>
                    <div className="text-xs text-neutral-500 space-x-2 mt-1">
                      {match.email && <span>Email: {match.email}</span>}
                      {match.phone && <span>Телефон: {match.phone}</span>}
                      {match.username && <span>Username: @{match.username}</span>}
                    </div>
                    <div className="text-xs text-neutral-500 mt-2 flex items-start gap-2">
                      <span className="font-semibold">Совпадение: {match.match_score}%</span>
                      <ul className="space-y-1">
                        {match.reasons.map((reason, index) => (
                          <li key={index} className="text-neutral-400">{reason}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </label>
            ))}
          </div>
          {!selectedDuplicateId && (
            <p className="text-xs text-amber-700">
              Выберите участника, данные которого следует дополнить. Можно также создать нового участника вручную.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-3">
          {duplicates.length > 0 ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleEnrich}
                disabled={submitting || !selectedDuplicateId}
              >
                {submitting ? 'Дополнение…' : 'Дополнить выбранного участника'}
              </Button>
              <Button type="submit" data-mode="force" disabled={submitting}>
                {submitting ? 'Создание…' : 'Создать нового участника'}
              </Button>
            </>
          ) : (
            <Button type="submit" disabled={submitting}>
              {duplicatesChecked
                ? submitting
                  ? 'Создание…'
                  : 'Создать участника'
                : 'Проверить дубликаты'}
            </Button>
          )}
        </div>
        <Button type="button" variant="ghost" onClick={reset} disabled={submitting}>
          Сбросить
        </Button>
      </div>

      {!hasContacts && (
        <p className="text-xs text-neutral-500">
          Укажите хотя бы один контакт (email, телефон, username или Telegram ID) — это поможет избежать дубликатов.
        </p>
      )}
    </form>
  );
}

