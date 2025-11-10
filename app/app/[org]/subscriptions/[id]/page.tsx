import { Suspense } from 'react';
import { SubscriptionDetail } from '@/components/subscriptions/subscription-detail';
import { PaymentsTable } from '@/components/subscriptions/payments-table';
import { RecordPaymentButton } from '@/components/subscriptions/record-payment-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function SubscriptionDetailPage({ 
  params 
}: { 
  params: { org: string; id: string } 
}) {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <Link href={`/${params.org}/subscriptions`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад к подпискам
          </Button>
        </Link>
      </div>

      <div className="space-y-6">
        {/* Subscription Details */}
        <Suspense fallback={<LoadingCard title="Детали подписки" />}>
          <SubscriptionDetail orgId={params.org} subscriptionId={params.id} />
        </Suspense>

        {/* Payments */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">История платежей</h2>
            <RecordPaymentButton orgId={params.org} subscriptionId={params.id} />
          </div>

          <Suspense fallback={<LoadingCard title="Платежи" />}>
            <PaymentsTable orgId={params.org} subscriptionId={params.id} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function LoadingCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-neutral-200 rounded"></div>
          <div className="h-8 bg-neutral-200 rounded"></div>
          <div className="h-8 bg-neutral-200 rounded"></div>
        </div>
      </CardContent>
    </Card>
  );
}

