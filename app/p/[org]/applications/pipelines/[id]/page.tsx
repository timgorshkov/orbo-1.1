import { requireOrgAccess } from '@/lib/orgGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Settings, Plus, Link as LinkIcon, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
    
    // Build MiniApp link
    const form = forms?.[0]
    const miniAppLink = form 
      ? `https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}?startapp=apply-${form.id}`
      : null

    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 border-b bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/p/${orgId}/applications`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-semibold flex items-center gap-2">
                  {pipeline.name}
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    pipeline.pipeline_type === 'join_request' 
                      ? 'bg-green-100 text-green-700'
                      : pipeline.pipeline_type === 'service'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-neutral-100 text-neutral-700'
                  }`}>
                    {pipeline.pipeline_type === 'join_request' ? 'Вступление' 
                      : pipeline.pipeline_type === 'service' ? 'Услуги' 
                      : 'Кастомная'}
                  </span>
                </h1>
                {pipeline.description && (
                  <p className="text-sm text-neutral-500">{pipeline.description}</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* MiniApp Link */}
              {miniAppLink && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-50 rounded-lg border">
                  <LinkIcon className="w-4 h-4 text-neutral-400" />
                  <code className="text-xs text-neutral-600 max-w-[200px] truncate">
                    {miniAppLink}
                  </code>
                  <button 
                    className="p-1 hover:bg-neutral-200 rounded"
                    title="Копировать ссылку"
                    onClick={() => navigator.clipboard.writeText(miniAppLink)}
                  >
                    <Copy className="w-3.5 h-3.5 text-neutral-500" />
                  </button>
                  <a 
                    href={miniAppLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 hover:bg-neutral-200 rounded"
                    title="Открыть"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-neutral-500" />
                  </a>
                </div>
              )}
              
              {/* Create Form */}
              {!form && (
                <Link href={`/p/${orgId}/applications/pipelines/${pipelineId}/forms/new`}>
                  <Button variant="outline" size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    Создать форму
                  </Button>
                </Link>
              )}
              
              {/* Settings */}
              <Link href={`/p/${orgId}/applications/pipelines/${pipelineId}/settings`}>
                <Button variant="ghost" size="icon">
                  <Settings className="w-5 h-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
        
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
