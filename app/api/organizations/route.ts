import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json()
    // Используем сервисную роль для обхода RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Проверяем авторизацию пользователя
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
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