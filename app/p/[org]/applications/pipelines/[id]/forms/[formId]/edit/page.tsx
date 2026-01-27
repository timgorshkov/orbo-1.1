import { requireOrgAccess } from '@/lib/orgGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { notFound } from 'next/navigation'
import FormEditor from '../../new/form-editor'

export default async function EditFormPage({
  params
}: {
  params: Promise<{ org: string; id: string; formId: string }>
}) {
  const { org: orgId, id: pipelineId, formId } = await params
  
  try {
    const { role } = await requireOrgAccess(orgId)
    
    if (role !== 'owner' && role !== 'admin') {
      return notFound()
    }
    
    const supabase = createAdminServer()
    
    // Get form
    const { data: form, error } = await supabase
      .from('application_forms')
      .select('*')
      .eq('id', formId)
      .single()
    
    if (error || !form) {
      return notFound()
    }
    
    // Verify form belongs to this org's pipeline
    const { data: pipeline } = await supabase
      .from('application_pipelines')
      .select('id, name, org_id')
      .eq('id', form.pipeline_id)
      .single()
    
    if (!pipeline || pipeline.org_id !== orgId) {
      return notFound()
    }

    return (
      <FormEditor 
        orgId={orgId}
        pipelineId={pipelineId}
        existingForm={form}
        isEdit={true}
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
