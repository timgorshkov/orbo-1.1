'use client'

import { useState, useEffect } from 'react'
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

interface PipelineForm {
  id: string
  name: string
}

interface ParticipantGroup {
  id: string
  title: string
}

interface ApplicationDetailProps {
  orgId: string
  application: any
  events: any[]
  availableStages: Stage[]
  pipelineForms: PipelineForm[]
  participantGroups: ParticipantGroup[]
  isAutoForm?: boolean
}

export default function ApplicationDetail({
  orgId,
  application,
  events,
  availableStages,
  pipelineForms,
  participantGroups,
  isAutoForm = false
}: ApplicationDetailProps) {
  const router = useRouter()
  const [selectedStageId, setSelectedStageId] = useState(application.stage_id)
  const [notes, setNotes] = useState(application.notes || '')
  const [isUpdating, setIsUpdating] = useState(false)
  const [showStageDropdown, setShowStageDropdown] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // Find the current display stage from availableStages based on selectedStageId
  const displayStage = availableStages.find(s => s.id === selectedStageId) || application.stage

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

  // Debug logging on mount
  useEffect(() => {
    console.log('[APPLICATION-DETAIL] Component mounted', {
      application_id: application.id,
      org_id: orgId,
      current_stage: currentStage?.name,
      current_stage_id: application.stage_id,
      selected_stage_id: selectedStageId,
      available_stages_count: availableStages.length,
      available_stages: availableStages.map(s => ({ id: s.id, name: s.name, slug: s.slug })),
      is_terminal: currentStage?.is_terminal,
      tg_chat_id: application.tg_chat_id,
      tg_user_id: application.tg_user_id
    })
  }, [])

  const handleStageChange = async (newStageId: string) => {
    const prevStageId = selectedStageId
    
    console.log('[APPLICATION-DETAIL] handleStageChange called', {
      application_id: application.id,
      current_stage_id: selectedStageId,
      new_stage_id: newStageId,
      display_stage_is_terminal: displayStage?.is_terminal
    })
    
    // Check if we can move from current display stage
    if (newStageId === selectedStageId || displayStage?.is_terminal) {
      console.log('[APPLICATION-DETAIL] Stage change prevented', {
        reason: newStageId === selectedStageId ? 'same_stage' : 'terminal_stage'
      })
      return
    }
    
    // Optimistic update - update local state immediately BEFORE the request
    setSelectedStageId(newStageId)
    setIsUpdating(true)
    setShowStageDropdown(false)
    
    console.log('[APPLICATION-DETAIL] Sending PATCH request', {
      url: `/api/applications/${application.id}`,
      stage_id: newStageId
    })
    
    try {
      const res = await fetch(`/api/applications/${application.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: newStageId })
      })
      
      console.log('[APPLICATION-DETAIL] PATCH response received', {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText
      })
      
      if (!res.ok) {
        // Revert on error
        setSelectedStageId(prevStageId)
        const data = await res.json()
        console.error('[APPLICATION-DETAIL] Failed to change stage:', data.error)
      } else {
        const data = await res.json()
        console.log('[APPLICATION-DETAIL] Stage change successful', {
          response: data
        })
      }
      // Don't call router.refresh() - we already updated local state
    } catch (err) {
      // Revert on error
      setSelectedStageId(prevStageId)
      console.error('[APPLICATION-DETAIL] Exception during stage change:', err)
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
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="p-2">
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
                {availableStages
                  .filter(stage => stage.slug !== 'pending_form')
                  .map((stage) => (
                  <button
                    key={stage.id}
                    onClick={() => {
                      console.log('[APPLICATION-DETAIL] Stage button clicked', {
                        stage_id: stage.id,
                        stage_name: stage.name,
                        stage_slug: stage.slug
                      })
                      handleStageChange(stage.id)
                    }}
                    disabled={stage.id === selectedStageId}
                    className={`w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-neutral-50 ${
                      stage.id === selectedStageId ? 'bg-neutral-50' : ''
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
                  
                  {/* Participant Profile Info */}
                  {participant && (
                    <div className={`mt-3 p-3 rounded-lg border ${
                      participantGroups.length > 0
                        ? 'bg-green-50 border-green-100'
                        : 'bg-amber-50 border-amber-100'
                    }`}>
                      <div className={`flex items-center gap-2 mb-2 ${
                        participantGroups.length > 0 ? 'text-green-700' : 'text-amber-700'
                      }`}>
                        {participantGroups.length > 0
                          ? <CheckCircle2 className="w-4 h-4" />
                          : <AlertTriangle className="w-4 h-4" />
                        }
                        <span className="font-medium text-sm">
                          {participantGroups.length > 0
                            ? 'Участник организации'
                            : 'Сохранён в базе, но ещё не в группах'
                          }
                        </span>
                      </div>
                      <Link 
                        href={`/p/${orgId}/members/${participant.id}`}
                        className={`text-sm hover:underline ${
                          participantGroups.length > 0 ? 'text-green-600' : 'text-amber-600'
                        }`}
                      >
                        Открыть профиль участника →
                      </Link>
                    </div>
                  )}
                  
                  {/* Participant Groups */}
                  {participantGroups.length > 0 && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-100">
                      <div className="text-green-700 text-sm font-medium mb-2">
                        Состоит в группах организации:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {participantGroups.map(group => (
                          <span 
                            key={group.id}
                            className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full"
                          >
                            {group.title}
                          </span>
                        ))}
                      </div>
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
          ) : isAutoForm ? null : (
            /* Form not filled - show links to all pipeline forms */
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
                {pipelineForms.length > 0 ? (
                  <div className="space-y-3">
                    <label className="text-xs font-medium text-amber-800">
                      {pipelineForms.length === 1 ? 'Ссылка для заполнения:' : 'Ссылки на формы заявок:'}
                    </label>
                    {pipelineForms.map(form => (
                      <div key={form.id} className="space-y-1">
                        {pipelineForms.length > 1 && (
                          <span className="text-xs text-amber-700 font-medium">{form.name}</span>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'orbo_community_bot'}?startapp=apply-${form.id}`}
                            className="flex-1 px-3 py-2 text-sm bg-white border border-amber-200 rounded-lg"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const link = `https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'orbo_community_bot'}?startapp=apply-${form.id}`
                              navigator.clipboard.writeText(link)
                            }}
                            className="border-amber-300 hover:bg-amber-100"
                          >
                            Копировать
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : application.form_id && (
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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Tag className="w-5 h-5" />
                Источник
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {/* Native Telegram join request */}
              {utmData.source === 'native_telegram' && (
                <div className="p-2 bg-blue-50 rounded border border-blue-100 mb-3">
                  <div className="flex items-center gap-2 text-blue-700 font-medium">
                    <MessageCircle className="w-4 h-4" />
                    Нативная заявка Telegram
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    Пользователь нажал кнопку &quot;Вступить&quot; в Telegram
                  </div>
                </div>
              )}
              {/* MiniApp source */}
              {utmData.source === 'miniapp' && (
                <div className="p-2 bg-purple-50 rounded border border-purple-100 mb-3">
                  <div className="flex items-center gap-2 text-purple-700 font-medium">
                    <FileText className="w-4 h-4" />
                    Анкета MiniApp
                  </div>
                </div>
              )}
              {/* Campaign source */}
              {source?.name && (
                <div>
                  <span className="text-neutral-500">Кампания: </span>
                  {source.name}
                </div>
              )}
              {/* Invite link name from native request */}
              {utmData.invite_link_name && (
                <div>
                  <span className="text-neutral-500">Invite link: </span>
                  {utmData.invite_link_name}
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
              {/* Show message if no source info */}
              {!source && !utmData.source && !utmData.utm_source && !utmData.utm_campaign && !utmData.ref_code && (
                <div className="text-neutral-400 text-sm">
                  Источник не определён
                </div>
              )}
            </CardContent>
          </Card>

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
