import { NextResponse } from 'next/server';
import { createAdminServer, createClientServer } from '@/lib/server/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminServer();

    const { data: memberships, error: membershipsError } = await supabaseAdmin
      .from('memberships')
      .select('org_id, role, organizations(id, name, plan)')
      .eq('user_id', user.id);

    if (membershipsError) {
      console.error('Error fetching memberships:', membershipsError);
      return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
    }

    const orgs = memberships?.map((item: any) => ({
      id: item.org_id,
      name: item.organizations?.name || 'Организация',
      plan: item.organizations?.plan || 'free',
      role: item.role,
    })) || [];

    return NextResponse.json({ organizations: orgs });
  } catch (error: any) {
    console.error('Error in organizations list API:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

