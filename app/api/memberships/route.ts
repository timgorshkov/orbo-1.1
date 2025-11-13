import { NextRequest, NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/memberships?org_id=xxx&user_id=xxx
 * Check if a user is a member of an organization
 * Returns membership info or empty array if not a member
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');
    const userId = searchParams.get('user_id');

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
      console.error('Error checking membership:', membershipError);
      return NextResponse.json(
        { error: 'Failed to check membership' },
        { status: 500 }
      );
    }

    // Return membership in array format for consistency
    const memberships = membership ? [membership] : [];

    return NextResponse.json({ memberships });
  } catch (error: any) {
    console.error('Error in GET /api/memberships:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

