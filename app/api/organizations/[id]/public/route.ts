import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';

// GET /api/organizations/[id]/public - Public organization info
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/public' });
  const orgId = params.id;
  try {
    const adminSupabase = createAdminServer();

    // Fetch organization basic info (public data)
    const { data: org, error: orgError } = await adminSupabase
      .from('organizations')
      .select('id, name, public_description, telegram_group_link')
      .eq('id', orgId)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      organization: org
    });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId
    }, 'Error fetching public org data');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

