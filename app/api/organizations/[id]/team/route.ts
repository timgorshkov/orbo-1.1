import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'

// GET /api/organizations/[id]/team - Get organization team (owner + admins)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orgId } = await params
    const supabase = await createClientServer()
    const adminSupabase = createAdminServer()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check user has access to this organization
    const { data: membership } = await supabase
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
      console.error('Error fetching team:', error)
      return NextResponse.json(
        { error: 'Failed to fetch team' },
        { status: 500 }
      )
    }

    console.log(`[Team API] Found ${team?.length || 0} team members for org ${orgId}`)

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
          console.error('Error parsing group data:', e)
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

    console.log(`[Team API] Processed team with ${teamWithGroups.filter((m: any) => m.role === 'admin').length} admins`)

    return NextResponse.json({
      success: true,
      team: teamWithGroups
    })
  } catch (error: any) {
    console.error('Error in GET /api/organizations/[id]/team:', error)
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
  try {
    const { id: orgId } = await params
    const supabase = await createClientServer()
    const adminSupabase = createAdminServer()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check user is owner or admin
    const { data: membership } = await supabase
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
    console.log(`[Team Sync] Step 1: Updating admin rights from Telegram for org ${orgId}`)
    try {
      const updateResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/telegram/groups/update-admins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forward authentication cookie
          'Cookie': request.headers.get('cookie') || ''
        },
        body: JSON.stringify({ orgId })
      })

      if (!updateResponse.ok) {
        console.warn(`[Team Sync] Warning: Failed to update admin rights from Telegram:`, await updateResponse.text())
        // Continue anyway - maybe there are existing records to sync
      } else {
        const updateData = await updateResponse.json()
        console.log(`[Team Sync] ✅ Updated admin rights from Telegram:`, updateData)
      }
    } catch (updateError: any) {
      console.warn(`[Team Sync] Warning: Error updating admin rights:`, updateError.message)
      // Continue anyway
    }

    // Step 2: Sync memberships from telegram_group_admins
    console.log(`[Team Sync] Step 2: Syncing memberships for org ${orgId}`)
    const { data: syncResults, error } = await adminSupabase.rpc(
      'sync_telegram_admins',
      { p_org_id: orgId }
    )

    if (error) {
      console.error('[Team Sync] Error syncing admins:', error)
      return NextResponse.json(
        { error: 'Failed to sync admins' },
        { status: 500 }
      )
    }

    console.log(`[Team Sync] ✅ Sync completed:`, syncResults)

    return NextResponse.json({
      success: true,
      results: syncResults
    })
  } catch (error: any) {
    console.error('Error in POST /api/organizations/[id]/team/sync:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

