import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedSession } from '@/lib/auth/unified-auth'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/organizations' });
  try {
    const { name } = await req.json()
    
    // Используем сервисную роль для обхода RLS
    const supabase = createAdminServer()

    // Используем unified auth для поддержки Supabase и NextAuth пользователей
    const session = await getUnifiedSession();
    
    logger.debug({ 
      user_id: session?.user?.id,
      provider: session?.provider,
      has_session: !!session
    }, 'User data from unified auth');
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' }, 
        { status: 401 }
      )
    }
    
    const user = { id: session.user.id, email: session.user.email };

    // Создаем новую организацию (с серверной стороны обходит RLS)
    const insertData = {
      name: name.trim(),
      plan: 'free' // Базовый план по умолчанию
    };
    
    logger.info({ 
      insert_data: insertData,
      user_id: user.id
    }, 'Attempting to insert organization');
    
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert(insertData)
      .select('id, name, created_at')
      .single()
    
    logger.info({ 
      org_data: org,
      org_error: orgError?.message,
      org_id: org?.id,
      org_name: org?.name,
      org_created_at: org?.created_at
    }, 'Organization insert result');
    
    if (orgError) {
      logger.error({ 
        error: orgError.message,
        code: orgError.code,
        details: orgError.details,
        user_id: user.id,
        org_name: name
      }, 'Error creating organization');
      return NextResponse.json(
        { error: orgError.message }, 
        { status: 400 }
      )
    }
    
    // Проверяем что ID новый (а не существующий)
    if (org.name !== insertData.name) {
      logger.error({ 
        expected_name: insertData.name,
        actual_name: org.name,
        org_id: org.id,
        created_at: org.created_at
      }, 'CRITICAL: Organization name mismatch! Insert returned wrong organization');
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
    
    // Sync to CRM (non-blocking)
    import('@/lib/services/weeekService').then(({ onOrganizationCreated }) => {
      onOrganizationCreated(user.id, org.id, name.trim()).catch(() => {});
    }).catch(() => {});
    
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