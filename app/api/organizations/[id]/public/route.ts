import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';

// GET /api/organizations/[id]/public - Public organization info
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: orgId } = params;
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
    console.error('Error fetching public org data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

