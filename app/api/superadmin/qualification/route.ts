import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { logger } from '@/lib/logger';
import { RESPONSE_LABELS } from '@/lib/qualification/config';

interface UserInfo {
  email?: string;
  name?: string;
  telegram_username?: string;
  org_name?: string;
}

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

    // Get detailed user info for the qualifications
    const userIds = recentQualifications?.map(q => q.user_id) || [];
    const userInfoMap: Record<string, UserInfo> = {};
    
    if (userIds.length > 0) {
      // 1. Get emails from auth.users via admin API
      try {
        const { data: authUsers } = await adminSupabase.auth.admin.listUsers({
          perPage: 100,
        });
        
        authUsers?.users?.forEach(u => {
          if (userIds.includes(u.id)) {
            userInfoMap[u.id] = {
              email: u.email,
              name: u.user_metadata?.full_name || u.user_metadata?.name || undefined,
            };
          }
        });
      } catch (e) {
        logger.warn({ error: e }, 'Could not fetch auth users');
      }
      
      // 2. Get Telegram usernames
      const { data: telegramAccounts } = await adminSupabase
        .from('user_telegram_accounts')
        .select('user_id, telegram_username, telegram_first_name, telegram_last_name')
        .in('user_id', userIds);
      
      telegramAccounts?.forEach(ta => {
        const existing = userInfoMap[ta.user_id] || {};
        userInfoMap[ta.user_id] = {
          ...existing,
          telegram_username: ta.telegram_username || undefined,
          name: existing.name || [ta.telegram_first_name, ta.telegram_last_name].filter(Boolean).join(' ') || undefined,
        };
      });
      
      // 3. Get organization names (first org where user is owner/admin)
      const { data: memberships } = await adminSupabase
        .from('memberships')
        .select(`
          user_id,
          role,
          organizations (
            name
          )
        `)
        .in('user_id', userIds)
        .in('role', ['owner', 'admin'])
        .order('role', { ascending: true }); // owner first
      
      memberships?.forEach(m => {
        const existing = userInfoMap[m.user_id] || {};
        if (!existing.org_name) {
          const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
          userInfoMap[m.user_id] = {
            ...existing,
            org_name: org?.name || undefined,
          };
        }
      });
    }

    // Enrich qualifications with readable labels and user info
    const enrichedQualifications = recentQualifications?.map(q => {
      const userInfo = userInfoMap[q.user_id] || {};
      
      // Build display name: Name (email) or just email or just user_id
      let userDisplay = userInfo.name || '';
      if (userInfo.email) {
        userDisplay = userDisplay ? `${userDisplay} (${userInfo.email})` : userInfo.email;
      }
      if (!userDisplay) {
        userDisplay = q.user_id.slice(0, 8) + '...';
      }
      
      return {
        ...q,
        user_display: userDisplay,
        user_email: userInfo.email || null,
        user_name: userInfo.name || null,
        telegram_username: userInfo.telegram_username || null,
        org_name: userInfo.org_name || null,
        responses_readable: enrichResponses(q.responses),
      };
    });

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

