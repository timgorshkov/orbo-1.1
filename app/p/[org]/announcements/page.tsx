import { redirect } from 'next/navigation';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import AnnouncementsClient from './announcements-client';

export default async function AnnouncementsPage({
  params
}: {
  params: Promise<{ org: string }>
}) {
  const { org: orgId } = await params;
  const supabase = createAdminServer();

  // Проверяем авторизацию
  const user = await getUnifiedUser();
  if (!user) {
    redirect(`/signin?redirect=/p/${orgId}/announcements`);
  }

  // Определяем роль (с фолбэком на суперадмина)
  const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
  const access = await getEffectiveOrgRole(user.id, orgId);

  const role = access?.role || 'guest';

  // Только owner и admin могут видеть раздел анонсов
  if (role !== 'owner' && role !== 'admin') {
    redirect(`/p/${orgId}`);
  }

  return <AnnouncementsClient orgId={orgId} />;
}
