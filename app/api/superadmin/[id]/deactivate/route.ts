import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { isSuperadmin } from '@/lib/server/superadminGuard'

/**
 * API для деактивации суперадмина
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Проверяем права
    const isAdmin = await isSuperadmin()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    
    const supabase = await createClientServer()
    
    // Деактивируем (используем user_id, а не id)
    const { error } = await supabase
      .from('superadmins')
      .update({ is_active: false })
      .eq('user_id', params.id)
    
    if (error) {
      console.error('Error deactivating superadmin:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('Error in superadmin deactivate:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

