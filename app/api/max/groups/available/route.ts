import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

/**
 * GET /api/max/groups/available?orgId=...
 * Returns MAX groups where the bot is connected but NOT yet linked to this org.
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/max/groups/available' });

  try {
    const orgId = request.nextUrl.searchParams.get('orgId');
    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 });
    }

    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminServer();

    // Get chat IDs already linked to this org
    const { data: linkedLinks } = await admin
      .from('org_max_groups')
      .select('max_chat_id')
      .eq('org_id', orgId)
      .eq('status', 'active');

    const linkedChatIds = (linkedLinks || []).map(l => l.max_chat_id);

    // Fetch connected groups not yet linked
    let query = admin
      .from('max_groups')
      .select('id, max_chat_id, title, bot_status, member_count, last_sync_at')
      .eq('bot_status', 'connected');

    if (linkedChatIds.length > 0) {
      query = query.not('max_chat_id', 'in', `(${linkedChatIds.join(',')})`);
    }

    const { data: groups, error } = await query;

    if (error) {
      logger.error({ error: error.message }, 'Error fetching available MAX groups');
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({ groups: groups || [] });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error in available MAX groups');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
