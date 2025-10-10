import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // 1. Получаем сессию через стандартный клиент
    const regularSupabase = await createClientServer()
    const { data: sessionData, error: sessionError } = await regularSupabase.auth.getSession()
    
    // 2. Получаем информацию о пользователе через стандартный клиент
    const { data: userData, error: userError } = await regularSupabase.auth.getUser()
    
    // 3. Создаем клиент с сервисной ролью
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // 4. Получаем информацию о пользователе через сервисную роль
    const { data: adminUserData, error: adminUserError } = await supabaseAdmin.auth.getUser(
      sessionData?.session?.access_token || undefined
    )
    
    // 5. Проверяем организации через стандартный клиент
    let orgsData = null
    let orgsError = null
    if (userData?.user) {
      const result = await regularSupabase
        .from('memberships')
        .select('org_id, role, organizations(id, name)')
        .eq('user_id', userData.user.id)
      
      orgsData = result.data
      orgsError = result.error
    }
    
    // 6. Проверяем организации через сервисную роль
    let adminOrgsData = null
    let adminOrgsError = null
    if (adminUserData?.user) {
      const result = await supabaseAdmin
        .from('memberships')
        .select('org_id, role, organizations(id, name)')
        .eq('user_id', adminUserData.user.id)
      
      adminOrgsData = result.data
      adminOrgsError = result.error
    }
    
    // 7. Проверяем все организации через сервисную роль
    const allOrgsResult = await supabaseAdmin
      .from('organizations')
      .select('*')
    
    // 8. Проверяем все членства через сервисную роль
    const allMembershipsResult = await supabaseAdmin
      .from('memberships')
      .select('*')
    
    // Собираем все данные для диагностики
    const diagnosticData = {
      session: {
        exists: !!sessionData?.session,
        error: sessionError?.message,
        userId: sessionData?.session?.user?.id,
        expiresAt: sessionData?.session?.expires_at,
      },
      regularUser: {
        exists: !!userData?.user,
        error: userError?.message,
        id: userData?.user?.id,
        email: userData?.user?.email,
      },
      adminUser: {
        exists: !!adminUserData?.user,
        error: adminUserError?.message,
        id: adminUserData?.user?.id,
        email: adminUserData?.user?.email,
      },
      organizations: {
        regularClient: {
          count: orgsData?.length || 0,
          error: orgsError?.message,
          data: orgsData,
        },
        serviceRole: {
          count: adminOrgsData?.length || 0,
          error: adminOrgsError?.message,
          data: adminOrgsData,
        },
        allOrgs: {
          count: allOrgsResult.data?.length || 0,
          error: allOrgsResult.error?.message,
          data: allOrgsResult.data,
        },
        allMemberships: {
          count: allMembershipsResult.data?.length || 0,
          error: allMembershipsResult.error?.message,
          data: allMembershipsResult.data,
        }
      },
      cookies: {
        count: cookies().getAll().length,
        names: cookies().getAll().map(c => c.name),
      }
    }
    
    return NextResponse.json(diagnosticData)
  } catch (err: any) {
    console.error('Diagnostic error:', err)
    return NextResponse.json(
      { error: err.message || 'Произошла неизвестная ошибка' }, 
      { status: 500 }
    )
  }
}
