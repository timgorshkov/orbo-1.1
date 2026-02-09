import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getOrgTelegramGroups } from '@/lib/server/getOrgTelegramGroups'
import { createServiceLogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

const logger = createServiceLogger('TelegramGroupsForOrgAPI')

export const dynamic = 'force-dynamic'

// GET /api/telegram/groups/for-org?orgId={orgId}
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')

    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
    }

    // Check user access via unified auth (supports both Supabase and NextAuth)
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createAdminServer()

    // Check membership (with superadmin fallback)
    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
    const access = await getEffectiveOrgRole(user.id, orgId)

    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get groups using existing function
    const groups = await getOrgTelegramGroups(orgId)

    // Transform to simpler format for UI
    const simpleGroups = groups.map(g => ({
      id: g.id,
      tg_chat_id: g.tg_chat_id,
      title: g.title,
      bot_status: g.bot_status,
    }))

    return NextResponse.json({ groups: simpleGroups })
  } catch (error) {
    logger.error({ error }, 'Error fetching groups for org')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

