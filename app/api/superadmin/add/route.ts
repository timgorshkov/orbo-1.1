import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { isSuperadmin } from '@/lib/server/superadminGuard'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

/**
 * API для добавления нового суперадмина
 * ⚡ ОБНОВЛЕНО: Использует unified auth для поддержки OAuth
 */
export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'superadmin/add' });
  
  try {
    // Проверяем права через unified auth
    const isAdmin = await isSuperadmin()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    
    const { email } = await req.json()
    
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }
    
    const supabaseAdmin = createAdminServer()
    
    // Получаем current user через unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Ищем пользователя по email в auth через RPC функцию
    const normalizedEmail = email.toLowerCase().trim()
    
    const { data: authUserData, error: rpcError } = await supabaseAdmin
      .rpc('get_user_by_email', { user_email: normalizedEmail })
    
    if (rpcError) {
      logger.error({ 
        email: normalizedEmail,
        error: rpcError.message
      }, 'Error finding user by email');
      return NextResponse.json({ 
        error: 'Ошибка при поиске пользователя' 
      }, { status: 500 })
    }
    
    if (!authUserData || authUserData.length === 0) {
      logger.warn({ email: normalizedEmail }, 'User not found');
      return NextResponse.json({ 
        error: 'Пользователь с таким email не найден. Сначала он должен зарегистрироваться.' 
      }, { status: 404 })
    }
    
    const targetUser = {
      id: authUserData[0].id,
      email: authUserData[0].email
    }
    
    logger.info({ 
      target_user_id: targetUser.id,
      email: targetUser.email,
      created_by: user.id
    }, 'Found user, adding superadmin');
    
    // Проверяем что ещё не суперадмин (используем admin клиент для обхода RLS)
    const { data: existing } = await supabaseAdmin
      .from('superadmins')
      .select('id')
      .eq('user_id', targetUser.id)
      .maybeSingle()
    
    if (existing) {
      return NextResponse.json({ error: 'Уже является суперадмином' }, { status: 400 })
    }
    
    // Добавляем (используем admin клиент для обхода RLS рекурсии)
    const { error: insertError } = await supabaseAdmin
      .from('superadmins')
      .insert({
        user_id: targetUser.id,
        email: normalizedEmail,
        created_by: user.id,
        is_active: true
      })
    
    if (insertError) {
      logger.error({ 
        target_user_id: targetUser.id,
        error: insertError.message
      }, 'Error adding superadmin');
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    
    logger.info({ target_user_id: targetUser.id }, 'Superadmin added successfully');
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error in superadmin add');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

