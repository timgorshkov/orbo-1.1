import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedSession } from '@/lib/auth/unified-auth';

const logger = createAPILogger;

// GET /api/user/organizations - Get user's organizations
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const log = logger(request);
  
  try {
    // Use unified auth to support both Supabase and NextAuth users
    const session = await getUnifiedSession();
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = createAdminServer();

    // Get user's memberships
    const { data: memberships, error: membershipError } = await adminSupabase
      .from('memberships')
      .select(`
        role,
        organization:organizations(
          id,
          name,
          logo_url
        )
      `)
      .eq('user_id', session.user.id);

    if (membershipError) {
      log.error({
        error: membershipError,
        userId: session.user.id,
      }, 'Failed to fetch memberships');
      
      return NextResponse.json(
        { error: 'Failed to fetch organizations' },
        { status: 500 }
      );
    }

    // Format organizations
    const organizations = (memberships || [])
      .filter((m: any) => m.organization)
      .map((m: any) => ({
        id: m.organization.id,
        name: m.organization.name,
        logo_url: m.organization.logo_url,
        role: m.role,
      }));

    const duration = Date.now() - startTime;
    log.info({
      userId: session.user.id,
      provider: session.provider,
      orgCount: organizations.length,
      duration,
    }, 'User organizations fetched');

    return NextResponse.json({
      organizations,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    log.error({
      error: error.message,
      duration,
    }, 'Error in GET /api/user/organizations');
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

