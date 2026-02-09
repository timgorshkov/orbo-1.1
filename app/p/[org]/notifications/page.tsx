import { redirect } from 'next/navigation';
import { createAdminServer } from '@/lib/server/supabaseServer';
import NotificationsList from '@/components/notifications/notifications-list';
import type { Metadata } from 'next';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

// Disable OG image for notification links in Telegram
export const metadata: Metadata = {
  title: 'Уведомления',
  description: 'Уведомления о событиях в сообществе',
  openGraph: {
    title: 'Уведомления · Orbo',
    description: 'Уведомления о событиях в сообществе',
    images: [], // No OG image
  },
  twitter: {
    card: 'summary',
    images: [], // No image
  },
};

export default async function NotificationsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  
  const adminSupabase = createAdminServer();

  // Проверяем авторизацию через unified auth (поддержка Supabase и NextAuth)
  const user = await getUnifiedUser();
  
  if (!user) {
    redirect(`/p/${orgId}/auth`);
  }

  // Проверяем роль (только owner/admin, с фолбэком на суперадмина)
  const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
  const access = await getEffectiveOrgRole(user.id, orgId);

  if (!access || !['owner', 'admin'].includes(access.role)) {
    redirect(`/p/${orgId}/dashboard`);
  }
  const membership = { role: access.role };

  // Получаем название организации
  const { data: org } = await adminSupabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single();

  return (
    <div className="p-6 space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Уведомления</h1>
        <p className="text-neutral-600 mt-1">
          Уведомления о важных событиях в {org?.name || 'вашем сообществе'}
        </p>
      </div>

      <NotificationsList orgId={orgId} />
    </div>
  );
}

