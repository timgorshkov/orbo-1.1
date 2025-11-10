import { Suspense } from 'react';
import { SubscriptionsTable } from '@/components/subscriptions/subscriptions-table';
import { CreateSubscriptionButton } from '@/components/subscriptions/create-subscription-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default function SubscriptionsPage({ params }: { params: { org: string } }) {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Подписки</h1>
          <p className="text-neutral-600 mt-2">
            Управление членскими взносами и подписками участников
          </p>
        </div>
        
        <CreateSubscriptionButton orgId={params.org} />
      </div>

      <Suspense fallback={<LoadingCard />}>
        <SubscriptionsTable orgId={params.org} />
      </Suspense>
    </div>
  );
}

function LoadingCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Загрузка...</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-neutral-200 rounded"></div>
          <div className="h-12 bg-neutral-200 rounded"></div>
          <div className="h-12 bg-neutral-200 rounded"></div>
        </div>
      </CardContent>
    </Card>
  );
}

