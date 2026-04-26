// app/api/groups/[org]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ org: string }> }
) {
  const { org } = await params

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(org)) {
    return NextResponse.json({ error: 'Invalid org id' }, { status: 400 })
  }

  try {
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const role = await getEffectiveOrgRole(user.id, org)
    if (!role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = await createClientServer()
    
    // Получаем группы через связующую таблицу org_telegram_groups
    const { data: orgGroups, error: orgGroupsError } = await supabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', org)
    
    if (orgGroupsError) {
      return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 })
    }
    
    if (!orgGroups || orgGroups.length === 0) {
      return NextResponse.json({ groups: [] })
    }
    
    const chatIds = orgGroups.map(g => g.tg_chat_id)
    
    const { data, error } = await supabase
      .from('telegram_groups')
      .select('id, title, tg_chat_id')
      .in('tg_chat_id', chatIds)
      .order('title')
    
    if (error) {
      return NextResponse.json({ error: 'Failed to fetch group details' }, { status: 500 })
    }
    
    return NextResponse.json({ groups: data || [] })
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
