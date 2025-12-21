import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { logger } from '@/lib/logger';
import { RESPONSE_LABELS } from '@/lib/qualification/config';

// GET - Get qualification statistics and recent responses
export async function GET(request: NextRequest) {
  try {
    const adminSupabase = createAdminServer();
    
    // Get summary statistics
    const { data: summaryData } = await adminSupabase
      .rpc('get_qualification_summary');

    // Get recent qualifications with user info
    const { data: recentQualifications, error: recentError } = await adminSupabase
      .from('user_qualification_responses')
      .select(`
        id,
        user_id,
        responses,
        form_version,
        completed_at,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (recentError) {
      logger.error({ error: recentError.message }, 'Error fetching recent qualifications');
    }

    // Get user emails for the qualifications
    const userIds = recentQualifications?.map(q => q.user_id) || [];
    let userEmails: Record<string, string> = {};
    
    if (userIds.length > 0) {
      const { data: users } = await adminSupabase
        .from('user_telegram_accounts')
        .select('user_id, first_name, last_name')
        .in('user_id', userIds);
      
      // Also try to get emails from auth.users via RPC if available
      // For now, use telegram names as fallback
      users?.forEach(u => {
        userEmails[u.user_id] = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.user_id;
      });
    }

    // Enrich qualifications with readable labels
    const enrichedQualifications = recentQualifications?.map(q => ({
      ...q,
      user_display: userEmails[q.user_id] || q.user_id,
      responses_readable: enrichResponses(q.responses),
    }));

    return NextResponse.json({
      summary: summaryData?.[0] || {
        total_users: 0,
        completed_qualification: 0,
        completion_rate: 0,
        responses_by_field: {},
      },
      recent: enrichedQualifications || [],
      labels: RESPONSE_LABELS,
    });
  } catch (error) {
    logger.error({ error }, 'Error in qualification stats GET');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function enrichResponses(responses: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(responses)) {
    const labels = RESPONSE_LABELS[key];
    if (labels) {
      if (Array.isArray(value)) {
        result[key] = value.map(v => labels[v] || v).join(', ');
      } else if (typeof value === 'string') {
        result[key] = labels[value] || value;
      }
    } else {
      result[key] = String(value);
    }
  }
  
  return result;
}

