import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/participants/archived?orgId=xxx
 * 
 * Fetch archived (excluded) participants for organization
 * Only accessible by admins
 */
export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'participants/archived' });
  
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
    
    // Check permissions (user must be admin of org)
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }
    
    logger.info({ orgId, userId: user.id }, 'Fetching archived participants');
    
    // Fetch archived participants (participant_status = 'excluded')
    const { data: participants, error } = await adminSupabase
      .from('participants')
      .select('id, full_name, username, photo_url, email, tg_user_id, participant_status, deleted_at, created_at')
      .eq('org_id', orgId)
      .eq('participant_status', 'excluded')
      .is('merged_into', null)
      .order('deleted_at', { ascending: false, nullsFirst: false });
    
    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch archived participants');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Map to expected format
    const mappedParticipants = (participants || []).map(p => ({
      id: p.id,
      full_name: p.full_name,
      tg_username: p.username,
      tg_user_id: p.tg_user_id ? String(p.tg_user_id) : null,
      email: p.email,
      photo_url: p.photo_url,
      participant_status: p.participant_status,
      deleted_at: p.deleted_at,
      created_at: p.created_at
    }));
    
    logger.info({ count: mappedParticipants.length }, 'Archived participants fetched');
    
    return NextResponse.json({ participants: mappedParticipants });
  } catch (error) {
    logger.error({ error }, 'Unexpected error fetching archived participants');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

