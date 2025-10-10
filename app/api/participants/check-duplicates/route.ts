import { NextResponse } from 'next/server';
import { participantMatcher } from '@/lib/services/participants/matcher';
import { createClientServer } from '@/lib/server/supabaseServer';

async function ensureOrgAccess(orgId: string) {
  const supabase = await createClientServer();
  const { data: authResult } = await supabase.auth.getUser();

  if (!authResult?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', authResult.user.id)
    .maybeSingle();

  if (!membership) {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }

  return { user: authResult.user };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const orgId = payload?.orgId as string | undefined;

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
    }

    const access = await ensureOrgAccess(orgId);
    if ('error' in access) {
      return access.error;
    }

    const matches = await participantMatcher.findMatches({
      orgId,
      email: payload?.email,
      phone: payload?.phone,
      username: payload?.username,
      tg_user_id: payload?.tg_user_id,
      full_name: payload?.full_name,
      first_name: payload?.first_name,
      last_name: payload?.last_name
    });

    return NextResponse.json({ matches });
  } catch (error: any) {
    console.error('Error checking participant duplicates:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

