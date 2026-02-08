'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { Calendar, MapPin, Users, Ticket, Globe, Lock, Edit, Download, Share2, Link as LinkIcon, Copy, Check, Pencil, ArrowLeft, Trash2 } from 'lucide-react'
import { useAdminMode } from '@/lib/hooks/useAdminMode'
import { renderTelegramMarkdownText } from '@/lib/utils/telegramMarkdown'
import EventForm from './event-form'
import PaymentsTab from './payments-tab'
import QRCode from '@/components/ui/qr-code'
import EventRegistrationForm from './event-registration-form'
import EventParticipantsList from './event-participants-list'
import AddParticipantDialog from './add-participant-dialog'
import EditParticipantDialog from './edit-participant-dialog'
import EventShareOptions from './event-share-options'
import EventAnalyticsTab from './event-analytics-tab'

type Event = {
  id: string
  title: string
  description: string | null
  cover_image_url: string | null
  event_type: 'online' | 'offline'
  location_info: string | null
  map_link?: string | null
  event_date: string
  end_date?: string | null
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
  payment_link?: string | null
  allow_multiple_tickets?: boolean
  capacity_count_by_paid?: boolean
  show_participants_list?: boolean
  enable_qr_checkin?: boolean
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
    payment_status?: 'pending' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled' | 'refunded' | null
    registration_data?: Record<string, any> | null
    participants: {
      id: string
      full_name: string | null
      username: string | null
      email?: string | null
      phone?: string | null
      bio?: string | null
      tg_user_id: number | null
      merged_into: string | null
    }
  }>
}

type UserRegistration = {
  id: string
  status: string
  payment_status: 'pending' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled' | 'refunded' | null
  price: number | null
  paid_amount: number | null
  quantity: number
  registered_at: string
  payment_deadline?: string | null
  qr_token?: string | null
}

type Props = {
  event: Event
  orgId: string
  role: 'owner' | 'admin' | 'member' | 'guest'
  isEditMode: boolean
  telegramGroups: Array<{ id: number; tg_chat_id: number; title: string | null }>
  requireAuthForRegistration?: boolean // For public events viewed by unauthenticated users
}

export default function EventDetail({ event, orgId, role, isEditMode, telegramGroups, requireAuthForRegistration = false }: Props) {
  const { adminMode, isAdmin } = useAdminMode(role)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const [isRegistered, setIsRegistered] = useState(event.is_user_registered)
  const [userRegistration, setUserRegistration] = useState<UserRegistration | null>(null)
  const [loadingRegistration, setLoadingRegistration] = useState(false)
  const [showNotifyDialog, setShowNotifyDialog] = useState(false)
  const [selectedGroups, setSelectedGroups] = useState<number[]>([])
  const [notifyError, setNotifyError] = useState<string | null>(null)
  const [notifySuccess, setNotifySuccess] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [showRegistrationForm, setShowRegistrationForm] = useState(false)
  const [showAddParticipantDialog, setShowAddParticipantDialog] = useState(false)
  const [showEditParticipantDialog, setShowEditParticipantDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editingRegistration, setEditingRegistration] = useState<{
    id: string
    full_name: string
    email: string | null
    phone: string | null
    bio: string | null
    payment_status?: 'pending' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled' | 'refunded' | null
  } | null>(null)
  const [participantProfile, setParticipantProfile] = useState<{
    full_name?: string | null
    email?: string | null
    phone?: string | null
    bio?: string | null
  } | null>(null)
  
  // Show admin features only if user is admin AND in admin mode
  const showAdminFeatures = isAdmin && adminMode
  // Allow edit mode only if admin features are shown and edit mode is requested
  const canEdit = showAdminFeatures && isEditMode

  // Load user's registration details if registered (for QR code and payment info)
  useEffect(() => {
    if (!isRegistered) return
    
    setLoadingRegistration(true)
    fetch(`/api/events/${event.id}/my-registration`)
      .then(res => res.json())
      .then(data => {
        if (data.registration) {
          setUserRegistration(data.registration)
        }
      })
      .catch(err => {
        console.error('Error loading registration details:', err)
      })
      .finally(() => {
        setLoadingRegistration(false)
      })
  }, [event.id, isRegistered])

  // Load participant profile for pre-filling registration form
  useEffect(() => {
    if (!showRegistrationForm) return

    fetch(`/api/user/profile?orgId=${orgId}`)
      .then(res => res.json())
      .then(data => {
        if (data.profile?.participant) {
          const participant = data.profile.participant
          setParticipantProfile({
            full_name: participant.full_name,
            email: participant.email,
            phone: participant.phone,
            bio: participant.bio
          })
        } else {
          setParticipantProfile(null)
        }
      })
      .catch(err => {
        console.error('Error loading participant profile:', err)
        setParticipantProfile(null)
      })
  }, [orgId, showRegistrationForm])

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
    // Open registration form instead of direct registration
    setShowRegistrationForm(true)
  }

  const handleRegistrationSuccess = () => {
    setIsRegistered(true)
    setShowRegistrationForm(false)
    
    // Load registration details (QR code and payment info)
    setLoadingRegistration(true)
    fetch(`/api/events/${event.id}/my-registration`)
      .then(res => res.json())
      .then(data => {
        if (data.registration) {
          setUserRegistration(data.registration)
        }
      })
      .catch(err => {
        console.error('Error loading registration details:', err)
      })
      .finally(() => {
        setLoadingRegistration(false)
      })
    
    router.refresh()
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

  const handleAddToGoogleCalendar = () => {
    try {
      // Format dates for Google Calendar (YYYYMMDDTHHmmssZ in UTC)
      if (!event.event_date) {
        console.error('Event date is missing')
        return
      }

      const startDateStr = typeof event.event_date === 'string' 
        ? event.event_date.split('T')[0] 
        : new Date(event.event_date).toISOString().split('T')[0]
      
      // Use end_date if provided, otherwise use event_date
      const endDateStr = event.end_date 
        ? (typeof event.end_date === 'string' ? event.end_date.split('T')[0] : new Date(event.end_date).toISOString().split('T')[0])
        : startDateStr
      
      const startTimeStr = event.start_time?.substring(0, 5) || '10:00'
      const endTimeStr = event.end_time?.substring(0, 5) || '12:00'
      
      // Create Date objects in MSK timezone
      const startDate = new Date(`${startDateStr}T${startTimeStr}:00+03:00`)
      const endDate = new Date(`${endDateStr}T${endTimeStr}:00+03:00`)
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.error('Invalid date/time values', { startDateStr, endDateStr, startTimeStr, endTimeStr })
        return
      }
      
      // Format to Google Calendar format (YYYYMMDDTHHmmssZ)
      const formatGoogleDate = (date: Date) => {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
      }
      
      const googleDates = `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`
      
      // Build description with link to online stream or map
      let description = event.description || ''
      if (event.event_type === 'online' && event.location_info) {
        description += `\n\nСсылка на трансляцию: ${event.location_info}`
      }
      if (event.event_type === 'offline' && event.map_link) {
        description += `\n\nМесто на карте: ${event.map_link}`
      }
      
      const location = event.event_type === 'online' 
        ? (event.location_info || 'Online')
        : (event.location_info || '')
      
      // Construct Google Calendar URL
      const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: event.title,
        dates: googleDates,
        details: description,
        location: location
      })
      
      const googleCalendarUrl = `https://calendar.google.com/calendar/render?${params.toString()}`
      window.open(googleCalendarUrl, '_blank')
    } catch (error) {
      console.error('Error creating Google Calendar link:', error)
    }
  }

  const handleExportParticipants = () => {
    // Generate CSV from participants data
    const headers = ['ФИО', 'Username', 'Email', 'Телефон', 'Кратко о себе', 'Статус оплаты', 'Дата регистрации']
    const csvRows = [
      headers.join(','),
      ...participants.map(reg => {
        const p = reg.participants
        const regData = reg.registration_data || {}
        const paymentStatusMap: Record<string, string> = {
          'pending': 'Ожидается',
          'paid': 'Оплачено',
          'partially_paid': 'Частично',
          'overdue': 'Просрочено',
          'cancelled': 'Отменено',
          'refunded': 'Возврат'
        }
        // Use registration_data if available, otherwise fallback to participant profile
        const displayFullName = regData.full_name || p.full_name || `ID: ${p.tg_user_id}`
        const displayEmail = regData.email || p.email || '—'
        const displayPhone = regData.phone_number || regData.phone || p.phone || '—'
        const displayBio = regData.bio || p.bio || '—'
        
        return [
          `"${displayFullName}"`,
          p.username ? `@${p.username}` : '—',
          displayEmail,
          displayPhone,
          `"${displayBio}"`,
          reg.payment_status ? paymentStatusMap[reg.payment_status] || reg.payment_status : '—',
          new Date(reg.registered_at).toLocaleString('ru-RU')
        ].join(',')
      })
    ]
    
    const csvContent = csvRows.join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }) // BOM for Excel
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `participants_${event.title.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
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

  const handleDeleteEvent = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/events/${event.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Не удалось удалить событие')
      }

      // Success - redirect to events list
      router.push(`/p/${orgId}/events`)
    } catch (err: any) {
      alert(err.message)
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const participants = event.event_registrations
    ?.filter(reg => (reg.status === 'registered' || reg.status === 'attended') && reg.participants?.merged_into === null)
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
            size="sm"
            onClick={() => router.push(`/p/${orgId}/events`)}
            className="sm:px-4"
          >
            <ArrowLeft className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Назад</span>
          </Button>
        </div>
        {showAdminFeatures && (
          <div className="flex gap-2">
            {event.status === 'published' && (
              <EventShareOptions 
                eventId={event.id} 
                eventTitle={event.title}
                orgId={orgId}
                isPublic={event.is_public}
              />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/p/${orgId}/events/${event.id}?edit=true`)}
              className="sm:px-4"
            >
              <Edit className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Редактировать</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="sm:px-4 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Удалить</span>
            </Button>
          </div>
        )}
      </div>

      {notifySuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          Событие успешно опубликовано в выбранных группах
        </div>
      )}

      {/* Cover Image - fixed aspect ratio prevents CLS */}
      {event.cover_image_url && (
        <div className="mb-6 relative w-full aspect-[16/9] sm:aspect-[2/1] max-h-80 overflow-hidden rounded-lg bg-neutral-100">
          <Image 
            src={event.cover_image_url} 
            alt={event.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 800px"
            className="object-cover"
            priority
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
        
        {/* Quick Action Button for Mobile - Scroll to Registration */}
        {!showAdminFeatures && event.status === 'published' && !isRegistered && (
          <div className="mt-4 lg:hidden">
            <Button
              className="w-full"
              onClick={() => {
                const registrationElement = document.getElementById('registration');
                if (registrationElement) {
                  registrationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
            >
              Зарегистрироваться на событие
            </Button>
          </div>
        )}
      </div>

      {/* Show tabs only for admins, otherwise show content directly */}
      {showAdminFeatures ? (
        <Tabs defaultValue="overview">
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Обзор</TabsTrigger>
            <TabsTrigger value="participants">Участники ({participants.length})</TabsTrigger>
            {(event.requires_payment || event.is_paid) && (
              <TabsTrigger value="payments">
                Оплаты
              </TabsTrigger>
            )}
            <TabsTrigger value="analytics">Аналитика</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content - Left */}
            <div className="lg:col-span-2 space-y-6">
              {event.description && (
                <Card>
                  <CardHeader>
                    <CardTitle>Описание</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                      {renderTelegramMarkdownText(event.description)}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Registration Card - Moved to left, prominent */}
              {event.status === 'published' && (
                <Card id="registration">
                  <CardHeader>
                    <CardTitle>Регистрация</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Show login prompt for unauthenticated users on public events */}
                    {requireAuthForRegistration ? (
                      <div className="text-center py-4">
                        <div className="text-neutral-600 mb-4">
                          Для регистрации необходимо войти через Telegram
                        </div>
                        <a
                          href={`/p/${orgId}/auth?redirect=${encodeURIComponent(`/p/${orgId}/events/${event.id}`)}`}
                          className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                        >
                          Войти и зарегистрироваться
                        </a>
                      </div>
                    ) : isRegistered ? (
                      <>
                        <div className="text-center py-2">
                          <div className="text-green-600 font-medium mb-1">
                            ✓ Вы зарегистрированы
                          </div>
                          <div className="text-sm text-neutral-600 mb-3">
                            Мы напомним вам о событии
                          </div>
                          {/* QR Ticket - admin tab */}
                          {userRegistration?.qr_token && event.enable_qr_checkin !== false && (
                            <div className="mt-3 mb-3">
                              <QRCode
                                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/checkin?token=${userRegistration.qr_token}`}
                                size={160}
                                showDownload
                                downloadFileName={`ticket-${event.title.replace(/\s+/g, '-').slice(0, 30)}`}
                              />
                              <p className="text-xs text-neutral-400 mt-2">Электронный билет</p>
                            </div>
                          )}
                          
                          {/* Payment Info for Registered Users - min-height prevents CLS */}
                          {(event.requires_payment || event.is_paid) && (
                            <div className="mt-4 pt-4 border-t border-neutral-200 space-y-3 min-h-[80px]">
                              {loadingRegistration ? (
                                <div className="text-sm text-neutral-500 animate-pulse">Загрузка информации об оплате...</div>
                              ) : userRegistration ? (
                                <>
                                  {/* Payment Status */}
                                  {userRegistration.payment_status && (
                                    <div className="flex items-center justify-center gap-2">
                                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                        userRegistration.payment_status === 'paid' 
                                          ? 'bg-green-100 text-green-800'
                                          : userRegistration.payment_status === 'partially_paid'
                                          ? 'bg-yellow-100 text-yellow-800'
                                          : userRegistration.payment_status === 'overdue'
                                          ? 'bg-red-100 text-red-800'
                                          : 'bg-orange-100 text-orange-800'
                                      }`}>
                                        {userRegistration.payment_status === 'paid' 
                                          ? '✓ Оплачено'
                                          : userRegistration.payment_status === 'partially_paid'
                                          ? 'Частично оплачено'
                                          : userRegistration.payment_status === 'overdue'
                                          ? 'Просрочено'
                                          : 'Ожидает оплаты'}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Amount to Pay */}
                                  {userRegistration.price !== null && userRegistration.payment_status !== 'paid' && (
                                    <div className="text-center">
                                      <div className="text-lg font-semibold text-neutral-900">
                                        К оплате: {(userRegistration.price * userRegistration.quantity).toLocaleString('ru-RU')} {event.currency || 'RUB'}
                                      </div>
                                      {userRegistration.quantity > 1 && (
                                        <div className="text-xs text-neutral-500 mt-1">
                                          {userRegistration.quantity} {userRegistration.quantity === 1 ? 'билет' : userRegistration.quantity < 5 ? 'билета' : 'билетов'} × {userRegistration.price.toLocaleString('ru-RU')} {event.currency || 'RUB'}
                                        </div>
                                      )}
                                      {userRegistration.paid_amount !== null && userRegistration.paid_amount > 0 && (
                                        <div className="text-sm text-neutral-600 mt-1">
                                          Оплачено: {userRegistration.paid_amount.toLocaleString('ru-RU')} {event.currency || 'RUB'}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  {/* Payment Instructions */}
                                  {userRegistration.payment_status !== 'paid' && event.payment_instructions && (
                                    <div className="text-sm text-neutral-600 whitespace-pre-wrap text-left bg-neutral-50 p-3 rounded-lg">
                                      {event.payment_instructions}
                                    </div>
                                  )}
                                </>
                              ) : null}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={handleDownloadICS}
                              title="Скачать .ics файл"
                            >
                              <Download className="w-4 h-4 mr-1" />
                              <span className="text-xs sm:text-sm">iCal</span>
                            </Button>
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={handleAddToGoogleCalendar}
                              title="Добавить в Google Calendar"
                            >
                              <Calendar className="w-4 h-4 mr-1" />
                              <span className="text-xs sm:text-sm">Google</span>
                            </Button>
                          </div>
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={handleUnregister}
                            disabled={isPending}
                          >
                            {isPending ? 'Отмена...' : 'Отменить регистрацию'}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
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
                          <>
                            {event.available_spots && event.available_spots <= 5 && (
                              <div className="text-center text-sm text-amber-600 mb-3">
                                Осталось всего {event.available_spots} мест!
                              </div>
                            )}
                            <Button
                              className="w-full"
                              onClick={handleRegister}
                              disabled={isPending}
                            >
                              Зарегистрироваться
                            </Button>
                          </>
                        )}
                      </>
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

            {/* Sidebar - Right */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Информация</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start">
                    <Calendar className="w-5 h-5 mr-3 mt-0.5 text-neutral-500" />
                    <div>
                      <div className="font-medium">
                        {event.end_date && event.end_date !== event.event_date
                          ? `${formatDate(event.event_date)} - ${formatDate(event.end_date)}`
                          : formatDate(event.event_date)}
                      </div>
                      <div className="text-sm text-neutral-600">
                        {formatTime(event.start_time)} - {formatTime(event.end_time)}
                        {event.end_date && event.end_date !== event.event_date && (
                          <span className="ml-1 text-xs text-neutral-500">
                            ({Math.ceil((new Date(event.end_date).getTime() - new Date(event.event_date).getTime()) / (1000 * 60 * 60 * 24))} {Math.ceil((new Date(event.end_date).getTime() - new Date(event.event_date).getTime()) / (1000 * 60 * 60 * 24)) === 1 ? 'день' : 'дней'})
                          </span>
                        )}
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
                      {event.event_type === 'online' && event.location_info && (
                        isRegistered ? (
                          <a 
                            href={event.location_info} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                          >
                            <LinkIcon className="w-3 h-3" />
                            Ссылка на трансляцию
                          </a>
                        ) : (
                          <div className="text-sm text-neutral-500 italic">
                            Ссылка будет доступна после регистрации
                          </div>
                        )
                      )}
                      {event.event_type === 'offline' && (
                        <>
                          {event.location_info && (
                            <div className="text-sm text-neutral-600 break-words">
                              {event.location_info}
                            </div>
                          )}
                          {event.map_link && (
                            <a 
                              href={event.map_link} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 mt-1"
                            >
                              <MapPin className="w-3 h-3" />
                              Место на карте
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  </div>


                  {/* Payment Info - Simplified display */}
                  {(event.requires_payment || event.is_paid) && (
                    <div className="pt-4 border-t border-neutral-200">
                      <div className="flex items-start">
                        <Ticket className="w-5 h-5 mr-3 mt-0.5 text-neutral-500" />
                        <div className="flex-1">
                          <div className="font-medium">Платное событие</div>
                          {(event.default_price !== null && event.default_price !== undefined) && (
                            <div className="text-lg font-semibold text-neutral-900 mt-1">
                              {event.default_price.toLocaleString('ru-RU')} {event.currency || 'RUB'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Participants List (for all users) */}
          <div className="mt-6">
            <EventParticipantsList
              eventId={event.id}
              orgId={orgId}
              showParticipantsList={event.show_participants_list ?? true}
            />
          </div>
        </TabsContent>

        {showAdminFeatures && (
          <TabsContent value="participants">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle>Зарегистрированные участники</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddParticipantDialog(true)}
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Добавить участника
                  </Button>
                  {participants.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportParticipants}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Экспорт
                    </Button>
                  )}
                </div>
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
                            Email
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">
                            Телефон
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">
                            Кратко о себе
                          </th>
                          {(event.requires_payment || event.is_paid) && (
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">
                              Статус оплаты
                            </th>
                          )}
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">
                            Дата регистрации
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase">
                            Check-in
                          </th>
                          {showAdminFeatures && (
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">
                              Действия
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-neutral-200">
                        {participants.map((registration) => {
                          const paymentStatusMap: Record<string, string> = {
                            'pending': 'Ожидается',
                            'paid': 'Оплачено',
                            'partially_paid': 'Частично',
                            'overdue': 'Просрочено',
                            'cancelled': 'Отменено',
                            'refunded': 'Возврат'
                          }
                          const paymentStatusColorMap: Record<string, string> = {
                            'pending': 'text-yellow-600',
                            'paid': 'text-green-600',
                            'partially_paid': 'text-blue-600',
                            'overdue': 'text-red-600',
                            'cancelled': 'text-neutral-400',
                            'refunded': 'text-purple-600'
                          }
                          
                          // Get data from registration_data if available, otherwise from participant profile
                          const regData = registration.registration_data || {}
                          const displayEmail = regData.email || registration.participants.email || '—'
                          const displayPhone = regData.phone_number || regData.phone || registration.participants.phone || '—'
                          const displayBio = regData.bio || registration.participants.bio || null
                          
                          return (
                            <tr key={registration.id}>
                              <td className="px-4 py-3 text-sm">
                                <Link 
                                  href={`/p/${orgId}/members/${registration.participants.id}`}
                                  className="text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  {regData.full_name || registration.participants.full_name || `ID: ${registration.participants.tg_user_id}`}
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-sm text-neutral-500">
                                {registration.participants.username ? `@${registration.participants.username}` : '—'}
                              </td>
                              <td className="px-4 py-3 text-sm text-neutral-500">
                                {displayEmail}
                              </td>
                              <td className="px-4 py-3 text-sm text-neutral-500">
                                {displayPhone}
                              </td>
                              <td className="px-4 py-3 text-sm text-neutral-500">
                                {displayBio ? (
                                  <span className="line-clamp-2" title={displayBio}>
                                    {displayBio}
                                  </span>
                                ) : '—'}
                              </td>
                              {(event.requires_payment || event.is_paid) && (
                                <td className={`px-4 py-3 text-sm font-medium ${registration.payment_status ? paymentStatusColorMap[registration.payment_status] : 'text-neutral-500'}`}>
                                  {registration.payment_status 
                                    ? paymentStatusMap[registration.payment_status] || registration.payment_status 
                                    : '—'}
                                </td>
                              )}
                              <td className="px-4 py-3 text-sm text-neutral-500">
                                {new Date(registration.registered_at).toLocaleString('ru-RU')}
                              </td>
                              <td className="px-4 py-3 text-sm text-center">
                                {registration.status === 'attended' ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                    <Check className="w-3 h-3" />
                                    Прошёл
                                  </span>
                                ) : (
                                  <span className="text-xs text-neutral-400">—</span>
                                )}
                              </td>
                              {showAdminFeatures && (
                                <td className="px-4 py-3 text-sm">
                                  <div className="flex items-center gap-1">
                                    {registration.status === 'registered' && (
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation()
                                          try {
                                            const response = await fetch(`/api/events/${event.id}/participants/${registration.id}/checkin`, {
                                              method: 'POST',
                                            })
                                            if (response.ok) {
                                              router.refresh()
                                            } else {
                                              alert('Не удалось отметить участника')
                                            }
                                          } catch (err) {
                                            console.error('Check-in error:', err)
                                            alert('Ошибка при отметке участника')
                                          }
                                        }}
                                        className="p-1.5 text-neutral-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                                        title="Отметить присутствие"
                                      >
                                        <Check className="w-4 h-4" />
                                      </button>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        const regData = registration.registration_data || {}
                                        setEditingRegistration({
                                          id: registration.id,
                                          full_name: regData.full_name || registration.participants.full_name || '',
                                          email: regData.email || registration.participants.email || null,
                                          phone: regData.phone_number || regData.phone || registration.participants.phone || null,
                                          bio: regData.bio || registration.participants.bio || null,
                                          payment_status: registration.payment_status || null
                                        })
                                        setShowEditParticipantDialog(true)
                                      }}
                                      className="p-1.5 text-neutral-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                      title="Редактировать регистрацию"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

          {(event.requires_payment || event.is_paid) && (
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

          <TabsContent value="analytics">
            <EventAnalyticsTab
              eventId={event.id}
              eventDate={event.event_date}
              requiresPayment={event.requires_payment ?? event.is_paid ?? false}
              defaultPrice={event.default_price ?? null}
              capacity={event.capacity}
              registrations={(event.event_registrations || []).map(r => ({
                id: r.id,
                status: r.status,
                registered_at: r.registered_at,
                payment_status: r.payment_status,
                participants: r.participants
              }))}
            />
          </TabsContent>
        </Tabs>
      ) : (
        /* Non-admin view: show content directly without tabs */
        <div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content - Left */}
            <div className="lg:col-span-2 space-y-6">
              {event.description && (
                <Card>
                  <CardHeader>
                    <CardTitle>Описание</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                      {renderTelegramMarkdownText(event.description)}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Registration Card */}
              {event.status === 'published' && (
                <Card id="registration">
                  <CardHeader>
                    <CardTitle>Регистрация</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Show login prompt for unauthenticated users on public events */}
                    {requireAuthForRegistration ? (
                      <div className="text-center py-4">
                        <div className="text-neutral-600 mb-4">
                          Для регистрации необходимо войти через Telegram
                        </div>
                        <a
                          href={`/p/${orgId}/auth?redirect=${encodeURIComponent(`/p/${orgId}/events/${event.id}`)}`}
                          className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                        >
                          Войти и зарегистрироваться
                        </a>
                      </div>
                    ) : isRegistered ? (
                      <>
                        <div className="text-center py-2">
                          <div className="text-green-600 font-medium mb-1">
                            ✓ Вы зарегистрированы
                          </div>
                          <div className="text-sm text-neutral-600 mb-3">
                            Мы напомним вам о событии
                          </div>
                          {/* QR Ticket - public view */}
                          {userRegistration?.qr_token && event.enable_qr_checkin !== false && (
                            <div className="mt-3 mb-3">
                              <QRCode
                                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/checkin?token=${userRegistration.qr_token}`}
                                size={160}
                                showDownload
                                downloadFileName={`ticket-${event.title.replace(/\s+/g, '-').slice(0, 30)}`}
                              />
                              <p className="text-xs text-neutral-400 mt-2">Электронный билет</p>
                            </div>
                          )}
                          
                          {/* Payment Info for Registered Users - min-height prevents CLS */}
                          {(event.requires_payment || event.is_paid) && (
                            <div className="mt-4 pt-4 border-t border-neutral-200 space-y-3 min-h-[80px]">
                              {loadingRegistration ? (
                                <div className="text-sm text-neutral-500 animate-pulse">Загрузка информации об оплате...</div>
                              ) : userRegistration ? (
                                <>
                                  {userRegistration.payment_status && (
                                    <div className="flex items-center justify-center gap-2">
                                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                        userRegistration.payment_status === 'paid' 
                                          ? 'bg-green-100 text-green-800'
                                          : userRegistration.payment_status === 'partially_paid'
                                          ? 'bg-yellow-100 text-yellow-800'
                                          : userRegistration.payment_status === 'overdue'
                                          ? 'bg-red-100 text-red-800'
                                          : 'bg-orange-100 text-orange-800'
                                      }`}>
                                        {userRegistration.payment_status === 'paid' 
                                          ? '✓ Оплачено'
                                          : userRegistration.payment_status === 'partially_paid'
                                          ? 'Частично оплачено'
                                          : userRegistration.payment_status === 'overdue'
                                          ? 'Просрочено'
                                          : 'Ожидает оплаты'}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {userRegistration.price !== null && userRegistration.payment_status !== 'paid' && (
                                    <div className="text-center">
                                      <div className="text-lg font-semibold text-neutral-900">
                                        К оплате: {(userRegistration.price * userRegistration.quantity).toLocaleString('ru-RU')} {event.currency || 'RUB'}
                                      </div>
                                      {userRegistration.quantity > 1 && (
                                        <div className="text-xs text-neutral-500 mt-1">
                                          {userRegistration.quantity} {userRegistration.quantity === 1 ? 'билет' : userRegistration.quantity < 5 ? 'билета' : 'билетов'} × {userRegistration.price.toLocaleString('ru-RU')} {event.currency || 'RUB'}
                                        </div>
                                      )}
                                      {userRegistration.paid_amount !== null && userRegistration.paid_amount > 0 && (
                                        <div className="text-sm text-neutral-600 mt-1">
                                          Оплачено: {userRegistration.paid_amount.toLocaleString('ru-RU')} {event.currency || 'RUB'}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  {userRegistration.payment_status !== 'paid' && event.payment_instructions && (
                                    <div className="text-sm text-neutral-600 whitespace-pre-wrap text-left bg-neutral-50 p-3 rounded-lg">
                                      {event.payment_instructions}
                                    </div>
                                  )}
                                </>
                              ) : null}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={handleDownloadICS}
                              title="Скачать .ics файл"
                            >
                              <Download className="w-4 h-4 mr-1" />
                              <span className="text-xs sm:text-sm">iCal</span>
                            </Button>
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={handleAddToGoogleCalendar}
                              title="Добавить в Google Calendar"
                            >
                              <Calendar className="w-4 h-4 mr-1" />
                              <span className="text-xs sm:text-sm">Google</span>
                            </Button>
                          </div>
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={handleUnregister}
                            disabled={isPending}
                          >
                            {isPending ? 'Отмена...' : 'Отменить регистрацию'}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
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
                          <>
                            {event.available_spots && event.available_spots <= 5 && (
                              <div className="text-center text-sm text-amber-600 mb-3">
                                Осталось всего {event.available_spots} мест!
                              </div>
                            )}
                            <Button
                              className="w-full"
                              onClick={handleRegister}
                              disabled={isPending}
                            >
                              Зарегистрироваться
                            </Button>
                          </>
                        )}
                      </>
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

            {/* Sidebar - Right */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Информация</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start">
                    <Calendar className="w-5 h-5 mr-3 mt-0.5 text-neutral-500" />
                    <div>
                      <div className="font-medium">
                        {event.end_date && event.end_date !== event.event_date
                          ? `${formatDate(event.event_date)} - ${formatDate(event.end_date)}`
                          : formatDate(event.event_date)}
                      </div>
                      <div className="text-sm text-neutral-600">
                        {formatTime(event.start_time)} - {formatTime(event.end_time)}
                        {event.end_date && event.end_date !== event.event_date && (
                          <span className="ml-1 text-xs text-neutral-500">
                            ({Math.ceil((new Date(event.end_date).getTime() - new Date(event.event_date).getTime()) / (1000 * 60 * 60 * 24))} {Math.ceil((new Date(event.end_date).getTime() - new Date(event.event_date).getTime()) / (1000 * 60 * 60 * 24)) === 1 ? 'день' : 'дней'})
                          </span>
                        )}
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
                      {event.event_type === 'online' && event.location_info && (
                        isRegistered ? (
                          <a 
                            href={event.location_info} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                          >
                            <LinkIcon className="w-3 h-3" />
                            Ссылка на трансляцию
                          </a>
                        ) : (
                          <div className="text-sm text-neutral-500 italic">
                            Ссылка будет доступна после регистрации
                          </div>
                        )
                      )}
                      {event.event_type === 'offline' && (
                        <>
                          {event.location_info && (
                            <div className="text-sm text-neutral-600 break-words">
                              {event.location_info}
                            </div>
                          )}
                          {event.map_link && (
                            <a 
                              href={event.map_link} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 mt-1"
                            >
                              <MapPin className="w-3 h-3" />
                              Место на карте
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  </div>


                  {/* Payment Info */}
                  {(event.requires_payment || event.is_paid) && (
                    <div className="pt-4 border-t border-neutral-200">
                      <div className="flex items-start">
                        <Ticket className="w-5 h-5 mr-3 mt-0.5 text-neutral-500" />
                        <div className="flex-1">
                          <div className="font-medium">Платное событие</div>
                          {(event.default_price !== null && event.default_price !== undefined) && (
                            <div className="text-lg font-semibold text-neutral-900 mt-1">
                              {event.default_price.toLocaleString('ru-RU')} {event.currency || 'RUB'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Participants List */}
          <div className="mt-6">
            <EventParticipantsList
              eventId={event.id}
              orgId={orgId}
              showParticipantsList={event.show_participants_list ?? true}
            />
          </div>
        </div>
      )}

      {/* Share Event Dialog */}
      {showNotifyDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Поделиться событием</h3>
            
            {/* Copy Link Button */}
            <div className="mb-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleCopyPublicLink}
              >
                {linkCopied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Ссылка скопирована!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Скопировать ссылку
                  </>
                )}
              </Button>
            </div>

            <div className="border-t border-neutral-200 pt-4 mb-4">
              <p className="text-sm text-neutral-600 mb-4">
                Или отправьте анонс в группы Telegram:
              </p>

              <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                {telegramGroups.length === 0 ? (
                  <p className="text-sm text-neutral-500 text-center py-4">
                    Нет подключенных Telegram групп
                  </p>
                ) : (
                  telegramGroups.map(group => (
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
                  ))
                )}
              </div>
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
                {isPending ? 'Отправка...' : 'Отправить в группы'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowNotifyDialog(false)
                  setNotifyError(null)
                  setSelectedGroups([])
                  setLinkCopied(false)
                }}
                disabled={isPending}
                className="flex-1"
              >
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Registration Form Modal */}
      <EventRegistrationForm
        eventId={event.id}
        eventTitle={event.title}
        requiresPayment={event.requires_payment || false}
        defaultPrice={event.default_price}
        currency={event.currency || 'RUB'}
        allowMultipleTickets={event.allow_multiple_tickets || false}
        paymentLink={event.payment_link}
        paymentInstructions={event.payment_instructions}
        open={showRegistrationForm}
        onOpenChange={setShowRegistrationForm}
        onSuccess={handleRegistrationSuccess}
        participantProfile={participantProfile}
      />

      {/* Add Participant Dialog (Admin only) */}
      {isAdmin && (
        <AddParticipantDialog
          open={showAddParticipantDialog}
          onOpenChange={setShowAddParticipantDialog}
          eventId={event.id}
          orgId={orgId}
          onSuccess={() => {
            router.refresh()
          }}
        />
      )}

      {/* Edit Participant Dialog (Admin only) */}
      {isAdmin && editingRegistration && (
        <EditParticipantDialog
          open={showEditParticipantDialog}
          onOpenChange={setShowEditParticipantDialog}
          eventId={event.id}
          orgId={orgId}
          registrationId={editingRegistration.id}
          initialData={editingRegistration}
          hasPayment={!!(event.requires_payment || event.is_paid)}
          onSuccess={() => {
            setShowEditParticipantDialog(false)
            setEditingRegistration(null)
            router.refresh()
          }}
        />
      )}

      {/* Delete Event Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Удалить событие
            </h3>
            <p className="text-sm text-gray-700 mb-4">
              Вы уверены, что хотите удалить событие <strong>"{event.title}"</strong>?
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Событие можно удалить только если на него ещё никто не зарегистрирован. 
              Все связанные анонсы также будут удалены.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowDeleteDialog(false)}
                disabled={isDeleting}
              >
                Отмена
              </Button>
              <Button
                variant="default"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={handleDeleteEvent}
                disabled={isDeleting}
              >
                {isDeleting ? 'Удаление...' : 'Удалить'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

