import { requireOrgAccess } from '@/lib/orgGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createAdminServer } from '@/lib/server/supabaseServer';
import Link from 'next/link';
import { createServiceLogger } from '@/lib/logger';
import MaxGroupsClient from './max-groups-client';

export default async function MaxGroupsPage({ params }: { params: Promise<{ org: string }> }) {
  const logger = createServiceLogger('MaxGroupsPage');

  try {
    const { org: orgId } = await params;
    const { supabase, role } = await requireOrgAccess(orgId);

    if (!['owner', 'admin'].includes(role)) {
      return (
        <div className="p-6">
          <h1 className="text-2xl font-semibold mb-4">MAX Группы</h1>
          <p className="text-gray-500">У вас нет доступа к управлению группами MAX.</p>
        </div>
      );
    }

    const adminSupabase = createAdminServer();

    // Get linked MAX groups
    const { data: orgGroupLinks, error: linksError } = await adminSupabase
      .from('org_max_groups')
      .select('max_chat_id, status, created_at')
      .eq('org_id', orgId);

    let groups: any[] = [];

    if (orgGroupLinks && !linksError && orgGroupLinks.length > 0) {
      const chatIds = orgGroupLinks.map(l => l.max_chat_id);
      const statusMap = new Map(orgGroupLinks.map(l => [String(l.max_chat_id), l.status]));

      const { data: maxGroups } = await adminSupabase
        .from('max_groups')
        .select('id, max_chat_id, title, bot_status, member_count, last_sync_at, created_at')
        .in('max_chat_id', chatIds);

      groups = (maxGroups || [])
        .map(g => ({
          ...g,
          link_status: statusMap.get(String(g.max_chat_id)) || 'active',
        }))
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    // Get available (unlinked) groups where bot is connected
    const linkedChatIds = groups.map(g => g.max_chat_id);
    let availableQuery = adminSupabase
      .from('max_groups')
      .select('id, max_chat_id, title, bot_status, member_count, created_at')
      .eq('bot_status', 'connected');

    if (linkedChatIds.length > 0) {
      availableQuery = availableQuery.not('max_chat_id', 'in', `(${linkedChatIds.join(',')})`);
    }

    const { data: availableGroups } = await availableQuery;

    return (
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">MAX Группы</h1>
              <p className="text-gray-500 text-sm mt-1">
                Управление группами мессенджера MAX, привязанными к организации
              </p>
            </div>
            <Link href={`/p/${orgId}/telegram`}>
              <Button variant="outline" size="sm">
                Telegram группы
              </Button>
            </Link>
          </div>
        </div>

        <MaxGroupsClient
          orgId={orgId}
          linkedGroups={groups}
          availableGroups={availableGroups || []}
        />
      </div>
    );
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error loading MAX groups page');
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">MAX Группы</h1>
        <p className="text-red-500">Ошибка загрузки страницы</p>
      </div>
    );
  }
}
