import { createServerClient } from "@supabase/ssr"
import { cookies, headers } from "next/headers"
import { createClient } from '@supabase/supabase-js'

export async function createClientServer() {
  const cookieStore = await cookies()
  const hdrs = await headers()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: name => cookieStore.get(name)?.value,
        set: (name, value, opts) => {
          cookieStore.set({ name, value, ...opts })
        },
        remove: (name, opts) => { cookieStore.set({ name, value: "", ...opts }); },
      }
    }
  )
}

// Функция для серверных компонентов с использованием сервисной роли
export function createAdminServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Используйте сервисную роль
    { auth: { persistSession: false } }
  )
}
