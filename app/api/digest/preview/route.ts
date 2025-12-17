/**
 * API: Preview Weekly Digest
 * 
 * Get digest data without AI analysis (fast preview for UI)
 * GET /api/digest/preview?orgId=xxx&days=7
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { createClientServer } from '@/lib/server/supabaseServer';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
);

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClientServer();
    const searchParams = request.nextUrl.searchParams;
    const orgId = searchParams.get('orgId');
    const days = parseInt(searchParams.get('days') || '7');

    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 });
    }

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden: owner/admin only' }, { status: 403 });
    }

    // Fetch digest data (no AI, just raw data)
    const { data: digestData, error: rpcError } = await supabaseAdmin
      .rpc('generate_weekly_digest_data', { p_org_id: orgId });

    if (rpcError || !digestData) {
      return NextResponse.json(
        { error: 'Failed to generate preview', message: rpcError?.message },
        { status: 500 }
      );
    }

    // Get top contributors
    const { data: contributors } = await supabaseAdmin
      .rpc('get_top_contributors', {
        p_org_id: orgId,
        p_limit: 3,
        p_tg_chat_id: null
      });

    // Get org name
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();

    return NextResponse.json({
      orgName: org?.name || 'Организация',
      keyMetrics: digestData.key_metrics,
      topContributors: contributors?.slice(0, 3).map((c: any) => ({
        name: c.full_name || c.username || 'Участник',
        messages: c.current_week_score || 0,
        isNew: c.rank_label === 'NEW'
      })) || [],
      attentionZones: digestData.attention_zones,
      upcomingEvents: digestData.upcoming_events,
      aiAnalysisEligible: digestData.ai_analysis_eligible,
      messageCount: digestData.message_count
    });

  } catch (error) {
    console.error('[API] Digest preview error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

