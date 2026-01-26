'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Edit, Trash2, Copy, ExternalLink, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Form {
  id: string
  name: string
  slug: string | null
  is_active: boolean
  created_at: string
  landing: any
  form_schema: any
  applications_count: number
}

interface FormsListClientProps {
  orgId: string
  pipelineId: string
  forms: Form[]
  botUsername?: string
}

export default function FormsListClient({
  orgId,
  pipelineId,
  forms,
  botUsername
}: FormsListClientProps) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const handleDelete = async (formId: string, appCount: number) => {
    if (appCount > 0) {
      alert(`Невозможно удалить форму с ${appCount} заявками`)
      return
    }
    
    if (!confirm('Удалить эту форму? Это действие необратимо.')) {
      return
    }
    
    setDeletingId(formId)
    
    try {
      const res = await fetch(`/api/applications/forms/${formId}`, {
        method: 'DELETE'
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка удаления')
      }
      
      router.refresh()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleActive = async (formId: string, currentState: boolean) => {
    setTogglingId(formId)
    
    try {
      const res = await fetch(`/api/applications/forms/${formId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentState })
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка')
      }
      
      router.refresh()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setTogglingId(null)
    }
  }

  const getMiniAppLink = (formId: string) => {
    const bot = botUsername || 'orbo_community_bot'
    return `https://t.me/${bot}?startapp=apply-${formId}`
  }

  const handleCopyLink = (formId: string) => {
    const link = getMiniAppLink(formId)
    navigator.clipboard.writeText(link)
  }

  return (
    <div className="space-y-4">
      {forms.map((form) => {
        const miniAppLink = getMiniAppLink(form.id)
        const hasLanding = form.landing && Object.keys(form.landing).some(k => form.landing[k])
        const hasFields = form.form_schema && form.form_schema.length > 0
        
        return (
          <Card key={form.id} className={!form.is_active ? 'opacity-60' : ''}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle>{form.name}</CardTitle>
                    {!form.is_active && (
                      <span className="px-2 py-0.5 text-xs bg-neutral-200 text-neutral-600 rounded-full">
                        Неактивна
                      </span>
                    )}
                  </div>
                  <CardDescription className="mt-1 space-y-1">
                    <div>Создана: {new Date(form.created_at).toLocaleDateString('ru-RU')}</div>
                    <div className="flex items-center gap-3 text-sm">
                      <span>Заявок: <strong>{form.applications_count}</strong></span>
                      {hasLanding ? (
                        <span className="text-green-600">✓ Лендинг настроен</span>
                      ) : (
                        <span className="text-amber-600">⚠ Лендинг не настроен</span>
                      )}
                      {hasFields ? (
                        <span className="text-green-600">✓ Поля: {form.form_schema.length}</span>
                      ) : (
                        <span className="text-amber-600">⚠ Нет полей</span>
                      )}
                    </div>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* MiniApp Link */}
                <div className="flex items-center gap-2 p-3 bg-neutral-50 rounded-lg border text-sm">
                  <span className="flex-1 font-mono text-xs text-neutral-600 truncate">
                    {miniAppLink}
                  </span>
                  <button 
                    className="p-1.5 hover:bg-neutral-200 rounded"
                    title="Копировать ссылку"
                    onClick={() => handleCopyLink(form.id)}
                  >
                    <Copy className="w-4 h-4 text-neutral-500" />
                  </button>
                  <a 
                    href={miniAppLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 hover:bg-neutral-200 rounded"
                    title="Открыть"
                  >
                    <ExternalLink className="w-4 h-4 text-neutral-500" />
                  </a>
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Link href={`/p/${orgId}/applications/pipelines/${pipelineId}/forms/${form.id}/edit`}>
                    <Button variant="outline" size="sm">
                      <Edit className="w-4 h-4 mr-1" />
                      Редактировать
                    </Button>
                  </Link>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleToggleActive(form.id, form.is_active)}
                    disabled={togglingId === form.id}
                  >
                    {togglingId === form.id ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : form.is_active ? (
                      <ToggleRight className="w-4 h-4 mr-1" />
                    ) : (
                      <ToggleLeft className="w-4 h-4 mr-1" />
                    )}
                    {form.is_active ? 'Деактивировать' : 'Активировать'}
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleDelete(form.id, form.applications_count)}
                    disabled={deletingId === form.id || form.applications_count > 0}
                    className="text-red-600 hover:bg-red-50 border-red-200"
                  >
                    {deletingId === form.id ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-1" />
                    )}
                    Удалить
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
