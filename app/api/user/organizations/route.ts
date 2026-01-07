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

    log.info({
      user_id: session.user.id,
      user_email: session.user.email,
      provider: session.provider,
    }, 'Fetching organizations for user');

    // Get user's memberships (without JOIN)
    const { data: memberships, error: membershipError } = await adminSupabase
      .from('memberships')
      .select('role, org_id')
      .eq('user_id', session.user.id);

    log.info({
      user_id: session.user.id,
      memberships_count: memberships?.length || 0,
      memberships_data: memberships,
      membership_error: membershipError?.message,
    }, 'Memberships query result');

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

    // Get organization details separately
    const orgIds = (memberships || []).map((m: any) => m.org_id).filter(Boolean);
    let organizations: any[] = [];
    
    if (orgIds.length > 0) {
      const { data: orgsData, error: orgsError } = await adminSupabase
        .from('organizations')
        .select('id, name, logo_url')
        .in('id', orgIds);
      
      if (orgsError) {
        log.error({
          error: orgsError,
          userId: session.user.id,
        }, 'Failed to fetch organizations');
        
        return NextResponse.json(
          { error: 'Failed to fetch organizations' },
          { status: 500 }
        );
      }
      
      // Create a map for quick lookup
      const orgsMap = new Map((orgsData || []).map((o: any) => [o.id, o]));
      
      // Combine memberships with organizations
      organizations = (memberships || [])
        .map((m: any) => {
          const org = orgsMap.get(m.org_id);
          if (!org) return null;
          return {
            id: org.id,
            name: org.name,
            logo_url: org.logo_url,
            role: m.role,
          };
        })
        .filter(Boolean);
    }

    const duration = Date.now() - startTime;
    log.debug({
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

