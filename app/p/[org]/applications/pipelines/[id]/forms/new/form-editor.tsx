import NewFormPage from './page'

interface FormEditorProps {
  orgId: string
  pipelineId: string
  existingForm?: any
  isEdit?: boolean
  orgName?: string
  orgLogoUrl?: string | null
}

export default function FormEditor(props: FormEditorProps) {
  return <NewFormPage {...props} />
}
