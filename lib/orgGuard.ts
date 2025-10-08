import { createClientServer } from './server/supabaseServer'
import { cookies } from 'next/headers'

type OrgRole = 'owner' | 'admin' | 'editor' | 'member' | 'viewer';

export async function requireOrgAccess(orgId: string, cookieStore?: any, allowedRoles?: OrgRole[]) {

  // Если cookies переданы, используем их, иначе получаем из headers
  const cookiesObj = cookieStore || cookies();
  
  const supabase = createClientServer()
  const {
    data: { user },
    error: userErr
  } = await supabase.auth.getUser()
  if (userErr || !user) throw new Error('Unauthorized')

  // Проверяем членство в org через RPC
  const { data, error } = await supabase.rpc('is_org_member_rpc', { _org: orgId })
  if (error || !data) throw new Error('Forbidden')

  let role: OrgRole | null = null

  if (typeof data === 'object' && data !== null && 'role' in data) {
    role = (data as { role?: string }).role as OrgRole | undefined ?? null
  }

  if (!role) {
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError || !membership) {
      throw new Error('Forbidden')
    }

    role = membership.role as OrgRole
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    throw new Error('Forbidden')
  }

  return { supabase, user, role }
}
