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
    
    const supabase = await createClientServer()
    const supabaseAdmin = createAdminServer()
    
    // Получаем current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Ищем пользователя по email в auth
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers()
    const targetUser = authUsers.users.find(u => u.email === email)
    
    if (!targetUser) {
      return NextResponse.json({ 
        error: 'Пользователь с таким email не найден. Сначала он должен зарегистрироваться.' 
      }, { status: 404 })
    }
    
    // Проверяем что ещё не суперадмин
    const { data: existing } = await supabase
      .from('superadmins')
      .select('id')
      .eq('user_id', targetUser.id)
      .maybeSingle()
    
    if (existing) {
      return NextResponse.json({ error: 'Уже является суперадмином' }, { status: 400 })
    }
    
    // Добавляем
    const { error: insertError } = await supabase
      .from('superadmins')
      .insert({
        user_id: targetUser.id,
        email: email,
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

