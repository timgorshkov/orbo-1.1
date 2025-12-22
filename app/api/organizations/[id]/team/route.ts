import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

// GET /api/organizations/[id]/team - Get organization team (owner + admins)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/team' });
  let orgId: string | undefined;
  try {
    const paramsData = await params;
    orgId = paramsData.id;
    const adminSupabase = createAdminServer()

    // Check authentication via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check user has access to this organization
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get organization owner and admins using admin client
    const { data: team, error } = await adminSupabase
      .from('organization_admins')
      .select('*')
      .eq('org_id', orgId)

    if (error) {
      logger.error({ 
        error: error.message,
        org_id: orgId
      }, 'Error fetching team');
      return NextResponse.json(
        { error: 'Failed to fetch team' },
        { status: 500 }
      )
    }

    // Also get shadow admins (Telegram admins without linked accounts)
    const { data: shadowAdmins } = await adminSupabase
      .from('telegram_group_admins')
      .select(`
        tg_user_id,
        tg_chat_id,
        username,
        first_name,
        last_name,
        custom_title,
        is_owner,
        is_admin,
        telegram_groups!inner(title),
        org_telegram_groups!inner(org_id)
      `)
      .eq('org_telegram_groups.org_id', orgId)
      .eq('is_admin', true)
      .gt('expires_at', new Date().toISOString())

    // Get tg_user_ids that already have memberships (to exclude from shadow list)
    const linkedTgUserIds = new Set(
      (team || [])
        .filter((m: any) => m.tg_user_id)
        .map((m: any) => String(m.tg_user_id))
    )

    // Group shadow admins by tg_user_id
    const shadowAdminsMap = new Map<string, any>()
    for (const admin of shadowAdmins || []) {
      const tgUserId = String(admin.tg_user_id)
      
      // Skip if already has a linked account
      if (linkedTgUserIds.has(tgUserId)) continue
      
      if (!shadowAdminsMap.has(tgUserId)) {
        shadowAdminsMap.set(tgUserId, {
          tg_user_id: admin.tg_user_id,
          username: admin.username,
          first_name: admin.first_name,
          last_name: admin.last_name,
          is_owner_in_groups: admin.is_owner,
          groups: []
        })
      }
      
      const existing = shadowAdminsMap.get(tgUserId)!
      // telegram_groups is returned as array from join
      const groupTitle = Array.isArray(admin.telegram_groups) 
        ? admin.telegram_groups[0]?.title 
        : (admin.telegram_groups as any)?.title
      existing.groups.push({
        id: admin.tg_chat_id,
        title: groupTitle || `Group ${admin.tg_chat_id}`,
        custom_title: admin.custom_title
      })
      if (admin.is_owner) existing.is_owner_in_groups = true
    }

    logger.info({ 
      team_count: team?.length || 0,
      shadow_admins_count: shadowAdminsMap.size,
      org_id: orgId
    }, 'Found team members');

    // For each admin, parse the groups they admin
    const teamWithGroups = (team || []).map((member: any) => {
      let admin_groups: Array<{ id: number; title: string }> = []
      
      if (member.role === 'admin' && member.role_source === 'telegram_admin') {
        // Parse group IDs and titles from view columns
        try {
          const groupIds = member.telegram_group_ids || []
          const groupTitles = member.telegram_group_titles || []
          
          admin_groups = groupIds.map((id: number, index: number) => ({
            id,
            title: groupTitles[index] || `Group ${id}`
          }))
        } catch (e) {
          logger.warn({ 
            error: e instanceof Error ? e.message : String(e),
            member_id: member.user_id,
            org_id: orgId
          }, 'Error parsing group data');
        }
      }
      
      return {
        user_id: member.user_id,
        role: member.role,
        role_source: member.role_source,
        email: member.email,
        email_confirmed: member.email_confirmed,
        full_name: member.full_name,
        telegram_username: member.telegram_username,
        tg_user_id: member.tg_user_id,
        has_verified_telegram: member.has_verified_telegram,
        is_shadow_profile: member.is_shadow_profile,
        created_at: member.created_at,
        last_synced_at: member.last_synced_at,
        admin_groups,
        metadata: member.metadata
      }
    })

    // Add shadow admins to the team
    for (const [tgUserId, shadowAdmin] of Array.from(shadowAdminsMap.entries())) {
      const fullName = [shadowAdmin.first_name, shadowAdmin.last_name]
        .filter(Boolean)
        .join(' ') || shadowAdmin.username || `Telegram ${tgUserId}`
      
      teamWithGroups.push({
        user_id: null, // No linked account
        role: 'admin',
        role_source: 'telegram_admin',
        email: null,
        email_confirmed: false,
        full_name: fullName,
        telegram_username: shadowAdmin.username,
        tg_user_id: shadowAdmin.tg_user_id,
        has_verified_telegram: false,
        is_shadow_profile: true,
        created_at: null,
        last_synced_at: new Date().toISOString(),
        admin_groups: shadowAdmin.groups,
        metadata: {
          shadow_profile: true,
          is_owner_in_groups: shadowAdmin.is_owner_in_groups
        }
      })
    }

    logger.info({ 
      admin_count: teamWithGroups.filter((m: any) => m.role === 'admin').length,
      shadow_count: shadowAdminsMap.size,
      total_count: teamWithGroups.length,
      org_id: orgId
    }, 'Processed team');

    return NextResponse.json({
      success: true,
      team: teamWithGroups
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId || 'unknown'
    }, 'Error in GET /api/organizations/[id]/team');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/organizations/[id]/team/sync - Sync admin roles from Telegram
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/team' });
  let orgId: string | undefined;
  try {
    const paramsData = await params;
    orgId = paramsData.id;
    const adminSupabase = createAdminServer()

    // Check authentication via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check user is owner or admin
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can sync team' },
        { status: 403 }
      )
    }

    // Step 1: Update admin rights from Telegram API first
    logger.info({ org_id: orgId }, 'Step 1: Updating admin rights from Telegram');
    try {
      const updateResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/telegram/groups/update-admins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forward authentication cookie
          'Cookie': request.headers.get('cookie') || ''
        },
        body: JSON.stringify({ orgId })
      })

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        logger.warn({ 
          org_id: orgId,
          error: errorText
        }, 'Failed to update admin rights from Telegram');
        // Continue anyway - maybe there are existing records to sync
      } else {
        const updateData = await updateResponse.json()
        logger.info({ 
          org_id: orgId,
          update_data: updateData
        }, 'Updated admin rights from Telegram');
      }
    } catch (updateError: any) {
      logger.warn({ 
        org_id: orgId,
        error: updateError.message || String(updateError)
      }, 'Error updating admin rights');
      // Continue anyway
    }

    // Step 2: Sync memberships from telegram_group_admins
    logger.info({ org_id: orgId }, 'Step 2: Syncing memberships');
    const { data: syncResults, error } = await adminSupabase.rpc(
      'sync_telegram_admins',
      { p_org_id: orgId }
    )

    if (error) {
      logger.error({ 
        error: error.message,
        org_id: orgId
      }, 'Error syncing admins');
      return NextResponse.json(
        { error: 'Failed to sync admins' },
        { status: 500 }
      )
    }

    logger.info({ 
      org_id: orgId,
      sync_results: syncResults
    }, 'Sync completed');

    return NextResponse.json({
      success: true,
      results: syncResults
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId || 'unknown'
    }, 'Error in POST /api/organizations/[id]/team/sync');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

