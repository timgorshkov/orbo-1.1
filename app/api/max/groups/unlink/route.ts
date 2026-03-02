import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/max/groups/unlink
 * Soft-unlink a MAX group from an org (sets status = 'archived').
 * Body: { orgId: string, chatId: string }
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/max/groups/unlink' });

  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { orgId, chatId } = body;

    if (!orgId || !chatId) {
      return NextResponse.json({ error: 'orgId and chatId required' }, { status: 400 });
    }

    const db = createAdminServer();

    // Check admin access
    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess');
    const access = await getEffectiveOrgRole(user.id, orgId);
    if (!access || !['owner', 'admin'].includes(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Set status = 'archived'
    const { error } = await db
      .from('org_max_groups')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('max_chat_id', String(chatId));

    if (error) {
      logger.error({ error: error.message, org_id: orgId, chat_id: chatId }, 'Failed to unlink MAX group');
      return NextResponse.json({ error: 'Не удалось отвязать группу' }, { status: 500 });
    }

    logger.info({ org_id: orgId, chat_id: chatId, user_id: user.id }, 'MAX group unlinked');

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error unlinking MAX group');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
