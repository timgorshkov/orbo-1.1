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
          try {
            // ⚠️ Cookies can only be modified in Route Handlers or Server Actions
            // In Server Components, this will fail silently to prevent errors
            cookieStore.set({ name, value, ...opts })
          } catch (error) {
            // Silently ignore cookie modification errors in Server Components
            // Token refresh will be handled by middleware or Route Handlers
            // This is expected behavior - middleware handles token refresh for all requests
          }
        },
        remove: (name, opts) => {
          try {
            cookieStore.set({ name, value: "", ...opts })
          } catch (error) {
            // Silently ignore cookie removal errors in Server Components
            // This is expected behavior - middleware handles token refresh for all requests
          }
        },
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
