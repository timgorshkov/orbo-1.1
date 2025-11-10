import { createClientServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';

const logger = createAPILogger;

// GET /api/user/organizations - Get user's organizations
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const log = logger(request);
  
  try {
    const supabase = await createClientServer();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's memberships
    const { data: memberships, error: membershipError } = await supabase
      .from('memberships')
      .select(`
        role,
        organization:organizations(
          id,
          name,
          logo_url
        )
      `)
      .eq('user_id', user.id);

    if (membershipError) {
      log.error({
        error: membershipError,
        userId: user.id,
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
      userId: user.id,
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

