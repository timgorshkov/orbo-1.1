'use client'

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface RecordPaymentButtonProps {
  orgId: string;
  subscriptionId: string;
}

export function RecordPaymentButton({ orgId, subscriptionId }: RecordPaymentButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('bank_transfer');
  const [paymentMethodDetails, setPaymentMethodDetails] = useState('');
  const [status, setStatus] = useState<'pending' | 'confirmed'>('confirmed');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!amount || !paymentMethod) {
      alert('Пожалуйста, заполните все обязательные поля');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          subscriptionId,
          paymentType: 'subscription',
          amount: parseFloat(amount),
          currency: 'RUB',
          paymentMethod,
          paymentMethodDetails: paymentMethodDetails || undefined,
          status,
          paidAt: status === 'confirmed' ? `${paidAt}T00:00:00Z` : undefined,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to record payment');
      }

      // Success - close dialog and refresh
      setOpen(false);
      router.refresh();
    } catch (error: any) {
      alert(error.message || 'Не удалось записать платёж');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setAmount('');
    setPaymentMethod('bank_transfer');
    setPaymentMethodDetails('');
    setStatus('confirmed');
    setPaidAt(new Date().toISOString().split('T')[0]);
    setNotes('');
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Записать платёж
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <div>
            <h3 className="text-lg font-semibold">Новый платёж</h3>
            <p className="text-sm text-neutral-500 mt-1">
              Запишите платёж по подписке. Отметьте как подтверждённый, если платёж уже получен.
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

          {/* Payment Method */}
          <div>
            <label htmlFor="paymentMethod" className="text-sm font-medium block mb-2">
              Способ оплаты *
            </label>
            <select
              id="paymentMethod"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="bank_transfer">Банковский перевод</option>
              <option value="card">Карта</option>
              <option value="cash">Наличные</option>
              <option value="online">Онлайн</option>
              <option value="other">Другое</option>
            </select>
          </div>

          {/* Payment Method Details */}
          <div>
            <label htmlFor="paymentMethodDetails" className="text-sm font-medium block mb-2">
              Детали способа оплаты
            </label>
            <Input
              id="paymentMethodDetails"
              value={paymentMethodDetails}
              onChange={(e) => setPaymentMethodDetails(e.target.value)}
              placeholder="Например: Карта Сбербанк *1234"
            />
          </div>

          {/* Status */}
          <div>
            <label htmlFor="status" className="text-sm font-medium block mb-2">
              Статус *
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'pending' | 'confirmed')}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="confirmed">Подтверждён</option>
              <option value="pending">Ожидает подтверждения</option>
            </select>
          </div>

          {/* Paid At (if confirmed) */}
          {status === 'confirmed' && (
            <div>
              <label htmlFor="paidAt" className="text-sm font-medium block mb-2">
                Дата оплаты
              </label>
              <Input
                id="paidAt"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
          )}

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
              Записать платёж
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

