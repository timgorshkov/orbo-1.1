import { createServerClient } from "@supabase/ssr"
import { cookies, headers } from "next/headers"

export function createClientServer() {
  const cookieStore = cookies()
  const hdrs = headers()
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