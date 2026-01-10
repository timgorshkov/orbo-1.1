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
    
    // Get summary statistics - RPC returns a single row, not an array
    const { data: summaryData, error: summaryError } = await adminSupabase
      .rpc('get_qualification_summary');
    
    if (summaryError) {
      logger.error({ error: summaryError.message }, 'Error fetching qualification summary');
    }
    
    // RPC returns a single object, not an array
    const summary = Array.isArray(summaryData) ? summaryData[0] : summaryData;

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
      .limit(100); // Fetch more to filter out test users

    if (recentError) {
      logger.error({ error: recentError.message }, 'Error fetching recent qualifications');
    }

    // Get detailed user info for the qualifications
    const userIds = recentQualifications?.map(q => q.user_id) || [];
    const userInfoMap: Record<string, UserInfo & { is_test?: boolean }> = {};
    
    if (userIds.length > 0) {
      // 1. Get emails from local users table (including is_test) and accounts table
      const [{ data: localUsers }, { data: accounts }] = await Promise.all([
        adminSupabase
          .from('users')
          .select('id, email, name, is_test')
          .in('id', userIds),
        adminSupabase
          .from('accounts')
          .select('user_id, provider, provider_account_id')
          .in('user_id', userIds)
          .in('provider', ['email', 'google', 'yandex'])
      ]);
      
      localUsers?.forEach(u => {
        userInfoMap[u.id] = {
          email: u.email || undefined,
          name: u.name || undefined,
          is_test: u.is_test || false,
        };
      });
      
      // Add emails from accounts table (for users without email in users table)
      accounts?.forEach(acc => {
        if (acc.provider === 'email' && acc.provider_account_id) {
          const existing = userInfoMap[acc.user_id] || {};
          if (!existing.email) {
            userInfoMap[acc.user_id] = {
              ...existing,
              email: acc.provider_account_id,
            };
          }
        }
      });
      
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

    // Enrich qualifications with readable labels and user info (include test users but mark them)
    const enrichedQualifications = recentQualifications
      ?.map(q => {
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
          is_test: userInfo.is_test || false,
          responses_readable: enrichResponses(q.responses),
        };
      })
      // Sort: non-test users first, then test users
      .sort((a, b) => (a.is_test ? 1 : 0) - (b.is_test ? 1 : 0))
      .slice(0, 50)

    return NextResponse.json({
      summary: summary || {
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

