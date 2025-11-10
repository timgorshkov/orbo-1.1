'use client'

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Participant {
  id: string;
  full_name: string;
  username?: string;
}

interface CreateSubscriptionButtonProps {
  orgId: string;
}

export function CreateSubscriptionButton({ orgId }: CreateSubscriptionButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  // Form state
  const [participantId, setParticipantId] = useState('');
  const [planName, setPlanName] = useState('');
  const [amount, setAmount] = useState('');
  const [billingPeriod, setBillingPeriod] = useState<string>('monthly');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      fetchParticipants();
    }
  }, [open]);

  const fetchParticipants = async () => {
    try {
      setLoadingParticipants(true);
      const res = await fetch(`/api/participants?orgId=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setParticipants(data.participants || []);
      }
    } catch (e) {
      console.error('Failed to fetch participants:', e);
    } finally {
      setLoadingParticipants(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!participantId || !planName || !amount || !billingPeriod || !startDate) {
      alert('Пожалуйста, заполните все обязательные поля');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          participantId,
          planName,
          amount: parseFloat(amount),
          currency: 'RUB',
          billingPeriod,
          startDate,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create subscription');
      }

      // Success - close dialog and refresh page
      setOpen(false);
      router.refresh();
    } catch (error: any) {
      alert(error.message || 'Не удалось создать подписку');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setParticipantId('');
    setPlanName('');
    setAmount('');
    setBillingPeriod('monthly');
    setStartDate(new Date().toISOString().split('T')[0]);
    setNotes('');
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Создать подписку
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <div>
            <h3 className="text-lg font-semibold">Новая подписка</h3>
            <p className="text-sm text-neutral-500 mt-1">
              Создайте подписку для участника. Все поля обязательны.
            </p>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              resetForm();
            }}
            className="p-1 hover:bg-neutral-100 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Participant */}
          <div>
            <label htmlFor="participant" className="text-sm font-medium block mb-2">
              Участник *
            </label>
            <select
              id="participant"
              value={participantId}
              onChange={(e) => setParticipantId(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={loadingParticipants}
            >
              <option value="">Выберите участника</option>
              {loadingParticipants ? (
                <option disabled>Загрузка...</option>
              ) : participants.length === 0 ? (
                <option disabled>Нет участников</option>
              ) : (
                participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} {p.username && `(@${p.username})`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Plan Name */}
          <div>
            <label htmlFor="planName" className="text-sm font-medium block mb-2">
              Название плана *
            </label>
            <Input
              id="planName"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="Например: Стандарт, VIP, Премиум"
              required
            />
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="amount" className="text-sm font-medium block mb-2">
              Сумма (₽) *
            </label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000"
              required
            />
          </div>

          {/* Billing Period */}
          <div>
            <label htmlFor="billingPeriod" className="text-sm font-medium block mb-2">
              Период оплаты *
            </label>
            <select
              id="billingPeriod"
              value={billingPeriod}
              onChange={(e) => setBillingPeriod(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="monthly">Ежемесячно</option>
              <option value="quarterly">Ежеквартально</option>
              <option value="annual">Ежегодно</option>
              <option value="one-time">Разовый платёж</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label htmlFor="startDate" className="text-sm font-medium block mb-2">
              Дата начала *
            </label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="text-sm font-medium block mb-2">
              Примечания
            </label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Дополнительная информация..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              disabled={loading}
              className="flex-1"
            >
              Отмена
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Создать подписку
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

