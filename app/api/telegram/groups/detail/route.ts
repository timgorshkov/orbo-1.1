import { NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';

export const dynamic = 'force-dynamic';

function safeJson(error: any) {
  try {
    return JSON.stringify({
      message: error?.message,
      code: error?.code,
      details: error?.details
    });
  } catch {
    return 'Unable to serialize error';
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const orgId = url.searchParams.get('orgId');
    const groupIdParam = url.searchParams.get('groupId');

    if (!orgId || !groupIdParam) {
      return NextResponse.json(
        { error: 'Missing orgId or groupId parameter' },
        { status: 400 }
      );
    }

    const supabase = createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminServer();

    // Проверяем, что пользователь имеет доступ к организации
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      console.error('Membership check error:', safeJson(membershipError));
      return NextResponse.json({ error: 'Failed to verify membership' }, { status: 500 });
    }

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Получаем группу (по id или tg_chat_id)
    const numericGroupId = Number(groupIdParam);
    const searchVariants = [
      { column: 'id', value: numericGroupId, enabled: !Number.isNaN(numericGroupId) },
      { column: 'id', value: groupIdParam, enabled: true },
      { column: 'tg_chat_id', value: groupIdParam, enabled: true },
      { column: 'tg_chat_id', value: numericGroupId, enabled: !Number.isNaN(numericGroupId) },
    ];

    let groupData: any = null;
    let groupError: any = null;

    for (const variant of searchVariants) {
      if (!variant.enabled) continue;

      const { data, error } = await supabaseAdmin
        .from('telegram_groups')
        .select('*')
        .eq(variant.column, variant.value)
        .maybeSingle();

      if (data) {
        groupData = data;
        break;
      }

      if (error?.code !== 'PGRST116') { // not-a-single-row error from maybeSingle
        groupError = error;
      }
    }

    if (groupError) {
      console.error('Group fetch error:', safeJson(groupError));
    }

    if (!groupData) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const originalOrgId = groupData.org_id;
    let accessible = originalOrgId === orgId;
    let mappingChecked = false;
    let mappingExists = false;

    if (!accessible) {
      mappingChecked = true;
      try {
        const { data: mapping } = await supabaseAdmin
          .from('org_telegram_groups')
          .select('org_id')
          .eq('org_id', orgId)
          .eq('tg_chat_id', groupData.tg_chat_id)
          .maybeSingle();

        mappingExists = !!mapping;
        accessible = mappingExists;
      } catch (mappingError: any) {
        if (mappingError?.code === '42P01') {
          console.warn('Mapping table org_telegram_groups not found while fetching group detail');
          accessible = false;
        } else {
          console.error('Mapping lookup error:', safeJson(mappingError));
          return NextResponse.json({ error: 'Failed to verify group mapping' }, { status: 500 });
        }
      }
    }

    if (!accessible) {
      return NextResponse.json({ error: 'Group is not linked to this organization' }, { status: 404 });
    }

    return NextResponse.json({
      group: groupData,
      originalOrgId,
      accessibleViaMapping: originalOrgId !== orgId,
      mappingChecked,
      mappingExists,
    });
  } catch (error: any) {
    console.error('Error in group detail API:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

