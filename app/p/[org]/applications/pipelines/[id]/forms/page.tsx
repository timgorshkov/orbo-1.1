import { requireOrgAccess } from '@/lib/orgGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import FormsListClient from './forms-list-client'

export default async function PipelineFormsPage({
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
      .select('id, name, pipeline_type')
      .eq('id', pipelineId)
      .eq('org_id', orgId)
      .single()
    
    if (error || !pipeline) {
      return notFound()
    }
    
    // Get forms for this pipeline
    const { data: forms } = await supabase
      .from('application_forms')
      .select('id, name, slug, is_active, created_at, landing, form_schema')
      .eq('pipeline_id', pipelineId)
      .order('created_at', { ascending: false })
    
    // Get application counts per form
    const formsWithCounts = await Promise.all(
      (forms || []).map(async (form) => {
        const { count } = await supabase
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .eq('form_id', form.id)
        
        return {
          ...form,
          applications_count: count || 0
        }
      })
    )

    return (
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href={`/p/${orgId}/applications/pipelines/${pipelineId}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold">Формы заявок</h1>
              <p className="text-neutral-500">{pipeline.name}</p>
            </div>
          </div>
          
          <Link href={`/p/${orgId}/applications/pipelines/${pipelineId}/forms/new`}>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Создать форму
            </Button>
          </Link>
        </div>

        {/* Forms List */}
        {formsWithCounts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Нет форм</h3>
              <p className="text-neutral-500 text-center max-w-md mb-6">
                Создайте форму заявки, чтобы пользователи могли заполнить её через Telegram MiniApp
              </p>
              <Link href={`/p/${orgId}/applications/pipelines/${pipelineId}/forms/new`}>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Создать первую форму
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <FormsListClient 
            orgId={orgId}
            pipelineId={pipelineId}
            forms={formsWithCounts}
            botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}
          />
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
