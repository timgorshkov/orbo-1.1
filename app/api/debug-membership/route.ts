import { NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { isSuperadmin } from '@/lib/server/superadminGuard'

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const isAdmin = await isSuperadmin()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = createAdminServer()
    const { data, error } = await supabase
      .from('memberships')
      .select('*')
    
    return NextResponse.json({ data, error: error ? 'Query failed' : null })
  } catch (e: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}