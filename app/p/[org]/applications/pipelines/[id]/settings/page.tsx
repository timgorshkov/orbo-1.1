import { requireOrgAccess } from '@/lib/orgGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { notFound } from 'next/navigation'
import PipelineSettings from './pipeline-settings'

export default async function PipelineSettingsPage({
  params
}: {
  params: Promise<{ org: string; id: string }>
}) {
  const { org: orgId, id: pipelineId } = await params
  
  try {
    const { role } = await requireOrgAccess(orgId)
    
    if (role !== 'owner' && role !== 'admin') {
      return notFound()
    }
    
    const supabase = createAdminServer()
    
    // Get pipeline
    const { data: pipeline, error } = await supabase
      .from('application_pipelines')
      .select('*')
      .eq('id', pipelineId)
      .eq('org_id', orgId)
      .single()
    
    if (error || !pipeline) {
      return notFound()
    }
    
    // Get stages
    const { data: stages } = await supabase
      .from('pipeline_stages')
      .select('*')
      .eq('pipeline_id', pipelineId)
      .order('position')
    
    // Get forms count
    const { count: formsCount } = await supabase
      .from('application_forms')
      .select('id', { count: 'exact', head: true })
      .eq('pipeline_id', pipelineId)
    
    // Get applications count
    const { count: applicationsCount } = await supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('form_id', (
        await supabase
          .from('application_forms')
          .select('id')
          .eq('pipeline_id', pipelineId)
      ).data?.map(f => f.id) || [])
    
    // Get org's telegram groups (for join_request pipeline type)
    const { data: orgGroups } = await supabase
      .from('telegram_groups')
      .select('tg_chat_id, title, username')
      .eq('org_id', orgId)
      .order('title')

    return (
      <PipelineSettings 
        orgId={orgId}
        pipeline={pipeline}
        stages={stages || []}
        formsCount={formsCount || 0}
        applicationsCount={applicationsCount || 0}
        orgGroups={orgGroups || []}
      />
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage === 'Unauthorized' || errorMessage === 'Forbidden') {
      return notFound()
    }
    throw error
  }
}
