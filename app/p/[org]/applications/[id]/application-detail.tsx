'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  MessageCircle,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ExternalLink,
  History,
  FileText,
  Tag,
  Loader2,
  Send,
  Trash2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Stage {
  id: string
  name: string
  slug: string
  color: string
  position: number
  is_terminal: boolean
  terminal_type: string | null
}

interface ApplicationDetailProps {
  orgId: string
  application: any
  events: any[]
  availableStages: Stage[]
}

export default function ApplicationDetail({
  orgId,
  application,
  events,
  availableStages
}: ApplicationDetailProps) {
  const router = useRouter()
  const [selectedStage, setSelectedStage] = useState(application.stage_id)
  const [notes, setNotes] = useState(application.notes || '')
  const [isUpdating, setIsUpdating] = useState(false)
  const [showStageDropdown, setShowStageDropdown] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const userData = application.tg_user_data || {}
  const participant = application.participant
  const currentStage = application.stage
  const source = application.source
  const utmData = application.utm_data || {}

  const displayName = participant?.full_name 
    || [userData.first_name, userData.last_name].filter(Boolean).join(' ')
    || userData.username
    || `User ${application.tg_user_id}`

  const username = participant?.username || userData.username
  const photoUrl = participant?.photo_url || userData.photo_url

  // Get display stage from local state (selectedStage) - must be defined before handleStageChange
  const displayStage = availableStages.find(s => s.id === selectedStage) || currentStage

  const handleStageChange = async (newStageId: string) => {
    const prevStageId = selectedStage
    const currentDisplayStage = availableStages.find(s => s.id === selectedStage) || currentStage
    
    // Check if we can move from current display stage
    if (newStageId === selectedStage || currentDisplayStage?.is_terminal) return
    
    // Optimistic update - update local state immediately BEFORE the request
    setSelectedStage(newStageId)
    setIsUpdating(true)
    setShowStageDropdown(false)
    
    try {
      const res = await fetch(`/api/applications/${application.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: newStageId })
      })
      
      if (!res.ok) {
        // Revert on error
        setSelectedStage(prevStageId)
        const data = await res.json()
        console.error('Failed to change stage:', data.error)
      }
      // Don't call router.refresh() - we already updated local state
    } catch (err) {
      // Revert on error
      setSelectedStage(prevStageId)
      console.error('Failed to change stage:', err)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleSaveNotes = async () => {
    setIsUpdating(true)
    try {
      await fetch(`/api/applications/${application.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      })
      router.refresh()
    } catch (err) {
      console.error('Failed to save notes:', err)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/applications/${application.id}`, {
        method: 'DELETE'
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка удаления')
      }
      
      // Redirect to pipeline page
      const pipelineId = application.form?.pipeline_id
      if (pipelineId) {
        router.push(`/p/${orgId}/applications/pipelines/${pipelineId}`)
      } else {
        router.push(`/p/${orgId}/applications`)
      }
    } catch (err: any) {
      console.error('Failed to delete application:', err)
      alert(err.message)
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'created': return <FileText className="w-4 h-4" />
      case 'stage_changed': return <ChevronDown className="w-4 h-4" />
      case 'form_filled': return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case 'approved': return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case 'rejected': return <XCircle className="w-4 h-4 text-red-500" />
      case 'spam_detected': return <AlertTriangle className="w-4 h-4 text-amber-500" />
      default: return <History className="w-4 h-4" />
    }
  }

  const getEventText = (event: any) => {
    switch (event.event_type) {
      case 'created': return 'Заявка создана'
      case 'stage_changed': 
        return `Статус изменён: ${event.data?.from_stage_name} → ${event.data?.to_stage_name}`
      case 'form_filled': return 'Анкета заполнена'
      case 'form_reminder': return 'Отправлено напоминание'
      case 'approved': return 'Заявка одобрена'
      case 'rejected': return 'Заявка отклонена'
      case 'spam_detected': return `Обнаружен спам (score: ${event.data?.score})`
      case 'tg_approved': return 'Принят в Telegram группу'
      case 'tg_rejected': return 'Отклонён в Telegram'
      case 'note_added': return 'Добавлена заметка'
      default: return event.event_type
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{displayName}</h1>
          <p className="text-neutral-500">
            {application.form?.pipeline?.name} • Создана {formatDate(application.created_at)}
          </p>
        </div>
        
        {/* Stage Selector */}
        <div className="relative">
          <button
            onClick={() => !displayStage?.is_terminal && setShowStageDropdown(!showStageDropdown)}
            disabled={displayStage?.is_terminal || isUpdating}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
              displayStage?.is_terminal 
                ? 'cursor-not-allowed opacity-75'
                : 'hover:bg-neutral-50 cursor-pointer'
            }`}
            style={{ borderColor: displayStage?.color }}
          >
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: displayStage?.color }}
            />
            <span className="font-medium">{displayStage?.name}</span>
            {!displayStage?.is_terminal && (
              <ChevronDown className={`w-4 h-4 transition-transform ${showStageDropdown ? 'rotate-180' : ''}`} />
            )}
            {displayStage?.is_terminal && (
              <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                displayStage?.terminal_type === 'success' 
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {displayStage?.terminal_type === 'success' ? 'Финал' : 'Отказ'}
              </span>
            )}
            {isUpdating && <Loader2 className="w-4 h-4 animate-spin ml-1" />}
          </button>
          
          {showStageDropdown && (
            <>
              <div 
                className="fixed inset-0 z-10"
                onClick={() => setShowStageDropdown(false)}
              />
              <div className="absolute right-0 mt-2 w-56 bg-white border rounded-lg shadow-lg z-20 py-1">
                {availableStages.map((stage) => (
                  <button
                    key={stage.id}
                    onClick={() => handleStageChange(stage.id)}
                    disabled={stage.id === selectedStage}
                    className={`w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-neutral-50 ${
                      stage.id === selectedStage ? 'bg-neutral-50' : ''
                    }`}
                  >
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span>{stage.name}</span>
                    {stage.is_terminal && (
                      <span className={`ml-auto text-xs ${
                        stage.terminal_type === 'success' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {stage.terminal_type === 'success' ? '✓' : '✕'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* User Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Информация о пользователе</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-4">
                {photoUrl ? (
                  <img 
                    src={photoUrl}
                    alt=""
                    className="w-20 h-20 rounded-xl object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-neutral-200 flex items-center justify-center">
                    <User className="w-8 h-8 text-neutral-500" />
                  </div>
                )}
                
                <div className="flex-1 space-y-2">
                  <div>
                    <div className="font-semibold text-lg">{displayName}</div>
                    {username && (
                      <a 
                        href={`https://t.me/${username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        @{username}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {(participant?.email || userData.email) && (
                      <div className="flex items-center gap-2 text-neutral-600">
                        <Mail className="w-4 h-4" />
                        {participant?.email || userData.email}
                      </div>
                    )}
                    {(participant?.phone || userData.phone) && (
                      <div className="flex items-center gap-2 text-neutral-600">
                        <Phone className="w-4 h-4" />
                        {participant?.phone || userData.phone}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-neutral-600">
                      <MessageCircle className="w-4 h-4" />
                      Telegram ID: {application.tg_user_id}
                    </div>
                  </div>
                  
                  {/* Bio */}
                  {(participant?.bio || userData.bio) && (
                    <div className="text-sm text-neutral-600 italic border-l-2 border-neutral-200 pl-3">
                      "{participant?.bio || userData.bio}"
                    </div>
                  )}
                  
                  {/* Spam Score */}
                  {application.spam_score > 0 && (
                    <div className={`flex items-center gap-2 p-2 rounded-lg ${
                      application.spam_score >= 70 
                        ? 'bg-red-50 text-red-700'
                        : application.spam_score >= 40
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-neutral-50 text-neutral-600'
                    }`}>
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">Spam Score: {application.spam_score}</span>
                      {application.spam_reasons?.length > 0 && (
                        <span className="text-sm opacity-75">
                          ({application.spam_reasons.join(', ')})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Form Data */}
          {application.form_data && Object.keys(application.form_data).length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Данные анкеты
                  {application.form_filled_at && (
                    <span className="text-sm font-normal text-neutral-500">
                      от {formatDate(application.form_filled_at)}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  {Object.entries(application.form_data).map(([key, value]) => {
                    // Try to find label from form_schema
                    const field = application.form?.form_schema?.find((f: any) => f.id === key || f.name === key)
                    const label = field?.label || field?.name || key.replace(/_/g, ' ')
                    
                    return (
                      <div key={key}>
                        <dt className="text-sm font-medium text-neutral-500">
                          {label}
                        </dt>
                        <dd className="mt-0.5 text-neutral-900">
                          {String(value)}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              </CardContent>
            </Card>
          ) : (
            /* Form not filled - show link to send */
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-amber-800">
                  <FileText className="w-5 h-5" />
                  Анкета не заполнена
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-amber-700">
                  Пользователь подал заявку, но ещё не заполнил анкету. 
                  Отправьте ему ссылку на MiniApp в личные сообщения.
                </p>
                {application.form_id && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-amber-800">Ссылка для заполнения:</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'orbo_community_bot'}?startapp=apply-${application.form_id}`}
                        className="flex-1 px-3 py-2 text-sm bg-white border border-amber-200 rounded-lg"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const link = `https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'orbo_community_bot'}?startapp=apply-${application.form_id}`
                          navigator.clipboard.writeText(link)
                        }}
                        className="border-amber-300 hover:bg-amber-100"
                      >
                        Копировать
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Заметки</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Добавьте заметки о заявке..."
                rows={4}
              />
              <Button
                onClick={handleSaveNotes}
                disabled={isUpdating || notes === (application.notes || '')}
                size="sm"
              >
                {isUpdating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Сохранить
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions - moved to top */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Действия</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {participant && (
                <Link href={`/p/${orgId}/members/${participant.id}`}>
                  <Button variant="outline" className="w-full justify-start">
                    <User className="w-4 h-4 mr-2" />
                    Профиль участника
                  </Button>
                </Link>
              )}
              {username && (
                <a 
                  href={`https://t.me/${username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" className="w-full justify-start">
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Написать в Telegram
                  </Button>
                </a>
              )}
              
              {/* Delete button */}
              {!showDeleteConfirm ? (
                <Button 
                  variant="outline" 
                  className="w-full justify-start text-red-600 hover:bg-red-50 border-red-200"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Удалить заявку
                </Button>
              ) : (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">
                      Удалить эту заявку? Это действие необратимо.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                    >
                      Отмена
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-1" />
                      )}
                      Удалить
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* UTM / Source */}
          {(source || Object.keys(utmData).length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Tag className="w-5 h-5" />
                  Источник
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {source?.name && (
                  <div>
                    <span className="text-neutral-500">Кампания: </span>
                    {source.name}
                  </div>
                )}
                {(utmData.utm_source || source?.utm_source) && (
                  <div>
                    <span className="text-neutral-500">utm_source: </span>
                    {utmData.utm_source || source?.utm_source}
                  </div>
                )}
                {(utmData.utm_medium || source?.utm_medium) && (
                  <div>
                    <span className="text-neutral-500">utm_medium: </span>
                    {utmData.utm_medium || source?.utm_medium}
                  </div>
                )}
                {(utmData.utm_campaign || source?.utm_campaign) && (
                  <div>
                    <span className="text-neutral-500">utm_campaign: </span>
                    {utmData.utm_campaign || source?.utm_campaign}
                  </div>
                )}
                {utmData.ref_code && (
                  <div>
                    <span className="text-neutral-500">ref_code: </span>
                    {utmData.ref_code}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Event History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="w-5 h-5" />
                История
              </CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-neutral-500 text-sm">Нет событий</p>
              ) : (
                <div className="space-y-3">
                  {events.map((event) => (
                    <div key={event.id} className="flex items-start gap-3">
                      <div className="mt-0.5 text-neutral-400">
                        {getEventIcon(event.event_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{getEventText(event)}</div>
                        <div className="text-xs text-neutral-400">
                          {formatDate(event.created_at)}
                          {event.actor_type === 'user' && ' • вручную'}
                          {event.actor_type === 'automation' && ' • автоматически'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
