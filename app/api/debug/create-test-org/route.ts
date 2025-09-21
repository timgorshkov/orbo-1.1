import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' }, 
        { status: 400 }
      )
    }
    
    // Создаем клиент с сервисной ролью
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Проверяем, существует ли пользователь
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)
    
    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: `User not found: ${userError?.message || 'Unknown error'}` }, 
        { status: 404 }
      )
    }
    
    // Создаем тестовую организацию
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: `Test Org ${new Date().toISOString().slice(0, 10)}`,
        plan: 'free'
      })
      .select('id')
      .single()
    
    if (orgError) {
      return NextResponse.json(
        { error: `Failed to create organization: ${orgError.message}` }, 
        { status: 500 }
      )
    }
    
    // Создаем членство для пользователя
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('memberships')
      .insert({
        org_id: org.id,
        user_id: userId,
        role: 'owner'
      })
      .select('id')
      .single()
    
    if (membershipError) {
      return NextResponse.json(
        { error: `Failed to create membership: ${membershipError.message}` }, 
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      organization: org,
      membership: membership
    })
    
  } catch (err: any) {
    console.error('Error creating test organization:', err)
    return NextResponse.json(
      { error: err.message || 'Произошла неизвестная ошибка' }, 
      { status: 500 }
    )
  }
}
