import { requireOrgAccess } from '@/lib/orgGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { notFound } from 'next/navigation'
import PipelineHeader from './pipeline-header'
import PipelineKanban from './pipeline-kanban'

export default async function PipelinePage({
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
    
    // Get pipeline base data
    const { data: pipeline, error } = await supabase
      .from('application_pipelines')
      .select('id, name, description, pipeline_type, telegram_group_id, is_active, created_at')
      .eq('id', pipelineId)
      .eq('org_id', orgId)
      .single()
    
    if (error || !pipeline) {
      return notFound()
    }
    
    // Get stages for this pipeline separately
    const { data: stagesData } = await supabase
      .from('pipeline_stages')
      .select('id, name, slug, color, position, is_initial, is_terminal, terminal_type, auto_actions')
      .eq('pipeline_id', pipelineId)
      .order('position')
    
    const stages = stagesData || []
    
    // Get forms for this pipeline
    const { data: forms } = await supabase
      .from('application_forms')
      .select('id, name, slug, is_active')
      .eq('pipeline_id', pipelineId)
      .eq('is_active', true)
    
    // Get applications (without participant join)
    const formIds = forms?.map(f => f.id) || []
    const { data: applicationsData } = formIds.length
      ? await supabase
          .from('applications')
          .select('id, stage_id, tg_user_id, tg_user_data, form_data, form_filled_at, spam_score, spam_reasons, created_at, participant_id')
          .eq('org_id', orgId)
          .in('form_id', formIds)
          .order('created_at', { ascending: false })
      : { data: [] }
    
    // Get participants separately
    let applications: any[] = applicationsData || []
    if (applications.length) {
      const participantIds = Array.from(new Set(applications.map(a => a.participant_id).filter(Boolean)))
      if (participantIds.length) {
        const { data: participants } = await supabase
          .from('participants')
          .select('id, username, full_name, photo_url')
          .in('id', participantIds)
        
        const participantsMap = Object.fromEntries((participants || []).map(p => [p.id, p]))
        applications = applications.map(app => ({
          ...app,
          participant: app.participant_id ? participantsMap[app.participant_id] || null : null
        }))
      } else {
        applications = applications.map(app => ({ ...app, participant: null }))
      }
    }
    
    // Group applications by stage
    const applicationsByStage: Record<string, any[]> = {}
    stages.forEach((stage: any) => {
      applicationsByStage[stage.id] = []
    })
    
    applications?.forEach((app: any) => {
      if (applicationsByStage[app.stage_id]) {
        applicationsByStage[app.stage_id].push(app)
      }
    })
    
    // Get stage stats
    const stageStats: Record<string, number> = {}
    stages.forEach((stage: any) => {
      stageStats[stage.id] = applicationsByStage[stage.id]?.length || 0
    })
    
    // Get Telegram group name (telegram_group_id is tg_chat_id bigint)
    let telegramGroupName: string | null = null
    if (pipeline.telegram_group_id) {
      const { data: groupData } = await supabase
        .from('telegram_groups')
        .select('title')
        .eq('tg_chat_id', pipeline.telegram_group_id)
        .single()
      telegramGroupName = groupData?.title || null
    }
    
    const hasForm = forms && forms.length > 0

    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <PipelineHeader
          orgId={orgId}
          pipelineId={pipelineId}
          pipelineName={pipeline.name}
          pipelineType={pipeline.pipeline_type}
          telegramGroupName={telegramGroupName}
          hasForm={!!hasForm}
        />
        
        {/* Kanban Board */}
        <div className="flex-1 overflow-hidden">
          <PipelineKanban 
            orgId={orgId}
            pipelineId={pipelineId}
            stages={stages}
            applicationsByStage={applicationsByStage}
            stageStats={stageStats}
          />
        </div>
      </div>
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage === 'Unauthorized' || errorMessage === 'Forbidden') {
      return notFound()
    }
    throw error
  }
}
