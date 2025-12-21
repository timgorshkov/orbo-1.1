import { NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/groups/remove' });
  try {
    const body = await request.json();
    const { groupId, orgId } = body;

    if (!groupId || !orgId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const user = await getUnifiedUser();

    if (!user) {
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
        logger.warn({}, 'membership role column missing, continuing without role check');
      } else {
        logger.error({ error: membershipError.message }, 'Membership check error');
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
      logger.error({ error: groupError?.message, group_id: groupId }, 'Error fetching group');
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const chatIdStr = String(group.tg_chat_id);
    
    logger.info({ group_id: groupId, tg_chat_id: chatIdStr, org_id: orgId, user_id: user.id }, 'Removing group from org');

    // Проверяем, существует ли mapping в org_telegram_groups
    const { data: existingMapping, error: mappingError } = await supabaseService
      .from('org_telegram_groups')
      .select('org_id, tg_chat_id')
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatIdStr)
      .maybeSingle();

    if (mappingError) {
      logger.error({ error: mappingError.message, org_id: orgId, tg_chat_id: chatIdStr }, 'Error checking existing mapping');
      return NextResponse.json({ error: 'Failed to check group mapping' }, { status: 500 });
    }

    if (!existingMapping) {
      logger.info({ org_id: orgId, tg_chat_id: chatIdStr }, 'No mapping found in org_telegram_groups');
      return NextResponse.json({ error: 'Group is not linked to this organization' }, { status: 400 });
    }

    logger.debug({ org_id: orgId, tg_chat_id: chatIdStr }, 'Found existing mapping, proceeding with deletion');

    // Удаляем запись из org_telegram_groups
    const { error: deleteError } = await supabaseService
      .from('org_telegram_groups')
      .delete()
      .eq('org_id', orgId)
      .eq('tg_chat_id', chatIdStr);

    if (deleteError) {
      logger.error({ error: deleteError.message, org_id: orgId, tg_chat_id: chatIdStr }, 'Error deleting org_telegram_groups mapping');
      return NextResponse.json({ error: 'Failed to remove group from organization' }, { status: 500 });
    }

    logger.info({ org_id: orgId, tg_chat_id: chatIdStr }, 'Successfully deleted mapping from org_telegram_groups');

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
      logger.error({ error: otherMappingsError.message, tg_chat_id: chatIdStr }, 'Error checking other mappings');
    } else {
      logger.debug({ other_orgs_count: otherMappings?.length || 0, tg_chat_id: chatIdStr }, 'Found other organizations using this group');
      // Note: org_id column removed from telegram_groups, no need to clear it
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error removing group from org');
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

