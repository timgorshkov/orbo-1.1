import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { createMaxService } from '@/lib/services/maxService';

/**
 * POST /api/max/groups/sync
 * Sync members from a MAX group into the organization's participants.
 * Body: { org_id: string, max_chat_id: number }
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/max/groups/sync' });

  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { org_id, max_chat_id } = body;

    if (!org_id || !max_chat_id) {
      return NextResponse.json({ error: 'org_id and max_chat_id required' }, { status: 400 });
    }

    const adminSupabase = createAdminServer();

    // Verify admin
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify group is linked
    const { data: orgGroup } = await adminSupabase
      .from('org_max_groups')
      .select('id')
      .eq('org_id', org_id)
      .eq('max_chat_id', max_chat_id)
      .eq('status', 'active')
      .maybeSingle();

    if (!orgGroup) {
      return NextResponse.json({ error: 'Группа не привязана к организации' }, { status: 404 });
    }

    // Fetch members from MAX API
    let maxService: any;
    try {
      maxService = createMaxService('main');
    } catch {
      return NextResponse.json({ error: 'MAX Main bot not configured' }, { status: 500 });
    }

    // Получить ID бота, чтобы отфильтровать его из списка участников
    let botUserId: number | null = null;
    try {
      const meRes = await maxService.getMe();
      if (meRes.ok) botUserId = meRes.data?.user_id ?? null;
    } catch { /* ignore */ }

    let allMembers: any[] = [];
    let marker: number | undefined;
    let fetchError: string | null = null;

    // Paginated fetch
    for (let i = 0; i < 50; i++) {
      const result = await maxService.getChatMembers(max_chat_id, { marker, count: 100 });
      if (!result.ok || !result.data?.members) {
        // Первая страница не загрузилась → скорее всего бот не в группе или не админ
        if (i === 0) {
          fetchError = result.error?.message || result.error?.code || 'Не удалось получить список участников';
          // Обновить статус группы
          await adminSupabase
            .from('max_groups')
            .update({ bot_status: 'inactive', last_sync_at: new Date().toISOString() })
            .eq('max_chat_id', max_chat_id);
        }
        break;
      }
      allMembers = allMembers.concat(result.data.members);
      marker = result.data.marker;
      if (!marker) break;
    }

    // Если не удалось загрузить участников — сообщить об ошибке
    if (fetchError) {
      return NextResponse.json({
        ok: false,
        error: `Бот не смог получить список участников группы: ${fetchError}. Убедитесь, что бот добавлен в группу и назначен администратором.`,
        total: 0,
        synced: 0,
        skipped: 0,
      }, { status: 422 });
    }

    let synced = 0;
    let skipped = 0;

    for (const member of allMembers) {
      const maxUserId = member.user_id;
      const userName = member.name || `User ${maxUserId}`;
      const username = member.username || null;

      // Фильтр ботов: по флагу is_bot ИЛИ по user_id нашего бота
      if (member.is_bot || (botUserId && maxUserId === botUserId)) {
        skipped++;
        continue;
      }

      // Upsert participant
      const { data: existing } = await adminSupabase
        .from('participants')
        .select('id')
        .eq('org_id', org_id)
        .eq('max_user_id', maxUserId)
        .is('merged_into', null)
        .maybeSingle();

      if (existing) {
        await adminSupabase
          .from('participants')
          .update({ full_name: userName, max_username: username })
          .eq('id', existing.id);
        skipped++;
      } else {
        const { error: insertErr } = await adminSupabase
          .from('participants')
          .insert({
            org_id,
            max_user_id: maxUserId,
            full_name: userName,
            max_username: username,
            source: 'max_group_sync',
            participant_status: 'participant',
          });

        if (insertErr) {
          if (insertErr.code !== '23505') {
            logger.warn({ error: insertErr.message, max_user_id: maxUserId }, 'Failed to insert participant');
          }
          skipped++;
        } else {
          synced++;
        }
      }
    }

    // Update member count
    await adminSupabase
      .from('max_groups')
      .update({
        member_count: allMembers.length,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('max_chat_id', max_chat_id);

    logger.info({
      org_id, max_chat_id,
      total_fetched: allMembers.length,
      synced, skipped,
    }, '✅ MAX group members synced');

    return NextResponse.json({
      ok: true,
      total: allMembers.length,
      synced,
      skipped,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error syncing MAX group members');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
