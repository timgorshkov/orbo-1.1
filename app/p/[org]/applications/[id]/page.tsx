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
    
    // Get application base data
    const { data: appData, error } = await supabase
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .eq('org_id', orgId)
      .single()
    
    if (error || !appData) {
      return notFound()
    }
    
    // Get related data separately (PostgresQueryBuilder doesn't support Supabase-style joins)
    const [
      { data: form },
      { data: stage },
      { data: participant },
      { data: source },
      { data: events }
    ] = await Promise.all([
      appData.form_id 
        ? supabase.from('application_forms').select('id, name, pipeline_id, form_schema').eq('id', appData.form_id).single()
        : { data: null },
      appData.stage_id
        ? supabase.from('pipeline_stages').select('id, name, slug, color, is_terminal, terminal_type').eq('id', appData.stage_id).single()
        : { data: null },
      appData.participant_id
        ? supabase.from('participants').select('id, tg_user_id, username, full_name, photo_url, email, phone, bio').eq('id', appData.participant_id).single()
        : { data: null },
      appData.source_id
        ? supabase.from('application_sources').select('id, code, utm_source, utm_medium, utm_campaign, name').eq('id', appData.source_id).single()
        : { data: null },
      supabase.from('application_events').select('*').eq('application_id', applicationId).order('created_at', { ascending: false }).limit(50)
    ])
    
    // Get pipeline info if we have a form
    let pipeline = null
    if (form?.pipeline_id) {
      const { data: pipelineData } = await supabase
        .from('application_pipelines')
        .select('id, name, pipeline_type')
        .eq('id', form.pipeline_id)
        .single()
      pipeline = pipelineData
    }
    
    // Compose application object
    const application = {
      ...appData,
      form: form ? { ...form, pipeline } : null,
      stage,
      participant,
      source
    }
    
    // Get available stages for this pipeline
    const pipelineId = form?.pipeline_id
    const { data: availableStages } = pipelineId
      ? await supabase
          .from('pipeline_stages')
          .select('id, name, slug, color, position, is_terminal, terminal_type')
          .eq('pipeline_id', pipelineId)
          .order('position')
      : { data: [] }
    
    // Get all forms for this pipeline
    const { data: pipelineFormsRaw } = pipelineId
      ? await supabase
          .from('application_forms')
          .select('id, name')
          .eq('pipeline_id', pipelineId)
          .order('created_at')
      : { data: [] }

    const pipelineForms = pipelineFormsRaw || []

    // Auto-created form: name = 'Заявка (авто)' OR pipeline has no real form fields
    // form_schema may come as array or JSON string, handle both
    const formSchemaFields: any[] = Array.isArray(form?.form_schema)
      ? form.form_schema
      : (typeof form?.form_schema === 'string' ? JSON.parse(form.form_schema || '[]') : [])
    const isAutoForm = !!form && (
      form.name === 'Заявка (авто)' || formSchemaFields.length === 0
    )
    
    // Get participant's group memberships for this org
    let participantGroups: { id: string; title: string }[] = []
    if (participant?.id) {
      // Note: participant_groups uses tg_group_id, not tg_chat_id
      const { data: groupMemberships } = await supabase
        .from('participant_groups')
        .select('tg_group_id')
        .eq('participant_id', participant.id)
        .eq('is_active', true)
      
      if (groupMemberships?.length) {
        // Get org's telegram groups
        const { data: orgGroups } = await supabase
          .from('org_telegram_groups')
          .select('tg_chat_id')
          .eq('org_id', orgId)
        
        const orgChatIds = new Set((orgGroups || []).map(g => String(g.tg_chat_id)))
        const participantChatIds = groupMemberships.map(g => String(g.tg_group_id)).filter(id => orgChatIds.has(id))
        
        if (participantChatIds.length) {
          const { data: groups } = await supabase
            .from('telegram_groups')
            .select('tg_chat_id, title')
            .in('tg_chat_id', participantChatIds)
          
          participantGroups = (groups || []).map(g => ({ id: String(g.tg_chat_id), title: g.title }))
        }
      }
    }

    return (
      <ApplicationDetail 
        orgId={orgId}
        application={application}
        events={events || []}
        availableStages={availableStages || []}
        pipelineForms={pipelineForms}
        participantGroups={participantGroups}
        isAutoForm={isAutoForm}
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
