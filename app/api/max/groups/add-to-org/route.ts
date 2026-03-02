import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer, createClientServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { createMaxService } from '@/lib/services/maxService';

/**
 * POST /api/max/groups/add-to-org
 * Links a MAX group (where the bot is already added) to an organization.
 * Body: { org_id: string, max_chat_id: number }
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/max/groups/add-to-org' });

  try {
    const supabase = createClientServer();
    const { data: { user } } = await supabase.auth.getUser();
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
      .from('organization_members')
      .select('role')
      .eq('organization_id', org_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
