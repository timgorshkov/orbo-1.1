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
      .order('role', { ascending: false }) // owner first, then admins
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching team:', error)
      return NextResponse.json(
        { error: 'Failed to fetch team' },
        { status: 500 }
      )
    }

    // For each admin, get the groups they admin
    const teamWithGroups = await Promise.all(
      (team || []).map(async (member) => {
        if (member.role === 'admin' && member.role_source === 'telegram_admin') {
          // Get group details from metadata
          const groupIds = member.metadata?.telegram_groups || []
          const groupTitles = member.metadata?.telegram_group_titles || []
          
          return {
            ...member,
            admin_groups: groupIds.map((id: number, index: number) => ({
              id,
              title: groupTitles[index] || `Group ${id}`
            }))
          }
        }
        return {
          ...member,
          admin_groups: []
        }
      })
    )

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

    // Call sync function
    const { data: syncResults, error } = await adminSupabase.rpc(
      'sync_telegram_admins',
      { p_org_id: orgId }
    )

    if (error) {
      console.error('Error syncing admins:', error)
      return NextResponse.json(
        { error: 'Failed to sync admins' },
        { status: 500 }
      )
    }

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

