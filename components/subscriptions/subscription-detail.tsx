'use client'

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, Ban, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Subscription {
  id: string;
  participant?: {
    full_name: string;
    username?: string;
    photo_url?: string;
  };
  plan_name: string;
  amount: number;
  currency: string;
  billing_period: string;
  status: 'pending' | 'active' | 'expired' | 'cancelled';
  start_date: string;
  end_date?: string;
  next_billing_date?: string;
  notes?: string;
  created_at: string;
}

interface SubscriptionDetailProps {
  orgId: string;
  subscriptionId: string;
}

export function SubscriptionDetail({ orgId, subscriptionId }: SubscriptionDetailProps) {
  const router = useRouter();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchSubscription();
  }, [orgId, subscriptionId]);

  const fetchSubscription = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/subscriptions?orgId=${orgId}`);
      
      if (!res.ok) {
        throw new Error('Failed to fetch subscription');
      }
      
      const data = await res.json();
      const sub = data.subscriptions.find((s: Subscription) => s.id === subscriptionId);
      
      if (!sub) {
        throw new Error('Subscription not found');
      }
      
      setSubscription(sub);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch subscription');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Вы уверены, что хотите отменить подписку?')) {
      return;
    }

    setActionLoading(true);

    try {
      const res = await fetch('/api/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: subscriptionId,
          orgId,
          status: 'cancelled',
          endDate: new Date().toISOString().split('T')[0],
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to cancel subscription');
      }

      router.refresh();
      fetchSubscription();
    } catch (error: any) {
      alert(error.message || 'Не удалось отменить подписку');
    } finally {
      setActionLoading(false);
    }
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

  if (error || !subscription) {
    return (
      <Card className="border-red-200">
        <CardContent className="py-8">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-3" />
            <p className="text-red-600">{error || 'Подписка не найдена'}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = (status: Subscription['status']) => {
    const variants = {
      active: 'bg-green-100 text-green-800 border-green-200',
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      expired: 'bg-gray-100 text-gray-800 border-gray-200',
      cancelled: 'bg-red-100 text-red-800 border-red-200',
    };
    
    const labels = {
      active: 'Активная',
      pending: 'Ожидает',
      expired: 'Истекла',
      cancelled: 'Отменена',
    };
    
    return (
      <Badge variant="outline" className={variants[status]}>
        {labels[status]}
      </Badge>
    );
  };

  const formatBillingPeriod = (period: string) => {
    const labels: Record<string, string> = {
      monthly: 'Ежемесячно',
      quarterly: 'Ежеквартально',
      annual: 'Ежегодно',
      'one-time': 'Разовый',
    };
    return labels[period] || period;
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Детали подписки</CardTitle>
          </div>
          {subscription.status === 'active' && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleCancelSubscription}
              disabled={actionLoading}
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              <Ban className="h-4 w-4 mr-2" />
              Отменить подписку
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Participant Info */}
          <div>
            <h3 className="font-semibold text-sm text-neutral-600 mb-2">Участник</h3>
            <div className="flex items-center gap-3">
              {subscription.participant?.photo_url && (
                <img 
                  src={subscription.participant.photo_url} 
                  alt={subscription.participant.full_name}
                  className="h-12 w-12 rounded-full"
                />
              )}
              <div>
                <div className="font-medium text-lg">
                  {subscription.participant?.full_name || 'Unknown'}
                </div>
                {subscription.participant?.username && (
                  <div className="text-sm text-neutral-500">
                    @{subscription.participant.username}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Plan Info */}
          <div>
            <h3 className="font-semibold text-sm text-neutral-600 mb-2">План</h3>
            <div className="font-medium text-lg">{subscription.plan_name}</div>
            <div className="text-sm text-neutral-600 mt-1">
              {formatBillingPeriod(subscription.billing_period)}
            </div>
          </div>

          {/* Amount */}
          <div>
            <h3 className="font-semibold text-sm text-neutral-600 mb-2">Сумма</h3>
            <div className="font-bold text-2xl">
              {formatAmount(subscription.amount, subscription.currency)}
            </div>
          </div>

          {/* Status */}
          <div>
            <h3 className="font-semibold text-sm text-neutral-600 mb-2">Статус</h3>
            {getStatusBadge(subscription.status)}
          </div>

          {/* Dates */}
          <div>
            <h3 className="font-semibold text-sm text-neutral-600 mb-2">Даты</h3>
            <div className="space-y-1 text-sm">
              <div>
                <span className="text-neutral-600">Начало:</span>{' '}
                <span className="font-medium">
                  {new Date(subscription.start_date).toLocaleDateString('ru-RU')}
                </span>
              </div>
              {subscription.end_date && (
                <div>
                  <span className="text-neutral-600">Конец:</span>{' '}
                  <span className="font-medium">
                    {new Date(subscription.end_date).toLocaleDateString('ru-RU')}
                  </span>
                </div>
              )}
              {subscription.next_billing_date && (
                <div>
                  <span className="text-neutral-600">След. платёж:</span>{' '}
                  <span className="font-medium">
                    {new Date(subscription.next_billing_date).toLocaleDateString('ru-RU')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {subscription.notes && (
            <div className="md:col-span-2">
              <h3 className="font-semibold text-sm text-neutral-600 mb-2">Примечания</h3>
              <p className="text-sm text-neutral-700 whitespace-pre-wrap">
                {subscription.notes}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

