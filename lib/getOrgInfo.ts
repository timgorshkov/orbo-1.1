import { createClientServer } from './server/supabaseServer'
// SupabaseClient type replaced with 'any' after Supabase removal
type SupabaseClient = any
import { createServiceLogger } from './logger'

export async function getOrgInfo(orgId: string) {
  const logger = createServiceLogger('getOrgInfo');
  const supabase = await createClientServer()
  
  // Получаем информацию об организации
  const { data, error } = await supabase
    .from('organizations')
    .select('name, plan')
    .eq('id', orgId)
    .single()
  
  if (error) {
    logger.error({ 
      error: error.message,
      org_id: orgId
    }, 'Error fetching organization info');
    return { name: 'Организация', plan: 'free' }
  }
  
  return data
}

export async function getOrgInfoWithClient(supabase: SupabaseClient, orgId: string) {
  const logger = createServiceLogger('getOrgInfoWithClient');
  // Получаем информацию об организации с переданным клиентом
  const { data, error } = await supabase
    .from('organizations')
    .select('name, plan')
    .eq('id', orgId)
    .single()
  
  if (error) {
    logger.error({ 
      error: error.message,
      org_id: orgId
    }, 'Error fetching organization info');
    return { name: 'Организация', plan: 'free' }
  }
  
  return data
}
