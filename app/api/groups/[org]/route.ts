// app/api/telegram/groups/[org]/route.ts
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
    const { data, error } = await supabase
      .from('telegram_groups')
      .select('id, title, tg_chat_id')
      .eq('org_id', org)
      .order('title')
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ groups: data || [] })
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
