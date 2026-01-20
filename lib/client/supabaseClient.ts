/**
 * @deprecated DEPRECATED - DO NOT USE FOR NEW CODE
 * 
 * Этот клиент обращается к удалённому Supabase, а не к локальному PostgreSQL.
 * Для новых клиентских компонентов используйте API routes вместо прямых запросов.
 * 
 * Оставшиеся использования:
 * - app/p/[org]/telegram/groups/[id]/page.tsx (TODO: мигрировать на API)
 * - app/app/[org]/telegram/message/page.tsx (TODO: мигрировать на API)
 * 
 * После миграции этих файлов - УДАЛИТЬ этот модуль.
 */
import { createBrowserClient } from "@supabase/ssr"

/**
 * @deprecated Use API routes instead of direct Supabase calls
 */
export function createClientBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}