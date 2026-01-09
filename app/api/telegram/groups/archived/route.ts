/**
 * API: Get Archived Telegram Groups for Organization
 * 
 * GET - Returns list of archived groups that can be restored
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { getUserRoleInOrg } from '@/lib/auth/getUserRole';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'telegram/groups/archived' });
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const orgId = url.searchParams.get('orgId');
    
    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
    }

    // Check user role
    const role = await getUserRoleInOrg(user.id, orgId);
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminServer();

    // Get archived mappings for this org
    const { data: archivedMappings, error: mappingError } = await supabase
      .from('org_telegram_groups')
      .select('tg_chat_id, archived_at, archived_reason')
      .eq('org_id', orgId)
      .eq('status', 'archived')
      .order('archived_at', { ascending: false });

    if (mappingError) {
      logger.error({ error: mappingError.message, org_id: orgId }, 'Error fetching archived mappings');
      return NextResponse.json({ error: mappingError.message }, { status: 500 });
    }

    if (!archivedMappings || archivedMappings.length === 0) {
      return NextResponse.json({ groups: [] });
    }

    // Get group details
    const chatIds = archivedMappings.map(m => m.tg_chat_id);
    const { data: groups, error: groupsError } = await supabase
      .from('telegram_groups')
      .select('tg_chat_id, title, bot_status, is_archived, archived_reason')
      .in('tg_chat_id', chatIds);

    if (groupsError) {
      logger.error({ error: groupsError.message }, 'Error fetching group details');
      return NextResponse.json({ error: groupsError.message }, { status: 500 });
    }

    // Merge data
    const groupsMap = new Map(groups?.map(g => [String(g.tg_chat_id), g]) || []);
    
    const result = archivedMappings.map(mapping => {
      const group = groupsMap.get(String(mapping.tg_chat_id));
      return {
        tg_chat_id: String(mapping.tg_chat_id),
        title: group?.title || `Group ${mapping.tg_chat_id}`,
        bot_status: group?.bot_status || 'unknown',
        archived_at: mapping.archived_at,
        archived_reason: mapping.archived_reason || group?.archived_reason || 'unknown',
        can_restore: group?.bot_status !== 'inactive' // Can try to restore if bot might still be there
      };
    });

    logger.debug({ org_id: orgId, count: result.length }, 'Fetched archived groups');

    return NextResponse.json({ groups: result });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, 'Error fetching archived groups');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
