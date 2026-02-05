import { requireOrgAccess } from '@/lib/orgGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Inbox, Users, FileText } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default async function ApplicationsPage({
  params
}: {
  params: Promise<{ org: string }>
}) {
  const { org: orgId } = await params
  
  try {
    const { supabase, role } = await requireOrgAccess(orgId)
    
    // Only admins and owners can access
    if (role !== 'owner' && role !== 'admin') {
      return notFound()
    }
    
    const adminSupabase = createAdminServer()
    
    // Get pipelines with stats
    const { data: pipelines } = await adminSupabase
      .from('application_pipelines')
      .select(`
        id,
        name,
        pipeline_type,
        telegram_group_id,
        is_default,
        created_at
      `)
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    
    // Get telegram group names for pipelines
    const groupIds = Array.from(new Set((pipelines || []).map(p => p.telegram_group_id).filter(Boolean)))
    let telegramGroupsMap: Record<string, string> = {}
    if (groupIds.length) {
      const { data: groups } = await adminSupabase
        .from('telegram_groups')
        .select('id, title')
        .in('id', groupIds)
      telegramGroupsMap = Object.fromEntries((groups || []).map(g => [g.id, g.title]))
    }
    
    // Get counts per pipeline
    const pipelinesWithStats = await Promise.all(
      (pipelines || []).map(async (pipeline) => {
        // Get total applications
        const { count: totalCount } = await adminSupabase
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .in('form_id', (
            await adminSupabase
              .from('application_forms')
              .select('id')
              .eq('pipeline_id', pipeline.id)
          ).data?.map(f => f.id) || [])
        
        // Get pending (non-terminal) applications
        const { data: stages } = await adminSupabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', pipeline.id)
          .eq('is_terminal', false)
        
        const stageIds = stages?.map(s => s.id) || []
        
        const { count: pendingCount } = await adminSupabase
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .in('stage_id', stageIds)
        
        return {
          ...pipeline,
          total_applications: totalCount || 0,
          pending_applications: pendingCount || 0,
          telegram_group_name: pipeline.telegram_group_id ? telegramGroupsMap[pipeline.telegram_group_id] || null : null
        }
      })
    )
    
    // Get recent applications (PostgresQueryBuilder doesn't support Supabase-style joins)
    const { data: apps } = await adminSupabase
      .from('applications')
      .select('id, tg_user_data, spam_score, created_at, stage_id, form_id')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5)
    
    // Get related stages and forms separately
    let applicationsData: any[] = []
    if (apps?.length) {
      const stageIds = Array.from(new Set(apps.map(a => a.stage_id).filter(Boolean)))
      const formIds = Array.from(new Set(apps.map(a => a.form_id).filter(Boolean)))
      
      const [{ data: stages }, { data: forms }] = await Promise.all([
        stageIds.length ? adminSupabase.from('pipeline_stages').select('id, name, color').in('id', stageIds) : { data: [] },
        formIds.length ? adminSupabase.from('application_forms').select('id, name').in('id', formIds) : { data: [] }
      ])
      
      const stagesMap = Object.fromEntries((stages || []).map(s => [s.id, s]))
      const formsMap = Object.fromEntries((forms || []).map(f => [f.id, f]))
      
      applicationsData = apps.map(app => ({
        ...app,
        stage: stagesMap[app.stage_id] || null,
        form: formsMap[app.form_id] || null
      }))
    }
    
    const hasPipelines = pipelinesWithStats.length > 0
    
    return (
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Заявки</h1>
            <p className="text-neutral-500 mt-1">
              Управление заявками на вступление и услуги
            </p>
          </div>
          
          <Link href={`/p/${orgId}/applications/pipelines/new`}>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Создать воронку
            </Button>
          </Link>
        </div>
        
        {!hasPipelines ? (
          // Empty state
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <Inbox className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Нет воронок заявок</h3>
              <p className="text-neutral-500 text-center max-w-md mb-6">
                Создайте воронку для приёма заявок на вступление в группу или на ваши услуги.
                Вы сможете настроить анкету, автоматизации и отслеживать статусы.
              </p>
              <div className="flex gap-3">
                <Link href={`/p/${orgId}/applications/pipelines/new?type=join_request`}>
                  <Button variant="outline">
                    <Users className="w-4 h-4 mr-2" />
                    Заявки на вступление
                  </Button>
                </Link>
                <Link href={`/p/${orgId}/applications/pipelines/new?type=service`}>
                  <Button variant="outline">
                    <FileText className="w-4 h-4 mr-2" />
                    Заявки на услуги
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Pipelines Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pipelinesWithStats.map((pipeline) => (
                <Link 
                  key={pipeline.id} 
                  href={`/p/${orgId}/applications/pipelines/${pipeline.id}`}
                >
                  <Card className="hover:border-blue-300 transition-colors cursor-pointer h-full">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{pipeline.name}</CardTitle>
                        <span className={`px-2 py-1 text-xs rounded-full ${
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
                      </div>
                      {pipeline.telegram_group_name && (
                        <CardDescription className="line-clamp-2">
                          Группа: {pipeline.telegram_group_name}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-4 text-sm">
                        <div>
                          <span className="text-2xl font-bold text-orange-600">
                            {pipeline.pending_applications}
                          </span>
                          <span className="text-neutral-500 ml-1">ожидают</span>
                        </div>
                        <div>
                          <span className="text-2xl font-bold text-neutral-400">
                            {pipeline.total_applications}
                          </span>
                          <span className="text-neutral-500 ml-1">всего</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
            
            {/* Recent Applications */}
            {applicationsData && applicationsData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Последние заявки</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {applicationsData.map((app: any) => {
                      const userData = app.tg_user_data || {}
                      const displayName = [userData.first_name, userData.last_name].filter(Boolean).join(' ') 
                        || userData.username 
                        || 'Неизвестный'
                      
                      return (
                        <Link 
                          key={app.id}
                          href={`/p/${orgId}/applications/${app.id}`}
                          className="flex items-center justify-between p-3 rounded-lg hover:bg-neutral-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-600 font-medium">
                              {displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium">{displayName}</div>
                              <div className="text-sm text-neutral-500">
                                {app.form?.name}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {app.spam_score > 50 && (
                              <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded-full">
                                Spam: {app.spam_score}
                              </span>
                            )}
                            <span 
                              className="px-2 py-1 text-xs rounded-full"
                              style={{ 
                                backgroundColor: `${app.stage?.color}20`,
                                color: app.stage?.color
                              }}
                            >
                              {app.stage?.name}
                            </span>
                            <span className="text-sm text-neutral-400">
                              {new Date(app.created_at).toLocaleDateString('ru-RU')}
                            </span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
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
