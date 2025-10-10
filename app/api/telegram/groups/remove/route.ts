import { NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { groupId, orgId } = body;

    if (!groupId || !orgId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseService = createAdminServer();

    const { data: membership, error: membershipError } = await supabaseService
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (membershipError) {
      if (membershipError.code === '42703') {
        console.warn('membership role column missing, continuing without role check');
      } else {
        console.error('Membership check error:', membershipError);
        return NextResponse.json({ error: 'Failed to verify membership' }, { status: 500 });
      }
    }

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: group, error: groupError } = await supabaseService
      .from('telegram_groups')
      .select('id, tg_chat_id, org_id')
      .eq('id', groupId)
      .maybeSingle();

    if (groupError || !group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const chatIdStr = String(group.tg_chat_id);

    let mappingStatus: string | null | undefined = null;
    let mappingExists = false;

    let statusColumnAvailable = true;
    let mappingHandledViaDelete = false;

    try {
      const { data: mappingData, error: mappingError } = await supabaseService
        .from('org_telegram_groups')
        .select('status')
        .eq('org_id', orgId)
        .eq('tg_chat_id', group.tg_chat_id)
        .maybeSingle();

      if (mappingError) {
        if (mappingError.code === '42703') {
          statusColumnAvailable = false;
          const { data: fallbackMapping, error: fallbackError } = await supabaseService
            .from('org_telegram_groups')
            .select('org_id, tg_chat_id')
            .eq('org_id', orgId)
            .eq('tg_chat_id', group.tg_chat_id)
            .maybeSingle();

          if (!fallbackError && fallbackMapping) {
            mappingExists = true;
            mappingStatus = 'active';
          }
        } else if (mappingError.code === '42P01') {
          console.warn('org_telegram_groups table not found when removing group; treating as legacy link');
          mappingExists = group.org_id === orgId;
          mappingStatus = mappingExists ? 'active' : null;
        } else {
          console.error('Error fetching group mapping:', mappingError);
          return NextResponse.json({ error: 'Failed to fetch group mapping' }, { status: 500 });
        }
      } else if (mappingData) {
        mappingExists = true;
        mappingStatus = mappingData.status ?? null;
      }
    } catch (mappingException: any) {
      console.error('Unexpected error fetching group mapping:', mappingException);
      return NextResponse.json({ error: 'Failed to fetch group mapping' }, { status: 500 });
    }

    if (!mappingExists) {
      // Если нет записи в mapping, проверим legacy-связь через org_id
      if (group.org_id === orgId) {
        mappingExists = true;
        mappingStatus = 'active';
      } else {
        return NextResponse.json({ error: 'Group is not linked to this organization' }, { status: 400 });
      }
    }

    if (mappingStatus === 'archived') {
      return NextResponse.json({ error: 'Group is already archived for this organization' }, { status: 400 });
    }

    const now = new Date().toISOString();

    try {
      const { error: updateError } = await supabaseService
        .from('org_telegram_groups')
        .update({ status: 'archived', archived_at: now, archived_reason: 'manual_remove' })
        .eq('org_id', orgId)
        .eq('tg_chat_id', group.tg_chat_id);

      if (updateError) {
        throw updateError;
      }
    } catch (updateError: any) {
      if (updateError?.code === '42P01') {
        console.warn('org_telegram_groups table missing; falling back to legacy deletion');
        await supabaseService
          .from('telegram_groups')
          .update({
            org_id: null,
            is_archived: true,
            archived_at: now,
            archived_reason: 'manual_remove'
          })
          .eq('id', groupId);

        return NextResponse.json({ success: true, legacy: true });
      }

      console.warn('Failed to update group mapping to archived, attempting delete fallback:', updateError);

      if (updateError?.code === '42703') {
        console.warn('org_telegram_groups.status column missing; deleting mapping instead');
        statusColumnAvailable = false;
      }

      try {
        await supabaseService
          .from('org_telegram_groups')
          .delete()
          .eq('org_id', orgId)
          .eq('tg_chat_id', group.tg_chat_id);
        mappingHandledViaDelete = true;
      } catch (deleteFallbackError: any) {
        if (deleteFallbackError?.code === '42P01') {
          console.warn('org_telegram_groups table missing during delete fallback; treating as legacy removal');
          mappingHandledViaDelete = true;
        } else if (deleteFallbackError?.code === '42703') {
          console.warn('org_telegram_groups.status column missing during delete fallback');
          statusColumnAvailable = false;
          mappingHandledViaDelete = true;
        } else {
          console.error('Delete fallback for group mapping failed:', deleteFallbackError);
          return NextResponse.json({ error: 'Failed to archive group mapping' }, { status: 500 });
        }
      }
    }

    let count: number | null = null;
    if (!mappingHandledViaDelete && statusColumnAvailable) {
      const { count: activeCount, error: activeCountError } = await supabaseService
        .from('org_telegram_groups')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('tg_chat_id', group.tg_chat_id);

      if (activeCountError) {
        console.error('Error counting active mappings for chat', chatIdStr, activeCountError);
        count = null;
      } else {
        count = activeCount ?? 0;
      }
    }

    if (mappingHandledViaDelete || !statusColumnAvailable || !count || count === 0) {
      await supabaseService
        .from('telegram_groups')
        .update({
          is_archived: true,
          archived_at: now,
          archived_reason: 'manual_remove'
        })
        .eq('id', groupId);

      try {
        await supabaseService
          .from('org_telegram_groups')
          .delete()
          .eq('tg_chat_id', group.tg_chat_id);
      } catch (deleteError: any) {
        if (deleteError?.code === '42P01') {
          console.warn('org_telegram_groups table not found during cleanup delete');
        } else if (deleteError?.code === '42703') {
          console.warn('org_telegram_groups.status column missing during cleanup delete');
        } else {
          console.error('Error cleaning up org_telegram_groups after removal:', deleteError);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error removing group from org:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

