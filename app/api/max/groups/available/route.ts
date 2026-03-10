import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { createMaxService } from '@/lib/services/maxService';

/**
 * GET /api/max/groups/available?orgId=...
 * Returns MAX groups where the bot is connected, the current user is a member,
 * and the group is NOT yet linked to this org.
 *
 * Bug 1 fix: auto-discovers groups from MAX API (GET /chats) that aren't in DB yet
 * Bug 2 fix: filters groups by whether the requesting user is still a member
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

    // Get user's verified MAX account for THIS org specifically.
    // A user can have different MAX accounts per org (or none at all).
    // Without a verified account we cannot determine group membership, so return nothing.
    const { data: maxAccount } = await admin
      .from('user_max_accounts')
      .select('max_user_id')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .eq('is_verified', true)
      .maybeSingle();

    if (!maxAccount?.max_user_id) {
      // No verified MAX account for this org → nothing to show
      return NextResponse.json({ groups: [] });
    }

    // Auto-discover groups from MAX API that bot is already in but aren't in DB yet.
    // Only makes sense to do this when user has a verified account (= they can actually see results).
    try {
      const maxService = createMaxService('main');
      const chatsResult = await maxService.getChats({ count: 100 });

      if (chatsResult.ok && Array.isArray(chatsResult.data?.chats)) {
        for (const chat of chatsResult.data.chats) {
          if (!chat.chat_id || chat.type === 'dialog') continue;

          await admin
            .from('max_groups')
            .upsert({
              max_chat_id: chat.chat_id,
              title: chat.title || `MAX Group ${chat.chat_id}`,
              bot_status: 'connected',
              member_count: chat.participants_count ?? null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'max_chat_id', ignoreDuplicates: true });
        }
        logger.debug({ count: chatsResult.data.chats.length }, 'Auto-discovered MAX chats from API');
      }
    } catch (discoverErr: any) {
      logger.warn({ error: discoverErr.message }, 'Failed to auto-discover MAX groups from API');
    }

    // Get chat IDs already linked to this org
    const { data: linkedLinks } = await admin
      .from('org_max_groups')
      .select('max_chat_id')
      .eq('org_id', orgId)
      .eq('status', 'active');

    const linkedChatIds = (linkedLinks || []).map(l => l.max_chat_id);

    // Fetch connected groups not yet linked to this org
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

    let filteredGroups = groups || [];

    // Mandatory membership filter: only show groups where this user is actually a member.
    // We already know maxAccount.max_user_id exists (checked above).
    if (filteredGroups.length > 0) {
      try {
        const maxService = createMaxService('main');
        const membershipResults = await Promise.all(
          filteredGroups.map(async (group) => {
            try {
              const result = await maxService.getChatMember(group.max_chat_id, maxAccount.max_user_id);
              // 200 = user is a member; 4xx = not a member or group not found
              return result.ok ? group : null;
            } catch {
              // On unexpected API error, exclude the group (fail-safe: don't leak other orgs' groups)
              return null;
            }
          })
        );
        filteredGroups = membershipResults.filter(Boolean) as typeof filteredGroups;
        logger.debug({
          total: (groups || []).length,
          after_filter: filteredGroups.length,
          max_user_id: maxAccount.max_user_id,
        }, 'Filtered available MAX groups by user membership');
      } catch (membershipErr: any) {
        logger.warn({ error: membershipErr.message }, 'Failed to filter groups by membership, returning empty for safety');
        // Fail-safe: return empty rather than leaking potentially wrong groups
        filteredGroups = [];
      }
    }

    return NextResponse.json({ groups: filteredGroups });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error in available MAX groups');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
