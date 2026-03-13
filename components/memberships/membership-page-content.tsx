'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Crown, Plus, Users, Edit2, Trash2, Lock, ExternalLink } from 'lucide-react'
import { MembershipBadge } from './membership-badge'
import { MembershipPlanEditor } from './membership-plan-editor'
import { GrantMembershipDialog } from './grant-membership-dialog'
import { MembershipAnalytics } from './membership-analytics'
const CLUB_PAYMENT_URL = 'https://payform.ru/4taVjLm/'

interface Plan {
  id: string
  name: string
  description: string | null
  price: number | null
  currency: string
  billing_period: string
  custom_period_days: number | null
  payment_link: string | null
  payment_instructions: string | null
  trial_days: number
  grace_period_days: number
  is_active: boolean
  is_public: boolean
  max_members: number | null
  access_rules: Array<{ resource_type: string; resource_id: string | null }>
}

interface Membership {
  id: string
  participant_id: string
  plan_id: string
  status: string
  basis: string
  started_at: string | null
  expires_at: string | null
  participant?: { id: string; full_name: string | null; username: string | null; photo_url: string | null }
  plan?: { id: string; name: string; price: number | null; billing_period: string }
}

interface OrgGroup {
  tg_chat_id: string
  title: string
  platform: string
}

interface MembershipPageContentProps {
  orgId: string
  hasFeature: boolean
  groups: OrgGroup[]
  channels: Array<{ id: string; title: string; tg_chat_id: string }>
  maxGroups: Array<{ max_chat_id: string; title: string }>
}

const PERIOD_LABELS: Record<string, string> = {
  one_time: 'разовый', weekly: 'нед.', monthly: 'мес.',
  quarterly: 'квартал', semi_annual: 'полугодие', annual: 'год', custom: 'свой',
}

const BASIS_LABELS: Record<string, string> = {
  payment: 'Оплата', manual: 'Вручную', invitation: 'Приглашение',
  moderation: 'Модерация', import: 'Импорт', promotion: 'Промо',
}

export function MembershipPageContent({
  orgId, hasFeature, groups, channels, maxGroups,
}: MembershipPageContentProps) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [totalMemberships, setTotalMemberships] = useState(0)
  const [loading, setLoading] = useState(true)

  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [showNewPlan, setShowNewPlan] = useState(false)
  const [showGrantDialog, setShowGrantDialog] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [plansRes, membershipsRes] = await Promise.all([
        fetch(`/api/membership-plans?orgId=${orgId}`),
        fetch(`/api/participant-memberships?orgId=${orgId}&limit=20`),
      ])
      if (plansRes.ok) {
        const d = await plansRes.json()
        setPlans(d.plans || [])
      }
      if (membershipsRes.ok) {
        const d = await membershipsRes.json()
        setMemberships(d.memberships || [])
        setTotalMemberships(d.total || 0)
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => { if (hasFeature) loadData() }, [hasFeature, loadData])

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Удалить этот план? Планы с активными участниками нельзя удалить.')) return
    const res = await fetch(`/api/membership-plans?id=${planId}&orgId=${orgId}`, { method: 'DELETE' })
    if (res.ok) loadData()
    else {
      const d = await res.json()
      alert(d.error || 'Ошибка удаления')
    }
  }

  const handleRevoke = async (membershipId: string) => {
    if (!confirm('Отозвать членство?')) return
    const res = await fetch('/api/participant-memberships', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: membershipId, orgId, action: 'revoke' }),
    })
    if (res.ok) loadData()
  }

  if (!hasFeature) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-2xl">
        <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
          <CardContent className="py-12 text-center space-y-4">
            <Lock className="h-12 w-12 text-purple-400 mx-auto" />
            <h2 className="text-xl font-semibold text-gray-900">Платное членство</h2>
            <p className="text-gray-600 max-w-md mx-auto">
              Создавайте планы членства, управляйте доступом к закрытым группам, каналам, материалам и событиям.
              Принимайте оплату и отслеживайте участников.
            </p>
            <p className="text-sm text-gray-500">Доступно на тарифе Клубный</p>
            <a
              href={CLUB_PAYMENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition"
            >
              Перейти на Клубный
              <ExternalLink className="h-4 w-4" />
            </a>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (showNewPlan || editingPlan) {
    return (
      <div className="container mx-auto py-8 px-4">
        <MembershipPlanEditor
          orgId={orgId}
          plan={editingPlan as any}
          groups={groups}
          channels={channels}
          maxGroups={maxGroups}
          onSave={() => { setShowNewPlan(false); setEditingPlan(null); loadData() }}
          onCancel={() => { setShowNewPlan(false); setEditingPlan(null) }}
        />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Crown className="h-6 w-6 text-emerald-600" />
            Платное членство
          </h1>
          <p className="text-gray-600 mt-1">Планы подписки и управление доступом участников</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowGrantDialog(true)} disabled={plans.length === 0}>
            <Users className="h-4 w-4 mr-2" /> Выдать членство
          </Button>
          <Button onClick={() => setShowNewPlan(true)}>
            <Plus className="h-4 w-4 mr-2" /> Новый план
          </Button>
        </div>
      </div>

      {/* Analytics */}
      <MembershipAnalytics orgId={orgId} />

      {loading ? (
        <div className="space-y-4">
          <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      ) : (
        <>
          {/* Plans */}
          {plans.length === 0 ? (
            <Card className="mb-8">
              <CardContent className="py-12 text-center">
                <Crown className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">Нет планов членства</h3>
                <p className="text-sm text-gray-500 mb-4">Создайте первый план для управления платным доступом</p>
                <Button onClick={() => setShowNewPlan(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Создать план
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 mb-8">
              {plans.map(plan => (
                <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Crown className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                        <div>
                          <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                          {plan.description && <p className="text-sm text-gray-500">{plan.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-semibold text-gray-900">
                            {plan.price ? `${plan.price.toLocaleString('ru-RU')} ₽` : 'Бесплатно'}
                            {plan.price ? <span className="text-sm font-normal text-gray-500"> / {PERIOD_LABELS[plan.billing_period] || plan.billing_period}</span> : null}
                          </div>
                          <div className="text-xs text-gray-400">
                            {plan.access_rules.length} правил доступа
                            {!plan.is_active && ' | Неактивен'}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingPlan(plan)} className="p-2 rounded-lg hover:bg-gray-100" title="Редактировать">
                            <Edit2 className="h-4 w-4 text-gray-500" />
                          </button>
                          <button onClick={() => handleDeletePlan(plan.id)} className="p-2 rounded-lg hover:bg-red-50" title="Удалить">
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Memberships */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Участники ({totalMemberships})
              </h2>
            </div>

            {memberships.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-gray-500 text-sm">
                  Пока нет участников с членством
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-left">
                      <tr>
                        <th className="px-4 py-3 font-medium">Участник</th>
                        <th className="px-4 py-3 font-medium">План</th>
                        <th className="px-4 py-3 font-medium">Статус</th>
                        <th className="px-4 py-3 font-medium">Основание</th>
                        <th className="px-4 py-3 font-medium">До</th>
                        <th className="px-4 py-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {memberships.map(m => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {m.participant?.photo_url ? (
                                <img src={m.participant.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                              ) : (
                                <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                                  {(m.participant?.full_name || '?')[0]}
                                </div>
                              )}
                              <span className="font-medium text-gray-900">{m.participant?.full_name || m.participant?.username || m.participant_id.slice(0, 8)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{m.plan?.name || '—'}</td>
                          <td className="px-4 py-3"><MembershipBadge status={m.status as any} compact /></td>
                          <td className="px-4 py-3 text-gray-500">{BASIS_LABELS[m.basis] || m.basis}</td>
                          <td className="px-4 py-3 text-gray-500">
                            {m.expires_at ? new Date(m.expires_at).toLocaleDateString('ru-RU') : '∞'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {(m.status === 'active' || m.status === 'trial') && (
                              <button onClick={() => handleRevoke(m.id)} className="text-xs text-red-500 hover:text-red-700">
                                Отозвать
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {showGrantDialog && (
        <GrantMembershipDialog
          orgId={orgId}
          plans={plans}
          onClose={() => setShowGrantDialog(false)}
          onSuccess={() => { setShowGrantDialog(false); loadData() }}
        />
      )}
    </div>
  )
}
