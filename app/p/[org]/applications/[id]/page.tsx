import { requireOrgAccess } from '@/lib/orgGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { notFound } from 'next/navigation'
import ApplicationDetail from './application-detail'

export default async function ApplicationPage({
  params
}: {
  params: Promise<{ org: string; id: string }>
}) {
  const { org: orgId, id: applicationId } = await params
  
  try {
    const { role } = await requireOrgAccess(orgId)
    
    if (role !== 'owner' && role !== 'admin') {
      return notFound()
    }
    
    const supabase = createAdminServer()
    
    // Get application with all related data
    const { data: application, error } = await supabase
      .from('applications')
      .select(`
        *,
        form:application_forms (
          id,
          name,
          pipeline_id,
          form_schema,
          pipeline:application_pipelines (
            id,
            name,
            pipeline_type
          )
        ),
        stage:pipeline_stages (
          id,
          name,
          slug,
          color,
          is_terminal,
          terminal_type
        ),
        participant:participants (
          id,
          tg_user_id,
          username,
          full_name,
          photo_url,
          email,
          phone,
          bio
        ),
        source:application_sources (
          id,
          code,
          utm_source,
          utm_medium,
          utm_campaign,
          name
        )
      `)
      .eq('id', applicationId)
      .eq('org_id', orgId)
      .single()
    
    if (error || !application) {
      return notFound()
    }
    
    // Get event history
    const { data: events } = await supabase
      .from('application_events')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .limit(50)
    
    // Get available stages for this pipeline
    const { data: availableStages } = await supabase
      .from('pipeline_stages')
      .select('id, name, slug, color, position, is_terminal, terminal_type')
      .eq('pipeline_id', application.form.pipeline_id)
      .order('position')

    return (
      <ApplicationDetail 
        orgId={orgId}
        application={application}
        events={events || []}
        availableStages={availableStages || []}
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
