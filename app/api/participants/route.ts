import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/participants?orgId=xxx
 * 
 * Fetch participants for organization
 */
export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'participants' });
  
  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get('orgId');
    
    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 });
    }
    
    // Check authentication via unified auth
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Use admin client to bypass RLS
    const adminSupabase = createAdminServer();
    
    // Check permissions (user must be member of org)
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden: not a member of this organization' }, { status: 403 });
    }
    
    logger.info({ orgId, userId: user.id }, 'Fetching participants');
    const { data: participants, error } = await adminSupabase
      .from('participants')
      .select('id, full_name, username, photo_url')
      .eq('org_id', orgId)
      .is('merged_into', null)
      .order('full_name', { ascending: true });
    
    if (error) {
      logger.error({ error }, 'Failed to fetch participants');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    logger.info({ count: participants?.length || 0 }, 'Participants fetched');
    
    return NextResponse.json({ participants: participants || [] });
  } catch (error) {
    logger.error({ error }, 'Unexpected error fetching participants');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

