import { NextRequest, NextResponse } from 'next/server';
import { createClientServer } from '@/lib/server/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  try {
    const { orgId } = params;
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
    const { data, error } = await supabase.rpc('get_reactions_replies_stats', {
      p_org_id: orgId,
      p_period_days: periodDays,
      p_tg_chat_id: tgChatId ? parseInt(tgChatId) : null
    });

    if (error) {
      console.error('[Analytics] Error fetching reactions-replies:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // RPC returns array with single row, extract first element
    const stats = data && data.length > 0 ? data[0] : null;

    return NextResponse.json({ data: stats });
  } catch (error: any) {
    console.error('[Analytics] Reactions-Replies error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

