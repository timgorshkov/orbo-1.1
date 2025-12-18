import { NextRequest, NextResponse } from 'next/server';
import { createClientServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const logger = createAPILogger(req, { endpoint: '/api/analytics/[orgId]/key-metrics' });
  const orgId = params.orgId;
  try {
    const { searchParams } = new URL(req.url);
    const periodDays = parseInt(searchParams.get('periodDays') || '14');
    const tgChatId = searchParams.get('tgChatId');

    // Check authentication
    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check org membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Call RPC function
    const { data, error } = await supabase.rpc('get_key_metrics', {
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
      }, 'Error fetching key metrics');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // RPC returns array with single row
    return NextResponse.json({ data: data[0] || null });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId
    }, 'Key metrics error');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

