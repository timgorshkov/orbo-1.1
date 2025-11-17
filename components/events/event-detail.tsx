'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calendar, MapPin, Users, DollarSign, Globe, Lock, Edit, Download, Share2, Link as LinkIcon } from 'lucide-react'
import { useAdminMode } from '@/lib/hooks/useAdminMode'
import EventForm from './event-form'
import PaymentsTab from './payments-tab'

type Event = {
  id: string
  title: string
  description: string | null
  cover_image_url: string | null
  event_type: 'online' | 'offline'
  location_info: string | null
  event_date: string
  start_time: string
  end_time: string
  is_paid: boolean
  price_info: string | null
  // New payment fields
  requires_payment?: boolean
  default_price?: number | null
  currency?: string
  payment_deadline_days?: number | null
  payment_instructions?: string | null
  capacity: number | null
  status: 'draft' | 'published' | 'cancelled'
  is_public: boolean
  telegram_group_link: string | null
  registered_count: number
  available_spots: number | null
  is_user_registered: boolean
  event_registrations?: Array<{
    id: string
    status: string
    registered_at: string
    participants: {
      id: string
      full_name: string | null
      username: string | null
      tg_user_id: number | null
      merged_into: string | null
    }
  }>
}

type Props = {
  event: Event
  orgId: string
  role: 'owner' | 'admin' | 'member' | 'guest'
  isEditMode: boolean
  telegramGroups: Array<{ id: number; tg_chat_id: number; title: string | null }>
}

export default function EventDetail({ event, orgId, role, isEditMode, telegramGroups }: Props) {
  const { adminMode, isAdmin } = useAdminMode(role)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const [isRegistered, setIsRegistered] = useState(event.is_user_registered)
  const [showNotifyDialog, setShowNotifyDialog] = useState(false)
  const [selectedGroups, setSelectedGroups] = useState<number[]>([])
  const [notifyError, setNotifyError] = useState<string | null>(null)
  const [notifySuccess, setNotifySuccess] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  
  // Show admin features only if user is admin AND in admin mode
  const showAdminFeatures = isAdmin && adminMode
  // Allow edit mode only if admin features are shown and edit mode is requested
  const canEdit = showAdminFeatures && isEditMode

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  const formatTime = (timeStr: string) => {
    return timeStr.substring(0, 5)
  }

  const handleRegister = () => {
    setRegistrationError(null)
    
    startTransition(async () => {
      try {
        const response = await fetch(`/api/events/${event.id}/register`, {
          method: 'POST'
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Не удалось зарегистрироваться')
        }

        setIsRegistered(true)
        router.refresh()
      } catch (err: any) {
        setRegistrationError(err.message)
      }
    })
  }

  const handleUnregister = () => {
    setRegistrationError(null)
    
    startTransition(async () => {
      try {
        const response = await fetch(`/api/events/${event.id}/register`, {
          method: 'DELETE'
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Не удалось отменить регистрацию')
        }

        setIsRegistered(false)
        router.refresh()
      } catch (err: any) {
        setRegistrationError(err.message)
      }
    })
  }

  const handleDownloadICS = () => {
    window.open(`/api/events/${event.id}/ics`, '_blank')
  }

  const handleCopyPublicLink = async () => {
    const publicUrl = `${window.location.origin}/p/${orgId}/events/${event.id}`
    try {
      await navigator.clipboard.writeText(publicUrl)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy link:', err)
    }
  }

  const handleSendNotification = () => {
    if (selectedGroups.length === 0) {
      setNotifyError('Выберите хотя бы одну группу')
      return
    }

    setNotifyError(null)
    setNotifySuccess(false)

    startTransition(async () => {
      try {
        const response = await fetch(`/api/events/${event.id}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupIds: selectedGroups,
            notificationType: 'manual'
          })
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Не удалось отправить уведомления')
        }

        setNotifySuccess(true)
        setShowNotifyDialog(false)
        setSelectedGroups([])
        
        // Show success message
        setTimeout(() => setNotifySuccess(false), 5000)
      } catch (err: any) {
        setNotifyError(err.message)
      }
    })
  }

  const toggleGroup = (groupId: number) => {
    setSelectedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    )
  }

  const participants = event.event_registrations
    ?.filter(reg => reg.status === 'registered' && reg.participants?.merged_into === null)
    .sort((a, b) => new Date(a.registered_at).getTime() - new Date(b.registered_at).getTime())
    || []

  if (canEdit) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Редактировать событие</h1>
          <Button
            variant="outline"
            onClick={() => router.push(`/p/${orgId}/events/${event.id}`)}
          >
            Отменить
          </Button>
        </div>
        <EventForm 
          orgId={orgId}
          mode="edit"
          initialEvent={event}
        />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/p/${orgId}/events`)}
          >
            ← Назад
          </Button>
        </div>
        {showAdminFeatures && (
          <div className="flex gap-2">
            {event.is_public && event.status === 'published' && (
              <Button
                variant="outline"
                onClick={handleCopyPublicLink}
              >
                <LinkIcon className="w-4 h-4 mr-2" />
                {linkCopied ? 'Скопировано!' : 'Скопировать ссылку'}
              </Button>
            )}
            {telegramGroups.length > 0 && event.status === 'published' && (
              <Button
                variant="outline"
                onClick={() => setShowNotifyDialog(true)}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Поделиться в группах
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => router.push(`/p/${orgId}/events/${event.id}?edit=true`)}
            >
              <Edit className="w-4 h-4 mr-2" />
              Редактировать
            </Button>
          </div>
        )}
      </div>

      {notifySuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          Событие успешно опубликовано в выбранных группах
        </div>
      )}

      {/* Cover Image */}
      {event.cover_image_url && (
        <div className="mb-6 h-80 w-full overflow-hidden rounded-lg">
          <img 
            src={event.cover_image_url} 
            alt={event.title}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      {/* Title and Status */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">{event.title}</h1>
        <div className="flex items-center gap-3">
          {event.status === 'draft' && (
            <span className="px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-800">
              Черновик
            </span>
          )}
          {event.status === 'cancelled' && (
            <span className="px-3 py-1 rounded-full text-sm bg-red-100 text-red-800">
              Отменено
            </span>
          )}
          {event.is_public ? (
            <span className="flex items-center text-sm text-neutral-600">
              <Globe className="w-4 h-4 mr-1" />
              Публичное
            </span>
          ) : (
            <span className="flex items-center text-sm text-neutral-600">
              <Lock className="w-4 h-4 mr-1" />
              Для участников организации
            </span>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          {showAdminFeatures && <TabsTrigger value="participants">Участники ({participants.length})</TabsTrigger>}
          {showAdminFeatures && (event.requires_payment || event.is_paid) && (
            <TabsTrigger value="payments">
              <DollarSign className="w-4 h-4 mr-2" />
              Оплаты
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {event.description && (
                <Card>
                  <CardHeader>
                    <CardTitle>Описание</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{event.description}</p>
                  </CardContent>
                </Card>
              )}

              {event.is_paid && event.price_info && (
                <Card>
                  <CardHeader>
                    <CardTitle>Стоимость и оплата</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{event.price_info}</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Информация</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start">
                    <Calendar className="w-5 h-5 mr-3 mt-0.5 text-neutral-500" />
                    <div>
                      <div className="font-medium">{formatDate(event.event_date)}</div>
                      <div className="text-sm text-neutral-600">
                        {formatTime(event.start_time)} - {formatTime(event.end_time)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start">
                    {event.event_type === 'online' ? (
                      <Globe className="w-5 h-5 mr-3 mt-0.5 text-neutral-500" />
                    ) : (
                      <MapPin className="w-5 h-5 mr-3 mt-0.5 text-neutral-500" />
                    )}
                    <div>
                      <div className="font-medium">
                        {event.event_type === 'online' ? 'Онлайн' : 'Офлайн'}
                      </div>
                      {event.location_info && (
                        <div className="text-sm text-neutral-600 break-words">
                          {event.location_info}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start">
                    <Users className="w-5 h-5 mr-3 mt-0.5 text-neutral-500" />
                    <div>
                      <div className="font-medium">
                        {event.registered_count} 
                        {event.capacity && ` / ${event.capacity}`}
                      </div>
                      <div className="text-sm text-neutral-600">
                        Зарегистрировано
                      </div>
                    </div>
                  </div>

                  {event.is_paid && (
                    <div className="flex items-start">
                      <DollarSign className="w-5 h-5 mr-3 mt-0.5 text-neutral-500" />
                      <div>
                        <div className="font-medium">Платное</div>
                        <div className="text-sm text-neutral-600">
                          См. информацию о стоимости ниже
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Registration */}
              {event.status === 'published' && (
                <Card>
                  <CardContent className="pt-6">
                    {isRegistered ? (
                      <div>
                        <div className="mb-4 text-center">
                          <div className="text-green-600 font-medium mb-1">
                            ✓ Вы зарегистрированы
                          </div>
                          <div className="text-sm text-neutral-600">
                            Мы напомним вам о событии
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={handleDownloadICS}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Добавить в календарь
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={handleUnregister}
                            disabled={isPending}
                          >
                            {isPending ? 'Отмена...' : 'Отменить регистрацию'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {event.available_spots === 0 ? (
                          <div className="text-center py-4">
                            <div className="text-red-600 font-medium mb-1">
                              Мест нет
                            </div>
                            <div className="text-sm text-neutral-600">
                              Все места заняты
                            </div>
                          </div>
                        ) : (
                          <div>
                            {event.available_spots && event.available_spots <= 5 && (
                              <div className="mb-3 text-center text-sm text-amber-600">
                                Осталось всего {event.available_spots} мест!
                              </div>
                            )}
                            <Button
                              className="w-full"
                              onClick={handleRegister}
                              disabled={isPending}
                            >
                              {isPending ? 'Регистрация...' : 'Зарегистрироваться'}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {registrationError && (
                      <div className="mt-3 text-sm text-red-500 text-center">
                        {registrationError}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {showAdminFeatures && (
          <TabsContent value="participants">
            <Card>
              <CardHeader>
                <CardTitle>Зарегистрированные участники</CardTitle>
              </CardHeader>
              <CardContent>
                {participants.length === 0 ? (
                  <div className="text-center py-8 text-neutral-500">
                    Пока нет зарегистрированных участников
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-neutral-200">
                      <thead className="bg-neutral-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">
                            Участник
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">
                            Username
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">
                            Дата регистрации
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-neutral-200">
                        {participants.map((registration) => (
                          <tr key={registration.id}>
                            <td className="px-4 py-3 text-sm">
                              {registration.participants.full_name || `ID: ${registration.participants.tg_user_id}`}
                            </td>
                            <td className="px-4 py-3 text-sm text-neutral-500">
                              {registration.participants.username ? `@${registration.participants.username}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-neutral-500">
                              {new Date(registration.registered_at).toLocaleString('ru-RU')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {showAdminFeatures && (event.requires_payment || event.is_paid) && (
          <TabsContent value="payments">
            <PaymentsTab
              eventId={event.id}
              event={{
                id: event.id,
                title: event.title,
                requires_payment: event.requires_payment ?? event.is_paid ?? false,
                default_price: event.default_price ?? null,
                currency: event.currency || 'RUB',
                payment_deadline_days: event.payment_deadline_days ?? null,
                payment_instructions: event.payment_instructions ?? null,
                event_date: event.event_date
              }}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Share Event Dialog */}
      {showNotifyDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Поделиться событием</h3>
            
            <p className="text-sm text-neutral-600 mb-4">
              Выберите группы, в которые хотите отправить анонс события:
            </p>

            <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
              {telegramGroups.map(group => (
                <label key={group.id} className="flex items-center p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(group.id)}
                    onChange={() => toggleGroup(group.id)}
                    className="mr-3"
                  />
                  <span className="text-sm">
                    {group.title || `Группа ${group.tg_chat_id}`}
                  </span>
                </label>
              ))}
            </div>

            {notifyError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                {notifyError}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleSendNotification}
                disabled={isPending || selectedGroups.length === 0}
                className="flex-1"
              >
                {isPending ? 'Отправка...' : 'Отправить'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowNotifyDialog(false)
                  setNotifyError(null)
                  setSelectedGroups([])
                }}
                disabled={isPending}
                className="flex-1"
              >
                Отмена
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

