import { NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'

export async function GET() {
  try {
    const supabase = createAdminServer()
    const { data, error } = await supabase
      .from('memberships')
      .select('*')
    
    return NextResponse.json({ data, error })
  } catch (e: any) {
    return NextResponse.json({ error: e.message })
  }
}