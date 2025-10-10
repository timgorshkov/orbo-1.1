import { NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chatId, orgId, reason } = body;

    if (!chatId || !orgId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseService = createAdminServer();

    const { data: membership, error: membershipError } = await supabaseService
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await supabaseService
      .from('org_telegram_groups')
      .update({ status: 'archived', archived_at: new Date().toISOString(), archived_reason: reason || null })
      .eq('org_id', orgId)
      .filter('tg_chat_id::text', 'eq', String(chatId));

    const { count } = await supabaseService
      .from('org_telegram_groups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .filter('tg_chat_id::text', 'eq', String(chatId));

    if (!count || count === 0) {
      await supabaseService
        .from('telegram_groups')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_reason: reason || null
        })
        .filter('tg_chat_id::text', 'eq', String(chatId));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error archiving mapping:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

