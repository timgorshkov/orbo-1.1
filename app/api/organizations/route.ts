import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json()
    // Используем сервисную роль для обхода RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Сначала получаем пользователя из стандартного клиента с куками
    const regularSupabase = await createClientServer()
    const { data: { user: regularUser }, error: regularUserError } = await regularSupabase.auth.getUser()
    
    console.log('User data from regular client:', regularUser ? `User ID: ${regularUser.id}` : 'No user')
    
    if (regularUserError) {
      console.error('Error getting user with regular client:', regularUserError)
    }
    
    // Используем пользователя из стандартного клиента
    let user = regularUser
    
    // Если не получили пользователя через стандартный клиент, пробуем получить идентификатор из куки
    if (!user) {
      // Получаем все куки
      const allCookies = cookies().getAll()
      console.log('Available cookies:', allCookies.map(c => c.name))
      
      // Проверяем, есть ли куки с идентификатором пользователя
      const sbAccessToken = cookies().get('sb-access-token')?.value
      const sbRefreshToken = cookies().get('sb-refresh-token')?.value
      
      if (sbAccessToken) {
        console.log('Found access token in cookies')
        
        try {
          // Пробуем получить пользователя с помощью токена
          const { data: userData, error: tokenError } = await supabase.auth.getUser(sbAccessToken)
          
          if (userData?.user) {
            user = userData.user
            console.log('Got user from access token:', user.id)
          } else if (tokenError) {
            console.error('Error getting user with token:', tokenError)
          }
        } catch (e) {
          console.error('Exception while getting user with token:', e)
        }
      }
    }
    
    // Если все методы не сработали, пробуем получить пользователя через админский API
    if (!user) {
      try {
        // Получаем список всех пользователей (только для отладки)
        const { data: allUsers, error: listError } = await supabase.auth.admin.listUsers()
        console.log('All users count:', allUsers?.users?.length || 0)
        
        if (listError) {
          console.error('Error listing users:', listError)
        }
      } catch (e) {
        console.error('Exception while listing users:', e)
      }
    }
    
    const userError = regularUserError
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' }, 
        { status: 401 }
      )
    }

    // Создаем новую организацию (с серверной стороны обходит RLS)
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: name.trim(),
        plan: 'free' // Базовый план по умолчанию
      })
      .select('id')
      .single()
    
    if (orgError) {
      console.error('Error creating organization:', orgError)
      return NextResponse.json(
        { error: orgError.message }, 
        { status: 400 }
      )
    }
    
    // Создаем членство для текущего пользователя как владельца
    const { error: memberError } = await supabase
      .from('memberships')
      .insert({
        org_id: org.id,
        user_id: user.id,
        role: 'owner' // Роль владельца
      })

    console.log("Membership insertion attempt for user:", user.id, "org:", org.id);

    if (memberError) {
      console.error('Error creating membership:', memberError)
      return NextResponse.json(
        { error: memberError.message }, 
        { status: 400 }
      )
    }
    
    return NextResponse.json({ success: true, org_id: org.id })
    
  } catch (err: any) {
    console.error('Unexpected error:', err)
    return NextResponse.json(
      { error: err.message || 'Произошла неизвестная ошибка' }, 
      { status: 500 }
    )
  }
}