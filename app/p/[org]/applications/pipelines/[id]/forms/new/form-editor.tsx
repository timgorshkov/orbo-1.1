import NewFormPage from './page'

interface FormEditorProps {
  orgId: string
  pipelineId: string
  existingForm?: any
  isEdit?: boolean
}

export default function FormEditor(props: FormEditorProps) {
  return <NewFormPage {...props} />
}
