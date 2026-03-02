import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer, createClientServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { createMaxService } from '@/lib/services/maxService';

/**
 * POST /api/max/groups/sync
 * Sync members from a MAX group into the organization's participants.
 * Body: { org_id: string, max_chat_id: number }
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/max/groups/sync' });

  try {
    const supabase = createClientServer();
    const { data: { user } } = await supabase.auth.getUser();
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
      .from('organization_members')
      .select('role')
      .eq('organization_id', org_id)
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

    let allMembers: any[] = [];
    let marker: number | undefined;

    // Paginated fetch
    for (let i = 0; i < 50; i++) {
      const result = await maxService.getChatMembers(max_chat_id, { marker, count: 100 });
      if (!result.ok || !result.data?.members) break;
      allMembers = allMembers.concat(result.data.members);
      marker = result.data.marker;
      if (!marker) break;
    }

    let synced = 0;
    let skipped = 0;

    for (const member of allMembers) {
      const maxUserId = member.user_id;
      const userName = member.name || `User ${maxUserId}`;
      const username = member.username || null;

      if (member.is_bot) {
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
          .update({ full_name: userName, username })
          .eq('id', existing.id);
        skipped++;
      } else {
        const { error: insertErr } = await adminSupabase
          .from('participants')
          .insert({
            org_id,
            max_user_id: maxUserId,
            full_name: userName,
            username,
            source: 'max_group_sync',
            participant_status: 'active',
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
