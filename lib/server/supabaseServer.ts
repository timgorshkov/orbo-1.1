/**
 * Supabase Server Utilities
 * 
 * ⚠️ DEPRECATED: Этот файл сохранён для обратной совместимости.
 * Используйте новые абстракции:
 * - import { createServerDb, createAdminDb } from '@/lib/db'
 * - import { createServerAuth } from '@/lib/auth'
 * - import { createStorage } from '@/lib/storage'
 */

import { createServerClient } from "@supabase/ssr"
import { cookies, headers } from "next/headers"
import { createClient } from '@supabase/supabase-js'

/**
 * @deprecated Используйте createServerDb() из '@/lib/db' для работы с БД
 * или getSupabaseClient() если нужен доступ к auth/storage напрямую
 */
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
            cookieStore.set({ name, value, ...opts })
          } catch (error) {
            // Silently ignore in Server Components
          }
        },
        remove: (name, opts) => {
          try {
            cookieStore.set({ name, value: "", ...opts })
          } catch (error) {
            // Silently ignore in Server Components
          }
        },
      }
    }
  )
}

/**
 * @deprecated Используйте createAdminDb() из '@/lib/db' для работы с БД
 * или getSupabaseAdminClient() если нужен доступ к auth/storage напрямую
 */
export function createAdminServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// ============================================
// Реэкспорт новых абстракций для постепенной миграции
// ============================================

// DB abstractions - импортируйте напрямую из '@/lib/db'
// Auth abstractions - импортируйте напрямую из '@/lib/auth'  
// Storage abstractions - импортируйте напрямую из '@/lib/storage'

// Хелперы для прямого доступа к Supabase (когда нужен auth/storage)
export function getSupabaseClient() {
  return createClientServer();
}

export function getSupabaseAdminClient() {
  return createAdminServer();
}
