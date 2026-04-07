'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ExternalLink, CreditCard, CheckCircle2, FileText, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'

const PRODAMUS_REF_URL = 'https://connect.prodamus.ru/?ref=ORBOPARTNERS&c=Rw6'

interface PaymentsSettingsContentProps {
  orgId: string
  initialDefaultPaymentLink: string | null
}

type ContractStatus = 'filled_by_client' | 'verified' | 'signed' | 'terminated' | null

export default function PaymentsSettingsContent({
  orgId,
  initialDefaultPaymentLink,
}: PaymentsSettingsContentProps) {
  const [defaultPaymentLink, setDefaultPaymentLink] = useState(initialDefaultPaymentLink || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fallbackOpen, setFallbackOpen] = useState(false)

  // Contract status
  const [contractStatus, setContractStatus] = useState<ContractStatus>(null)
  const [contractLoading, setContractLoading] = useState(true)

  useEffect(() => {
    const loadContract = async () => {
      try {
        const res = await fetch(`/api/contracts?orgId=${orgId}`)
        const data = await res.json()
        if (data.contract) {
          setContractStatus(data.contract.status)
        }
      } catch {
        // ignore — will show "no contract" state
      } finally {
        setContractLoading(false)
      }
    }
    loadContract()
  }, [orgId])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_payment_link: defaultPaymentLink }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const hasActiveContract = contractStatus === 'verified' || contractStatus === 'signed'
  const hasPendingContract = contractStatus === 'filled_by_client'

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Block 1: Contract-based payments (primary) */}
      <Card className={hasActiveContract ? 'border-green-200 bg-green-50/30' : 'border-blue-200 bg-gradient-to-br from-blue-50 to-white'}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className={`w-5 h-5 ${hasActiveContract ? 'text-green-600' : 'text-blue-600'}`} />
            <CardTitle className={`text-base ${hasActiveContract ? 'text-green-900' : 'text-blue-900'}`}>
              Приём платежей через Orbo
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {contractLoading ? (
            <p className="text-sm text-gray-500">Загрузка...</p>
          ) : hasActiveContract ? (
            <>
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-5 h-5" />
                <p className="text-sm font-medium">Платежи подключены</p>
              </div>
              <p className="text-sm text-gray-600">
                Договор заключён. Orbo принимает оплаты за ваши мероприятия и выводит средства на ваш счёт за вычетом комиссии.
              </p>
              <p className="text-sm text-gray-500">
                Для платных событий оплата будет автоматически приниматься через платформу.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = `/p/${orgId}/settings?tab=contract`
                }}
              >
                <FileText className="w-4 h-4 mr-1.5" />
                Посмотреть договор
              </Button>
            </>
          ) : hasPendingContract ? (
            <>
              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="w-5 h-5" />
                <p className="text-sm font-medium">Договор на проверке</p>
              </div>
              <p className="text-sm text-gray-600">
                Вы заполнили данные для договора. После проверки и подтверждения вы сможете принимать платежи через Orbo.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = `/p/${orgId}/settings?tab=contract`
                }}
              >
                <FileText className="w-4 h-4 mr-1.5" />
                Статус договора
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-700">
                Заключите лицензионный договор с Orbo, и мы будем принимать оплаты за ваши мероприятия как платёжный агент.
                Средства выводятся на ваш счёт за вычетом комиссии.
              </p>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-white rounded-lg border border-blue-100 p-3 text-center">
                  <div className="font-semibold text-blue-700 text-base">Visa / МИР</div>
                  <div className="text-gray-500 text-xs mt-0.5">карты РФ</div>
                </div>
                <div className="bg-white rounded-lg border border-blue-100 p-3 text-center">
                  <div className="font-semibold text-blue-700 text-base">СБП</div>
                  <div className="text-gray-500 text-xs mt-0.5">по QR-коду</div>
                </div>
                <div className="bg-white rounded-lg border border-blue-100 p-3 text-center">
                  <div className="font-semibold text-blue-700 text-base">Автоматически</div>
                  <div className="text-gray-500 text-xs mt-0.5">без ручной работы</div>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-blue-100 p-3 text-sm text-gray-700 space-y-1">
                <p className="font-medium text-gray-800">Как это работает:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-gray-600">
                  <li>Заключите договор — укажите реквизиты во вкладке «Договор»</li>
                  <li>Создавайте платные события — участники оплачивают онлайн</li>
                  <li>Получайте выплаты на ваш счёт за вычетом комиссии</li>
                </ol>
              </div>

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  window.location.href = `/p/${orgId}/settings?tab=contract`
                }}
              >
                <FileText className="w-4 h-4 mr-1.5" />
                Заключить договор
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Block 2: Fallback — own payment link (collapsed) */}
      <div className="border border-gray-200 rounded-lg">
        <button
          type="button"
          onClick={() => setFallbackOpen(!fallbackOpen)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
        >
          {fallbackOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <CreditCard className="w-4 h-4" />
          <span>Использовать собственную платёжную ссылку</span>
        </button>

        {fallbackOpen && (
          <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
            <p className="text-sm text-gray-500 pt-3">
              Если вы уже используете сторонний платёжный сервис, можете указать ссылку, которая будет подставляться в платные события.
            </p>

            <div className="flex gap-2">
              <Input
                type="url"
                value={defaultPaymentLink}
                onChange={(e) => setDefaultPaymentLink(e.target.value)}
                placeholder="https://..."
                className="flex-1"
              />
              <Button onClick={handleSave} disabled={saving} className="shrink-0">
                {saving ? 'Сохранение...' : saved ? (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Сохранено
                  </span>
                ) : 'Сохранить'}
              </Button>
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            {defaultPaymentLink && (
              <p className="text-xs text-gray-500">
                Участники платных событий будут переходить по этой ссылке для оплаты.
              </p>
            )}

            {/* Prodamus promo (smaller, inside fallback) */}
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                <p className="text-sm font-medium text-indigo-900">
                  Рекомендуем Prodamus
                </p>
              </div>
              <p className="text-xs text-gray-600 mb-2">
                Подходит для ООО, ИП и самозанятых. Комиссия 2,9–3,8%. Карты Visa/МИР и СБП.
              </p>
              <a
                href={PRODAMUS_REF_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                Подключить Prodamus
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
