// Edge Function для запуска произвольного SQL кода
// ВНИМАНИЕ: Эта функция должна быть доступна только для сервисной роли!

// @ts-ignore
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface RequestParams {
  sql: string
}

serve(async (req: Request) => {
  try {
    // Проверяем, что запрос использует сервисную роль
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Получаем параметры запроса
    const { sql } = await req.json() as RequestParams

    if (!sql) {
      return new Response(
        JSON.stringify({ error: 'Missing SQL parameter' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Создаем клиент Supabase с сервисной ролью
    const supabaseAdmin = createClient(
      // @ts-ignore
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        }
      }
    )

    // Выполняем SQL-запрос
    const { error } = await supabaseAdmin.rpc('exec_sql', { sql })

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
