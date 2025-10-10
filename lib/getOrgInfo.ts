import { createClientServer } from './server/supabaseServer'
import { SupabaseClient } from '@supabase/supabase-js'

export async function getOrgInfo(orgId: string) {
  const supabase = await createClientServer()
  
  // Получаем информацию об организации
  const { data, error } = await supabase
    .from('organizations')
    .select('name, plan')
    .eq('id', orgId)
    .single()
  
  if (error) {
    console.error('Error fetching organization info:', error)
    return { name: 'Организация', plan: 'free' }
  }
  
  return data
}

export async function getOrgInfoWithClient(supabase: SupabaseClient, orgId: string) {
  // Получаем информацию об организации с переданным клиентом
  const { data, error } = await supabase
    .from('organizations')
    .select('name, plan')
    .eq('id', orgId)
    .single()
  
  if (error) {
    console.error('Error fetching organization info:', error)
    return { name: 'Организация', plan: 'free' }
  }
  
  return data
}
