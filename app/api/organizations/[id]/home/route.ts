import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getHomePageData } from '@/lib/server/getHomePageData'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/organizations/[id]/home
 * Returns all data needed for the home page
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/home' });
  let orgId: string | undefined;
  try {
    const paramsData = await params;
    orgId = paramsData.id;

    // Check authentication via unified auth
    const user = await getUnifiedUser()
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = createAdminServer()

    // Check if user has access to this organization (with superadmin fallback)
    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
    const access = await getEffectiveOrgRole(user.id, orgId)

    if (!access) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Get home page data
    const homePageData = await getHomePageData(orgId, user.id)

    if (!homePageData) {
      return NextResponse.json(
        { error: 'Failed to load home page data' },
        { status: 500 }
      )
    }

    return NextResponse.json(homePageData)

  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org_id: orgId || 'unknown'
    }, 'Error in GET /api/organizations/[id]/home');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

