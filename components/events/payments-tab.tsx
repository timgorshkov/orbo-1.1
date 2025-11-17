'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Edit2,
  Download,
  Filter,
  X
} from 'lucide-react'

type Registration = {
  id: string
  participant_id: string
  status: string
  registered_at: string
  price: number | null
  payment_status: 'pending' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled' | 'refunded'
  payment_method: string | null
  paid_at: string | null
  paid_amount: number | null
  payment_notes: string | null
  payment_updated_at: string | null
  payment_deadline: string | null
  is_overdue: boolean
  participants: {
    id: string
    full_name: string | null
    username: string | null
    tg_user_id: number | null
    photo_url: string | null
  }
}

type PaymentStats = {
  total_registrations: number
  total_expected_amount: number
  total_paid_amount: number
  paid_count: number
  pending_count: number
  overdue_count: number
  payment_completion_percent: number
  breakdown_by_status: Record<string, number>
}

type Event = {
  id: string
  title: string
  requires_payment: boolean
  default_price: number | null
  currency: string
  payment_deadline_days: number | null
  payment_instructions: string | null
  event_date: string
}

type Props = {
  eventId: string
  event: Event
}

export default function PaymentsTab({ eventId, event }: Props) {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [stats, setStats] = useState<PaymentStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [editingRegistration, setEditingRegistration] = useState<Registration | null>(null)
  const [editForm, setEditForm] = useState<{
    price: string
    payment_status: 'pending' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled' | 'refunded'
    payment_method: string
    paid_amount: string
    payment_notes: string
  }>({
    price: '',
    payment_status: 'pending',
    payment_method: '',
    paid_amount: '',
    payment_notes: ''
  })

  // Fetch payments data
  useEffect(() => {
    fetchPaymentsData()
  }, [eventId, statusFilter])

  const fetchPaymentsData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch registrations
      const regUrl = statusFilter 
        ? `/api/events/${eventId}/payments?status=${statusFilter}`
        : `/api/events/${eventId}/payments`
      
      const regResponse = await fetch(regUrl)
      if (!regResponse.ok) throw new Error('Failed to fetch registrations')
      const regData = await regResponse.json()
      setRegistrations(regData.registrations || [])

      // Fetch stats
      const statsResponse = await fetch(`/api/events/${eventId}/payments/stats`)
      if (!statsResponse.ok) throw new Error('Failed to fetch stats')
      const statsData = await statsResponse.json()
      setStats(statsData.stats)
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки данных')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (reg: Registration) => {
    setEditingRegistration(reg)
    setEditForm({
      price: reg.price?.toString() || '',
      payment_status: reg.payment_status,
      payment_method: reg.payment_method || '',
      paid_amount: reg.paid_amount?.toString() || '',
      payment_notes: reg.payment_notes || ''
    })
  }

  const handleSavePayment = async () => {
    if (!editingRegistration) return

    try {
      const response = await fetch(
        `/api/events/${eventId}/payments/${editingRegistration.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            price: editForm.price ? parseFloat(editForm.price) : undefined,
            payment_status: editForm.payment_status,
            payment_method: editForm.payment_method || undefined,
            paid_amount: editForm.paid_amount ? parseFloat(editForm.paid_amount) : undefined,
            payment_notes: editForm.payment_notes || undefined
          })
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Ошибка обновления')
      }

      setEditingRegistration(null)
      fetchPaymentsData() // Refresh data
    } catch (err: any) {
      alert(err.message || 'Ошибка при сохранении')
    }
  }

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '-'
    const currencySymbols: Record<string, string> = {
      RUB: '₽',
      USD: '$',
      EUR: '€',
      KZT: '₸',
      BYN: 'Br'
    }
    return `${amount.toLocaleString('ru-RU')} ${currencySymbols[event.currency] || event.currency}`
  }

  const getStatusBadge = (status: string, isOverdue?: boolean) => {
    const badges: Record<string, { label: string; className: string; icon: any }> = {
      paid: { label: 'Оплачено', className: 'bg-green-100 text-green-800', icon: CheckCircle2 },
      pending: { label: isOverdue ? 'Просрочено' : 'Ожидает оплаты', className: isOverdue ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800', icon: isOverdue ? AlertCircle : Clock },
      partially_paid: { label: 'Частично оплачено', className: 'bg-blue-100 text-blue-800', icon: DollarSign },
      cancelled: { label: 'Отменено', className: 'bg-gray-100 text-gray-800', icon: X },
      refunded: { label: 'Возвращено', className: 'bg-purple-100 text-purple-800', icon: X }
    }
    
    const badge = badges[status] || badges.pending
    const Icon = badge.icon
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.className}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    )
  }

  const handleExportCSV = () => {
    const csvRows = [
      ['Имя', 'Username', 'Цена', 'Статус оплаты', 'Способ оплаты', 'Оплачено', 'Дата оплаты', 'Комментарий'].join(','),
      ...registrations.map(reg => [
        reg.participants.full_name || '',
        reg.participants.username || '',
        reg.price || '',
        reg.payment_status,
        reg.payment_method || '',
        reg.paid_amount || '',
        reg.paid_at || '',
        (reg.payment_notes || '').replace(/"/g, '""')
      ].map(field => `"${field}"`).join(','))
    ]
    
    const csv = csvRows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `payments_${event.title}_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500">Загрузка данных об оплатах...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-4">{error}</div>
        <Button onClick={fetchPaymentsData}>Попробовать снова</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Всего регистраций</div>
              <div className="text-2xl font-bold">{stats.total_registrations}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Ожидается</div>
              <div className="text-2xl font-bold">{formatCurrency(stats.total_expected_amount)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Собрано</div>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.total_paid_amount)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Оплатили</div>
              <div className="text-2xl font-bold">
                {stats.paid_count} / {stats.total_registrations}
                <span className="text-sm text-gray-500 ml-2">({stats.payment_completion_percent}%)</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">Фильтр:</span>
        <Button
          variant={statusFilter === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter(null)}
        >
          Все ({stats?.total_registrations || 0})
        </Button>
        <Button
          variant={statusFilter === 'pending' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('pending')}
        >
          Ожидают ({stats?.pending_count || 0})
        </Button>
        <Button
          variant={statusFilter === 'paid' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('paid')}
        >
          Оплатили ({stats?.paid_count || 0})
        </Button>
        <Button
          variant={statusFilter === 'overdue' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('overdue')}
        >
          Просрочено ({stats?.overdue_count || 0})
        </Button>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Экспорт CSV
          </Button>
        </div>
      </div>

      {/* Registrations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Участники и оплаты</CardTitle>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Нет регистраций с оплатами
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Участник</th>
                    <th className="text-right p-2">Цена</th>
                    <th className="text-center p-2">Статус</th>
                    <th className="text-left p-2">Способ оплаты</th>
                    <th className="text-right p-2">Оплачено</th>
                    <th className="text-left p-2">Дата оплаты</th>
                    <th className="text-left p-2">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((reg) => (
                    <tr key={reg.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">
                        <div className="font-medium">
                          {reg.participants.full_name || reg.participants.username || 'Без имени'}
                        </div>
                        {reg.participants.username && (
                          <div className="text-sm text-gray-500">@{reg.participants.username}</div>
                        )}
                      </td>
                      <td className="text-right p-2 font-medium">
                        {formatCurrency(reg.price)}
                      </td>
                      <td className="text-center p-2">
                        {getStatusBadge(reg.payment_status, reg.is_overdue)}
                      </td>
                      <td className="p-2 text-sm text-gray-600">
                        {reg.payment_method || '-'}
                      </td>
                      <td className="text-right p-2">
                        {formatCurrency(reg.paid_amount)}
                      </td>
                      <td className="p-2 text-sm text-gray-600">
                        {reg.paid_at 
                          ? new Date(reg.paid_at).toLocaleDateString('ru-RU')
                          : '-'}
                      </td>
                      <td className="p-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(reg)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      {editingRegistration && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Редактировать оплату</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setEditingRegistration(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">
                  Участник
                </label>
                <div className="p-2 bg-gray-50 rounded">
                  {editingRegistration.participants.full_name || editingRegistration.participants.username || 'Без имени'}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Цена к оплате
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                  placeholder="1000"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Статус оплаты
                </label>
                <select
                  className="w-full p-2 border rounded-lg"
                  value={editForm.payment_status}
                  onChange={(e) => setEditForm({ ...editForm, payment_status: e.target.value as any })}
                >
                  <option value="pending">Ожидает оплаты</option>
                  <option value="paid">Оплачено</option>
                  <option value="partially_paid">Частично оплачено</option>
                  <option value="overdue">Просрочено</option>
                  <option value="cancelled">Отменено</option>
                  <option value="refunded">Возвращено</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Способ оплаты
                </label>
                <select
                  className="w-full p-2 border rounded-lg"
                  value={editForm.payment_method}
                  onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value })}
                >
                  <option value="">Не указан</option>
                  <option value="bank_transfer">Банковский перевод</option>
                  <option value="cash">Наличные</option>
                  <option value="card">Карта</option>
                  <option value="online">Онлайн</option>
                  <option value="other">Другое</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Сумма оплаты
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.paid_amount}
                  onChange={(e) => setEditForm({ ...editForm, paid_amount: e.target.value })}
                  placeholder="0"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Комментарий
                </label>
                <textarea
                  className="w-full p-2 border rounded-lg min-h-[100px]"
                  value={editForm.payment_notes}
                  onChange={(e) => setEditForm({ ...editForm, payment_notes: e.target.value })}
                  placeholder="Номер транзакции, дополнительные заметки..."
                />
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button variant="outline" onClick={() => setEditingRegistration(null)}>
                  Отмена
                </Button>
                <Button onClick={handleSavePayment}>
                  Сохранить
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

