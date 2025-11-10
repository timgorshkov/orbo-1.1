'use client'

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Payment {
  id: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_method_details?: string;
  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  due_date?: string;
  paid_at?: string;
  notes?: string;
  receipt_url?: string;
  created_at: string;
}

interface PaymentsTableProps {
  orgId: string;
  subscriptionId: string;
}

export function PaymentsTable({ orgId, subscriptionId }: PaymentsTableProps) {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPayments();
  }, [orgId, subscriptionId]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/payments?orgId=${orgId}&subscriptionId=${subscriptionId}`);
      
      if (!res.ok) {
        throw new Error('Failed to fetch payments');
      }
      
      const data = await res.json();
      setPayments(data.payments || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch payments');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsConfirmed = async (paymentId: string) => {
    try {
      const res = await fetch('/api/payments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: paymentId,
          orgId,
          status: 'confirmed',
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to mark payment as confirmed');
      }

      router.refresh();
      fetchPayments();
    } catch (error: any) {
      alert(error.message || 'Не удалось подтвердить платёж');
    }
  };

  const getStatusBadge = (status: Payment['status']) => {
    const variants = {
      confirmed: 'bg-green-100 text-green-800 border-green-200',
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      failed: 'bg-red-100 text-red-800 border-red-200',
      refunded: 'bg-gray-100 text-gray-800 border-gray-200',
    };
    
    const labels = {
      confirmed: 'Подтверждён',
      pending: 'Ожидает',
      failed: 'Не прошёл',
      refunded: 'Возвращён',
    };
    
    return (
      <Badge variant="outline" className={variants[status]}>
        {labels[status]}
      </Badge>
    );
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatPaymentMethod = (method: string) => {
    const labels: Record<string, string> = {
      bank_transfer: 'Банковский перевод',
      card: 'Карта',
      cash: 'Наличные',
      online: 'Онлайн',
      other: 'Другое',
    };
    return labels[method] || method;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-neutral-600">Загрузка...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="py-8">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-3" />
            <p className="text-red-600">{error}</p>
            <Button onClick={fetchPayments} className="mt-4" size="sm">
              Попробовать снова
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (payments.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <Clock className="h-12 w-12 text-neutral-400 mx-auto mb-3" />
            <p className="text-neutral-600">Платежей пока нет</p>
            <p className="text-sm text-neutral-500 mt-2">
              Запишите первый платёж для этой подписки
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate total
  const totalPaid = payments
    .filter(p => p.status === 'confirmed')
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Summary */}
        <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="text-sm text-green-700">
            Всего получено:{' '}
            <span className="font-bold text-lg">
              {formatAmount(totalPaid, payments[0]?.currency || 'RUB')}
            </span>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Сумма</TableHead>
                <TableHead>Способ оплаты</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Срок оплаты</TableHead>
                <TableHead>Оплачено</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    <div className="font-medium">
                      {formatAmount(payment.amount, payment.currency)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium text-sm">
                        {formatPaymentMethod(payment.payment_method)}
                      </div>
                      {payment.payment_method_details && (
                        <div className="text-xs text-neutral-500">
                          {payment.payment_method_details}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(payment.status)}
                  </TableCell>
                  <TableCell>
                    {payment.due_date ? (
                      <div className="text-sm">
                        {new Date(payment.due_date).toLocaleDateString('ru-RU')}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-500">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {payment.paid_at ? (
                      <div className="text-sm">
                        {new Date(payment.paid_at).toLocaleDateString('ru-RU')}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-500">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {payment.status === 'pending' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleMarkAsConfirmed(payment.id)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Подтвердить
                        </Button>
                      )}
                      {payment.receipt_url && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => window.open(payment.receipt_url, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

