import { NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';

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
      .select('id, tg_chat_id')
      .eq('id', groupId)
      .maybeSingle();

    if (groupError || !group) {
      console.error('Error fetching group:', groupError);
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const chatIdStr = String(group.tg_chat_id);
    
    console.log(`Removing group ${groupId} (chat_id: ${chatIdStr}) from org ${orgId}`)

    // Проверяем, существует ли mapping в org_telegram_groups
    const { data: existingMapping, error: mappingError } = await supabaseService
      .from('org_telegram_groups')
      .select('org_id, tg_chat_id')
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatIdStr)
      .maybeSingle();

    if (mappingError) {
      console.error('Error checking existing mapping:', mappingError);
      return NextResponse.json({ error: 'Failed to check group mapping' }, { status: 500 });
    }

    if (!existingMapping) {
      console.log('No mapping found in org_telegram_groups for this org and group')
      return NextResponse.json({ error: 'Group is not linked to this organization' }, { status: 400 });
    }

    console.log('Found existing mapping, proceeding with deletion')

    // Удаляем запись из org_telegram_groups
    const { error: deleteError } = await supabaseService
      .from('org_telegram_groups')
      .delete()
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatIdStr);

    if (deleteError) {
      console.error('Error deleting org_telegram_groups mapping:', deleteError);
      return NextResponse.json({ error: 'Failed to remove group from organization' }, { status: 500 });
    }

    console.log('Successfully deleted mapping from org_telegram_groups')

    // Log admin action
    await logAdminAction({
      orgId,
      userId: user.id,
      action: AdminActions.REMOVE_TELEGRAM_GROUP,
      resourceType: ResourceTypes.TELEGRAM_GROUP,
      resourceId: groupId,
      metadata: {
        tg_chat_id: chatIdStr
      }
    });

    // Проверяем, есть ли другие организации, использующие эту группу
    const { data: otherMappings, error: otherMappingsError } = await supabaseService
      .from('org_telegram_groups')
      .select('org_id')
      .eq('tg_chat_id', chatIdStr);

    if (otherMappingsError) {
      console.error('Error checking other mappings:', otherMappingsError);
    } else {
      console.log(`Found ${otherMappings?.length || 0} other organizations using this group`)
      // Note: org_id column removed from telegram_groups, no need to clear it
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error removing group from org:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

