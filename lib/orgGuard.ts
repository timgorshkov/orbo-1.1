import { createClientServer } from './supabaseClient'

export async function requireOrgAccess(orgId: string) {
  const supabase = createClientServer()
  const {
    data: { user },
    error: userErr
  } = await supabase.auth.getUser()
  if (userErr || !user) throw new Error('Unauthorized')

  // Проверяем членство в org через RLS-friendly RPC (создай функцию в БД при миграции)
  const { data, error } = await supabase.rpc('is_org_member_rpc', { _org: orgId })
  if (error || !data) throw new Error('Forbidden')
  return { supabase, user }
}
