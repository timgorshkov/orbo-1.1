'use client'

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Eye, 
  Edit, 
  Ban, 
  CheckCircle2,
  AlertCircle 
} from 'lucide-react';
import Link from 'next/link';

interface Subscription {
  id: string;
  org_id: string;
  participant_id: string;
  participant?: {
    id: string;
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

interface SubscriptionsTableProps {
  orgId: string;
}

export function SubscriptionsTable({ orgId }: SubscriptionsTableProps) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscriptions();
  }, [orgId]);

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/subscriptions?orgId=${orgId}`);
      
      if (!res.ok) {
        throw new Error('Failed to fetch subscriptions');
      }
      
      const data = await res.json();
      setSubscriptions(data.subscriptions || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch subscriptions');
    } finally {
      setLoading(false);
    }
  };

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
            <Button onClick={fetchSubscriptions} className="mt-4" size="sm">
              Попробовать снова
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <CheckCircle2 className="h-12 w-12 text-neutral-400 mx-auto mb-3" />
            <p className="text-neutral-600">Подписок пока нет</p>
            <p className="text-sm text-neutral-500 mt-2">
              Создайте первую подписку для участника
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Активные подписки ({subscriptions.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Участник</TableHead>
                <TableHead>План</TableHead>
                <TableHead>Сумма</TableHead>
                <TableHead>Период</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>След. платёж</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {subscription.participant?.photo_url && (
                        <img 
                          src={subscription.participant.photo_url} 
                          alt={subscription.participant.full_name}
                          className="h-8 w-8 rounded-full"
                        />
                      )}
                      <div>
                        <div className="font-medium">
                          {subscription.participant?.full_name || 'Unknown'}
                        </div>
                        {subscription.participant?.username && (
                          <div className="text-xs text-neutral-500">
                            @{subscription.participant.username}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{subscription.plan_name}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {formatAmount(subscription.amount, subscription.currency)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {formatBillingPeriod(subscription.billing_period)}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(subscription.status)}
                  </TableCell>
                  <TableCell>
                    {subscription.next_billing_date ? (
                      <div className="text-sm">
                        {new Date(subscription.next_billing_date).toLocaleDateString('ru-RU')}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-500">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/${orgId}/subscriptions/${subscription.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
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

