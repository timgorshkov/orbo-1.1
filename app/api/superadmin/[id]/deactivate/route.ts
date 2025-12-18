import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { isSuperadmin } from '@/lib/server/superadminGuard'
import { createAPILogger } from '@/lib/logger'

/**
 * API для деактивации суперадмина
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const logger = createAPILogger(req, { endpoint: '/api/superadmin/[id]/deactivate' });
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
      logger.error({ 
        error: error.message,
        user_id: params.id
      }, 'Error deactivating superadmin');
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    
    logger.info({ user_id: params.id }, 'Superadmin deactivated');
    return NextResponse.json({ success: true })
    
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      user_id: params.id
    }, 'Error in superadmin deactivate');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

