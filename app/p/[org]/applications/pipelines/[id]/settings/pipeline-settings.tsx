'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
interface PipelineSettingsProps {
  orgId: string
  pipeline: any
  stages: any[]
  formsCount: number
  applicationsCount: number
  orgGroups: Array<{ tg_chat_id: string | number; title: string }>
}

export default function PipelineSettings({
  orgId,
  pipeline,
  stages,
  formsCount,
  applicationsCount,
  orgGroups
}: PipelineSettingsProps) {
  const router = useRouter()
  const [name, setName] = useState(pipeline.name)
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    pipeline.telegram_group_id ? String(pipeline.telegram_group_id) : ''
  )
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleUpdate = async () => {
    setIsUpdating(true)
    setError(null)
    
    try {
      const updateData: any = {
        name: name.trim()
      }
      
      // Only include telegram_group_id for join_request pipelines
      if (pipeline.pipeline_type === 'join_request') {
        updateData.telegram_group_id = selectedGroupId ? Number(selectedGroupId) : null
      }
      
      const res = await fetch(`/api/applications/pipelines/${pipeline.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Не удалось обновить воронку')
      }
      
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (deleteConfirmText !== pipeline.name) {
      setError('Введите название воронки для подтверждения')
      return
    }
    
    setIsDeleting(true)
    setError(null)
    
    try {
      const res = await fetch(`/api/applications/pipelines/${pipeline.id}`, {
        method: 'DELETE'
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Не удалось удалить воронку')
      }
      
      router.push(`/p/${orgId}/applications`)
    } catch (err: any) {
      setError(err.message)
      setIsDeleting(false)
    }
  }

  const canDelete = formsCount === 0 && applicationsCount === 0

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href={`/p/${orgId}/applications/pipelines/${pipeline.id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Настройки воронки</h1>
          <p className="text-neutral-500">{pipeline.name}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Основные настройки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Название воронки</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название..."
              />
            </div>
            
            {/* Telegram Group Selection (only for join_request) */}
            {pipeline.pipeline_type === 'join_request' && (
              <div className="space-y-2">
                <Label htmlFor="telegram_group">Telegram группа</Label>
                <select
                  id="telegram_group"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Не выбрана</option>
                  {orgGroups.map((group) => (
                    <option key={String(group.tg_chat_id)} value={String(group.tg_chat_id)}>
                      {group.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-neutral-500">
                  Заявки на вступление в эту группу будут попадать в данную воронку
                </p>
              </div>
            )}
            
            {error && !showDeleteConfirm && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            
            <Button
              onClick={handleUpdate}
              disabled={isUpdating || name.trim() === ''}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : (
                'Сохранить изменения'
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Статистика</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-3 gap-4 text-center">
              <div>
                <dt className="text-sm text-neutral-500">Статусов</dt>
                <dd className="text-2xl font-bold">{stages.length}</dd>
              </div>
              <div>
                <dt className="text-sm text-neutral-500">Форм</dt>
                <dd className="text-2xl font-bold">{formsCount}</dd>
              </div>
              <div>
                <dt className="text-sm text-neutral-500">Заявок</dt>
                <dd className="text-2xl font-bold">{applicationsCount}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Delete */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Опасная зона
            </CardTitle>
            <CardDescription>
              Удаление воронки необратимо и удалит все связанные данные.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!canDelete && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium mb-1">Невозможно удалить воронку</p>
                    <p>
                      Сначала удалите все формы ({formsCount}) и заявки ({applicationsCount}), 
                      связанные с этой воронкой.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {!showDeleteConfirm ? (
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={!canDelete}
                className="border-red-300 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Удалить воронку
              </Button>
            ) : (
              <div className="space-y-4 p-4 border border-red-300 rounded-lg bg-red-50">
                <div>
                  <p className="font-medium text-red-900 mb-2">
                    Это действие необратимо!
                  </p>
                  <p className="text-sm text-red-700 mb-4">
                    Для подтверждения введите название воронки: <strong>{pipeline.name}</strong>
                  </p>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Введите название..."
                    className="bg-white"
                  />
                </div>
                
                {error && (
                  <div className="p-3 bg-red-100 border border-red-300 rounded text-red-800 text-sm">
                    {error}
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeleteConfirm(false)
                      setDeleteConfirmText('')
                      setError(null)
                    }}
                    disabled={isDeleting}
                  >
                    Отмена
                  </Button>
                  <Button
                    onClick={handleDelete}
                    disabled={isDeleting || deleteConfirmText !== pipeline.name}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Удаление...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Удалить навсегда
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
