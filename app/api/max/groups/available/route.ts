import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { createMaxService } from '@/lib/services/maxService';

/**
 * GET /api/max/groups/available?orgId=...
 * Returns MAX groups where the bot is connected and the group is NOT yet linked to this org.
 *
 * Auto-discovers groups from MAX API (GET /chats) that aren't in DB yet.
 * Note: MAX API does not support GET /chats/{chatId}/members/{userId},
 * so user membership filtering is not possible. All bot-connected groups are shown.
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
    // Also marks groups the bot has left as inactive (keeps DB in sync with reality).
    // Only runs when user has a verified account (= they can actually see results).
    try {
      const maxService = createMaxService('main');
      const chatsResult = await maxService.getChats({ count: 100 });

      if (chatsResult.ok && Array.isArray(chatsResult.data?.chats)) {
        const liveChatIds: number[] = [];

        for (const chat of chatsResult.data.chats) {
          if (!chat.chat_id || chat.type === 'dialog') continue;
          liveChatIds.push(chat.chat_id);

          await admin
            .from('max_groups')
            .upsert({
              max_chat_id: chat.chat_id,
              title: chat.title || `MAX Group ${chat.chat_id}`,
              bot_status: 'connected',
              member_count: chat.participants_count ?? null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'max_chat_id' });
        }

        // Mark groups no longer in the bot's chat list as inactive
        if (liveChatIds.length > 0) {
          await admin
            .from('max_groups')
            .update({ bot_status: 'inactive', updated_at: new Date().toISOString() })
            .eq('bot_status', 'connected')
            .not('max_chat_id', 'in', `(${liveChatIds.join(',')})`);
        }

        logger.debug({ count: chatsResult.data.chats.length }, 'Auto-discovered MAX chats from API');
      }
    } catch (discoverErr: any) {
      logger.warn({ error: discoverErr.message }, 'Failed to auto-discover MAX groups from API');
    }

    // Get chat IDs already linked to THIS org (active) — these go into existingGroups, not availableGroups.
    // Groups linked to OTHER orgs are still shown as available: the same user can be
    // admin of the same group in multiple orgs (mirrors Telegram for-user logic).
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

    const groupList = groups || [];

    // Check bot admin status and user admin status for each group in parallel.
    // bot_is_admin=true   → bot can read admin list
    // bot_is_admin=false  → bot is a regular member; show a hint to promote it
    // bot_is_admin=null   → API error, unknown
    // user_is_admin=true  → current user is in the group's admin list
    // user_is_admin=false → current user is not an admin of this group
    // user_is_admin=null  → could not determine (bot not admin, API error)
    const currentUserId = Number(maxAccount.max_user_id);
    let groupsWithAdminStatus: Array<(typeof groupList)[0] & { bot_is_admin: boolean | null; user_is_admin: boolean | null }>;
    if (groupList.length > 0) {
      try {
        const maxService = createMaxService('main');
        groupsWithAdminStatus = await Promise.all(
          groupList.map(async (group) => {
            try {
              const result = await maxService.getChatAdmins(group.max_chat_id);
              if (!result.ok) {
                return { ...group, bot_is_admin: result.status === 403 ? false : null, user_is_admin: null };
              }
              const members: any[] = result.data?.members ?? result.data?.admins ?? [];
              const adminIds = members.map((a: any) => Number(a.user_id ?? a.userId ?? a.id)).filter((id: number) => !isNaN(id) && id > 0);
              return { ...group, bot_is_admin: true, user_is_admin: adminIds.includes(currentUserId) };
            } catch {
              return { ...group, bot_is_admin: null, user_is_admin: null };
            }
          })
        );
      } catch {
        groupsWithAdminStatus = groupList.map(g => ({ ...g, bot_is_admin: null, user_is_admin: null }));
      }
    } else {
      groupsWithAdminStatus = [];
    }

    // Only return groups where the current user is confirmed to be an admin.
    // user_is_admin=null means we couldn't determine it (bot not admin) — exclude those too,
    // since we can't verify the user's rights and they should not be able to claim the group.
    const adminGroups = groupsWithAdminStatus.filter(g => g.user_is_admin === true);

    return NextResponse.json({ groups: adminGroups });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error in available MAX groups');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
