// app/api/groups/[org]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { org: string } }
) {
  const { org } = params
  
  try {
    const supabase = await createClientServer()
    
    // Получаем группы через связующую таблицу org_telegram_groups
    const { data: orgGroups, error: orgGroupsError } = await supabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', org)
    
    if (orgGroupsError) {
      return NextResponse.json({ error: orgGroupsError.message }, { status: 500 })
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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ groups: data || [] })
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
