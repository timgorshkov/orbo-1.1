'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Users, FileText, Sparkles, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface PipelineType {
  id: 'join_request' | 'service' | 'custom'
  title: string
  description: string
  icon: React.ReactNode
  defaultName: string
  features: string[]
}

const pipelineTypes: PipelineType[] = [
  {
    id: 'join_request',
    title: 'Заявки на вступление',
    description: 'Для приёма участников в группу или сообщество',
    icon: <Users className="w-6 h-6" />,
    defaultName: 'Заявки на вступление',
    features: [
      'Автоматическая обработка join_request из Telegram',
      'Spam scoring по профилю пользователя',
      'Автоодобрение/отклонение по правилам',
      'Анкета перед вступлением'
    ]
  },
  {
    id: 'service',
    title: 'Заявки на услуги',
    description: 'Для приёма заказов на консультации, продукты или услуги',
    icon: <FileText className="w-6 h-6" />,
    defaultName: 'Заявки на консультации',
    features: [
      'Форма заявки через MiniApp',
      'Настраиваемые поля анкеты',
      'Воронка продаж со статусами',
      'История коммуникаций'
    ]
  },
  {
    id: 'custom',
    title: 'Кастомная воронка',
    description: 'Настройте воронку под свои задачи',
    icon: <Sparkles className="w-6 h-6" />,
    defaultName: 'Новая воронка',
    features: [
      'Произвольные статусы',
      'Гибкая настройка полей',
      'Универсальное применение'
    ]
  }
]

export default function NewPipelinePage({
  params
}: {
  params: Promise<{ org: string }>
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedType = searchParams.get('type') as 'join_request' | 'service' | 'custom' | null
  
  const [step, setStep] = useState<'type' | 'details'>(preselectedType ? 'details' : 'type')
  const [selectedType, setSelectedType] = useState<PipelineType | null>(
    preselectedType ? pipelineTypes.find(t => t.id === preselectedType) || null : null
  )
  const [name, setName] = useState(selectedType?.defaultName || '')
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)

  // Resolve params
  useState(() => {
    params.then(p => setOrgId(p.org))
  })

  const handleSelectType = (type: PipelineType) => {
    setSelectedType(type)
    setName(type.defaultName)
    setStep('details')
  }

  const handleCreate = async () => {
    if (!selectedType || !orgId) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      const res = await fetch('/api/applications/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          name: name.trim() || selectedType.defaultName,
          pipeline_type: selectedType.id,
          description: description.trim() || undefined
        })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось создать воронку')
      }
      
      // Redirect to pipeline page
      router.push(`/p/${orgId}/applications/pipelines/${data.pipeline.id}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  if (!orgId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href={`/p/${orgId}/applications`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Создать воронку</h1>
          <p className="text-neutral-500">
            {step === 'type' ? 'Выберите тип воронки' : 'Настройте параметры'}
          </p>
        </div>
      </div>

      {/* Step 1: Select Type */}
      {step === 'type' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pipelineTypes.map((type) => (
            <Card 
              key={type.id}
              className="cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
              onClick={() => handleSelectType(type)}
            >
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-3">
                  {type.icon}
                </div>
                <CardTitle className="text-lg">{type.title}</CardTitle>
                <CardDescription>{type.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {type.features.map((feature, idx) => (
                    <li key={idx} className="text-sm text-neutral-600 flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Step 2: Details */}
      {step === 'details' && selectedType && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                {selectedType.icon}
              </div>
              <div>
                <CardTitle>{selectedType.title}</CardTitle>
                <CardDescription>{selectedType.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Название воронки</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={selectedType.defaultName}
              />
              <p className="text-sm text-neutral-500">
                Внутреннее название для вашего удобства
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Описание (опционально)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Для чего эта воронка..."
                rows={3}
              />
            </div>

            {/* Default Stages Preview */}
            <div className="space-y-2">
              <Label>Статусы по умолчанию</Label>
              <div className="flex flex-wrap gap-2">
                {selectedType.id === 'join_request' && (
                  <>
                    <span className="px-3 py-1 text-sm rounded-full bg-neutral-100">Новая</span>
                    <span className="px-3 py-1 text-sm rounded-full bg-amber-100 text-amber-700">Ожидает анкету</span>
                    <span className="px-3 py-1 text-sm rounded-full bg-blue-100 text-blue-700">На рассмотрении</span>
                    <span className="px-3 py-1 text-sm rounded-full bg-green-100 text-green-700">Одобрено</span>
                    <span className="px-3 py-1 text-sm rounded-full bg-red-100 text-red-700">Отклонено</span>
                    <span className="px-3 py-1 text-sm rounded-full bg-purple-100 text-purple-700">Спам</span>
                  </>
                )}
                {selectedType.id === 'service' && (
                  <>
                    <span className="px-3 py-1 text-sm rounded-full bg-neutral-100">Новая</span>
                    <span className="px-3 py-1 text-sm rounded-full bg-blue-100 text-blue-700">В работе</span>
                    <span className="px-3 py-1 text-sm rounded-full bg-amber-100 text-amber-700">Ожидает ответа</span>
                    <span className="px-3 py-1 text-sm rounded-full bg-green-100 text-green-700">Завершено</span>
                    <span className="px-3 py-1 text-sm rounded-full bg-red-100 text-red-700">Отменено</span>
                  </>
                )}
                {selectedType.id === 'custom' && (
                  <>
                    <span className="px-3 py-1 text-sm rounded-full bg-neutral-100">Новая</span>
                    <span className="px-3 py-1 text-sm rounded-full bg-green-100 text-green-700">Завершено</span>
                    <span className="px-3 py-1 text-sm rounded-full bg-red-100 text-red-700">Отменено</span>
                  </>
                )}
              </div>
              <p className="text-sm text-neutral-500">
                Статусы можно настроить после создания воронки
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setStep('type')
                  setSelectedType(null)
                }}
              >
                Назад
              </Button>
              <Button
                onClick={handleCreate}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Создание...
                  </>
                ) : (
                  'Создать воронку'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
