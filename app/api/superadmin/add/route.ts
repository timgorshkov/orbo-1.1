import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { isSuperadmin } from '@/lib/server/superadminGuard'

/**
 * API для добавления нового суперадмина
 */
export async function POST(req: NextRequest) {
  try {
    // Проверяем права
    const isAdmin = await isSuperadmin()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    
    const { email } = await req.json()
    
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }
    
    const supabaseAdmin = createAdminServer()
    const supabase = await createClientServer()
    
    // Получаем current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Ищем пользователя по email в auth через RPC функцию
    const normalizedEmail = email.toLowerCase().trim()
    
    const { data: authUserData, error: rpcError } = await supabaseAdmin
      .rpc('get_user_by_email', { user_email: normalizedEmail })
    
    if (rpcError) {
      console.error('[Superadmin Add] Error finding user by email:', rpcError)
      return NextResponse.json({ 
        error: 'Ошибка при поиске пользователя' 
      }, { status: 500 })
    }
    
    if (!authUserData || authUserData.length === 0) {
      console.log(`[Superadmin Add] User not found with email: ${normalizedEmail}`)
      return NextResponse.json({ 
        error: 'Пользователь с таким email не найден. Сначала он должен зарегистрироваться.' 
      }, { status: 404 })
    }
    
    const targetUser = {
      id: authUserData[0].id,
      email: authUserData[0].email
    }
    
    console.log(`[Superadmin Add] Found user: ${targetUser.id} with email: ${targetUser.email}`)
    
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
      console.error('Error adding superadmin:', insertError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('Error in superadmin add:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

