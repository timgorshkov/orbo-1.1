import { requireSuperadmin } from '@/lib/server/superadminGuard';
import { TelegramHealthStatus } from '@/components/superadmin/telegram-health-status';
import { WebhookSetup } from '@/components/superadmin/webhook-setup';
import { NotificationHealth } from '@/components/superadmin/notification-health';

export default async function SuperadminTelegramPage() {
  await requireSuperadmin();
  
  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Telegram Integration</h1>
      
      {/* Notification System Health */}
      <div className="mb-8">
        <NotificationHealth />
      </div>
      
      {/* Webhook Setup */}
      <div className="mb-8">
        <WebhookSetup />
      </div>
      
      {/* Health Status */}
      <div>
        <TelegramHealthStatus />
      </div>
    </div>
  );
}

