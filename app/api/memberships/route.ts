import { NextRequest, NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/memberships?org_id=xxx&user_id=xxx
 * Check if a user is a member of an organization
 * Returns membership info or empty array if not a member
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/memberships' });
  let orgId: string | null = null;
  let userId: string | null = null;
  try {
    const { searchParams } = new URL(request.url);
    orgId = searchParams.get('org_id');
    userId = searchParams.get('user_id');

    if (!orgId || !userId) {
      return NextResponse.json(
        { error: 'Missing org_id or user_id parameter' },
        { status: 400 }
      );
    }

    // Check authentication
    const supabase = await createClientServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow users to check their own membership
    if (user.id !== userId) {
      return NextResponse.json(
        { error: 'You can only check your own membership' },
        { status: 403 }
      );
    }

    // Use admin client to bypass RLS
    const adminSupabase = createAdminServer();

    const { data: membership, error: membershipError } = await adminSupabase
      .from('memberships')
      .select('org_id, user_id, role, role_source, created_at')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();

    if (membershipError) {
      logger.error({ 
        error: membershipError.message,
        org_id: orgId,
        user_id: userId
      }, 'Error checking membership');
      return NextResponse.json(
        { error: 'Failed to check membership' },
        { status: 500 }
      );
    }

    // Return membership in array format for consistency
    const memberships = membership ? [membership] : [];

    logger.debug({ 
      org_id: orgId,
      user_id: userId,
      has_membership: !!membership
    }, 'Membership checked');
    return NextResponse.json({ memberships });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId || 'unknown',
      user_id: userId || 'unknown'
    }, 'Error in GET /api/memberships');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

