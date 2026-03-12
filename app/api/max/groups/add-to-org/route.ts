import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { createMaxService } from '@/lib/services/maxService';

/**
 * POST /api/max/groups/add-to-org
 * Links a MAX group (where the bot is already added) to an organization.
 * Body: { org_id: string, max_chat_id: number }
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/max/groups/add-to-org' });

  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { org_id, max_chat_id } = body;

    if (!org_id || !max_chat_id) {
      return NextResponse.json({ error: 'org_id and max_chat_id are required' }, { status: 400 });
    }

    const adminSupabase = createAdminServer();

    // Verify user is admin/owner of the org
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify user has a verified MAX account for THIS org.
    // Without it we cannot confirm the user is actually a member of the group.
    const { data: maxAccount } = await adminSupabase
      .from('user_max_accounts')
      .select('max_user_id')
      .eq('user_id', user.id)
      .eq('org_id', org_id)
      .eq('is_verified', true)
      .maybeSingle();

    if (!maxAccount?.max_user_id) {
      return NextResponse.json({
        error: 'Для привязки группы необходимо подключить и верифицировать MAX-аккаунт в этой организации',
      }, { status: 403 });
    }

    // Check if the group exists in max_groups (bot was added)
    const { data: maxGroup } = await adminSupabase
      .from('max_groups')
      .select('*')
      .eq('max_chat_id', max_chat_id)
      .maybeSingle();

    if (!maxGroup) {
      return NextResponse.json({
        error: 'Группа не найдена. Сначала добавьте бота в группу MAX.',
      }, { status: 404 });
    }

    if (maxGroup.bot_status !== 'connected') {
      return NextResponse.json({
        error: 'Бот неактивен в этой группе. Добавьте бота заново.',
      }, { status: 400 });
    }

    // Verify user is an admin of this MAX group via MAX API.
    try {
      const maxService = createMaxService('main');
      const adminsResult = await maxService.getChatAdmins(max_chat_id);

      logger.info({
        max_chat_id,
        max_user_id: maxAccount.max_user_id,
        api_ok: adminsResult.ok,
        api_status: adminsResult.status,
        raw_response: adminsResult.data,
        raw_error: adminsResult.error,
      }, '[MAX-ADMIN-CHECK] Raw response from GET /chats/{chatId}/members/admins');

      if (!adminsResult.ok) {
        if (adminsResult.status === 403) {
          logger.warn({
            max_chat_id,
            max_user_id: maxAccount.max_user_id,
          }, '[MAX-ADMIN-CHECK] Bot is not a group admin — skipping admin check (fail-open)');
        } else {
          logger.warn({
            max_chat_id,
            max_user_id: maxAccount.max_user_id,
            status: adminsResult.status,
            error: adminsResult.error,
          }, '[MAX-ADMIN-CHECK] Could not fetch admins list — blocking link attempt');
          return NextResponse.json({
            error: 'Не удалось проверить права администратора в группе MAX. Попробуйте позже.',
          }, { status: 503 });
        }
      }

      if (adminsResult.ok) {
        const admins: any[] = adminsResult.data?.members ?? adminsResult.data?.admins ?? [];
        const adminUserIds: number[] = admins.map((a: any) => {
          return Number(a.user_id ?? a.userId ?? a.id);
        }).filter((id: number) => !isNaN(id) && id > 0);

        // max_user_id from DB may be a string — compare as numbers
        const currentUserId = Number(maxAccount.max_user_id);

        logger.info({
          max_chat_id,
          max_user_id: maxAccount.max_user_id,
          admin_user_ids: adminUserIds,
          is_admin: adminUserIds.includes(currentUserId),
          raw_admins_count: admins.length,
        }, '[MAX-ADMIN-CHECK] Parsed admin list');

        if (!adminUserIds.includes(currentUserId)) {
          return NextResponse.json({
            error: 'Вы не являетесь администратором этой группы в MAX. Привязать группу могут только администраторы.',
          }, { status: 403 });
        }
      }
    } catch (adminCheckErr: any) {
      logger.error({
        max_chat_id,
        max_user_id: maxAccount.max_user_id,
        error: adminCheckErr.message,
      }, '[MAX-ADMIN-CHECK] Exception during admin check — blocking for safety');
      return NextResponse.json({
        error: 'Не удалось проверить права администратора. Попробуйте позже.',
      }, { status: 503 });
    }

    // Check if already linked
    const { data: existingLink } = await adminSupabase
      .from('org_max_groups')
      .select('id, status')
      .eq('org_id', org_id)
      .eq('max_chat_id', max_chat_id)
      .maybeSingle();

    if (existingLink) {
      if (existingLink.status === 'active') {
        return NextResponse.json({ error: 'Группа уже привязана к организации' }, { status: 409 });
      }
      // Reactivate
      await adminSupabase
        .from('org_max_groups')
        .update({ status: 'active', archived_at: null })
        .eq('id', existingLink.id);
    } else {
      // Create new link
      const { error: linkError } = await adminSupabase
        .from('org_max_groups')
        .insert({
          org_id,
          max_chat_id,
          created_by: user.id,
          status: 'active',
        });

      if (linkError) {
        logger.error({ error: linkError.message }, 'Failed to link MAX group to org');
        return NextResponse.json({ error: 'Ошибка привязки группы' }, { status: 500 });
      }
    }

    logger.info({ org_id, max_chat_id, title: maxGroup.title }, '✅ MAX group linked to org');

    return NextResponse.json({
      ok: true,
      group: {
        id: maxGroup.id,
        max_chat_id: maxGroup.max_chat_id,
        title: maxGroup.title,
        member_count: maxGroup.member_count,
        bot_status: maxGroup.bot_status,
      },
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error adding MAX group to org');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
