import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createAPILogger } from '@/lib/logger'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/organizations' });
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
    
    logger.debug({ 
      user_id: regularUser?.id,
      has_user: !!regularUser
    }, 'User data from regular client');
    
    if (regularUserError) {
      logger.warn({ 
        error: regularUserError.message
      }, 'Error getting user with regular client');
    }
    
    // Используем пользователя из стандартного клиента
    let user = regularUser
    
    // Если не получили пользователя через стандартный клиент, пробуем получить идентификатор из куки
    if (!user) {
      // Получаем все куки
      const allCookies = cookies().getAll()
      logger.debug({ 
        cookie_names: allCookies.map(c => c.name)
      }, 'Available cookies');
      
      // Проверяем, есть ли куки с идентификатором пользователя
      const sbAccessToken = cookies().get('sb-access-token')?.value
      const sbRefreshToken = cookies().get('sb-refresh-token')?.value
      
      if (sbAccessToken) {
        logger.debug({}, 'Found access token in cookies');
        
        try {
          // Пробуем получить пользователя с помощью токена
          const { data: userData, error: tokenError } = await supabase.auth.getUser(sbAccessToken)
          
          if (userData?.user) {
            user = userData.user
            logger.debug({ user_id: user.id }, 'Got user from access token');
          } else if (tokenError) {
            logger.warn({ 
              error: tokenError.message
            }, 'Error getting user with token');
          }
        } catch (e) {
          logger.error({ 
            error: e instanceof Error ? e.message : String(e)
          }, 'Exception while getting user with token');
        }
      }
    }
    
    // Если все методы не сработали, пробуем получить пользователя через админский API
    if (!user) {
      try {
        // Получаем список всех пользователей (только для отладки)
        const { data: allUsers, error: listError } = await supabase.auth.admin.listUsers()
        logger.debug({ 
          user_count: allUsers?.users?.length || 0
        }, 'All users count');
        
        if (listError) {
          logger.warn({ 
            error: listError.message
          }, 'Error listing users');
        }
      } catch (e) {
        logger.error({ 
          error: e instanceof Error ? e.message : String(e)
        }, 'Exception while listing users');
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
      logger.error({ 
        error: orgError.message,
        user_id: user.id,
        org_name: name
      }, 'Error creating organization');
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

    logger.debug({ 
      user_id: user.id,
      org_id: org.id
    }, 'Membership insertion attempt');

    if (memberError) {
      logger.error({ 
        error: memberError.message,
        user_id: user.id,
        org_id: org.id
      }, 'Error creating membership');
      return NextResponse.json(
        { error: memberError.message }, 
        { status: 400 }
      )
    }
    
    logger.info({ 
      org_id: org.id,
      user_id: user.id,
      org_name: name
    }, 'Organization created successfully');
    
    return NextResponse.json({ success: true, org_id: org.id })
    
  } catch (err: any) {
    logger.error({ 
      error: err.message || String(err),
      stack: err.stack
    }, 'Unexpected error in POST /api/organizations');
    return NextResponse.json(
      { error: err.message || 'Произошла неизвестная ошибка' }, 
      { status: 500 }
    )
  }
}