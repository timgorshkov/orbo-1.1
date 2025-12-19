import { redirect } from 'next/navigation';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import NotificationsList from '@/components/notifications/notifications-list';

export default async function NotificationsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  
  const supabase = await createClientServer();
  const adminSupabase = createAdminServer();

  // Проверяем авторизацию
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect(`/p/${orgId}/auth`);
  }

  // Проверяем роль (только owner/admin)
  const { data: membership } = await adminSupabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    redirect(`/p/${orgId}/dashboard`);
  }

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

