import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const logger = createAPILogger(req, { endpoint: '/api/analytics/[orgId]/reactions-replies' });
  const orgId = params.orgId;
  try {
    const { searchParams } = new URL(req.url);
    const periodDays = parseInt(searchParams.get('periodDays') || '14');
    const tgChatId = searchParams.get('tgChatId');

    // Check authentication via unified auth
    const user = await getUnifiedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = createAdminServer();

    // Check org membership (with superadmin fallback)
    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
    const access = await getEffectiveOrgRole(user.id, orgId);

    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Call RPC function
    const { data, error } = await adminSupabase.rpc('get_reactions_replies_stats', {
      p_org_id: orgId,
      p_period_days: periodDays,
      p_tg_chat_id: tgChatId ? parseInt(tgChatId) : null
    });

    if (error) {
      logger.error({ 
        error: error.message,
        org_id: orgId,
        period_days: periodDays,
        tg_chat_id: tgChatId
      }, 'Error fetching reactions-replies');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // RPC returns array with single row, extract first element
    const stats = data && data.length > 0 ? data[0] : null;

    return NextResponse.json({ data: stats });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId
    }, 'Reactions-Replies error');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

