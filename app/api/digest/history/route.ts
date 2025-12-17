/**
 * API: Digest History
 * 
 * Get history of sent digests for an organization
 * GET /api/digest/history?orgId=xxx&limit=10
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
    const limit = parseInt(searchParams.get('limit') || '10');

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

    // Fetch digest history from openai_api_logs
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('openai_api_logs')
      .select('*')
      .eq('org_id', orgId)
      .eq('request_type', 'weekly_digest')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (logsError) {
      return NextResponse.json(
        { error: 'Failed to fetch history', message: logsError.message },
        { status: 500 }
      );
    }

    const history = (logs || []).map(log => ({
      id: log.id,
      sentAt: log.created_at,
      costUsd: log.cost_usd,
      costRub: log.cost_rub,
      metadata: log.metadata
    }));

    // Get org's last_digest_sent_at for status
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('last_digest_sent_at, digest_enabled, digest_day, digest_time')
      .eq('id', orgId)
      .single();

    return NextResponse.json({
      history,
      settings: {
        enabled: org?.digest_enabled || false,
        day: org?.digest_day || 1,
        time: org?.digest_time || '09:00:00',
        lastSentAt: org?.last_digest_sent_at
      }
    });

  } catch (error) {
    console.error('[API] Digest history error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

