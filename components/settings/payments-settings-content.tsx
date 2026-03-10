'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ExternalLink, CreditCard, CheckCircle2 } from 'lucide-react'

const PRODAMUS_REF_URL = 'https://connect.prodamus.ru/?ref=ORBOPARTNERS&c=Rw6'

interface PaymentsSettingsContentProps {
  orgId: string
  initialDefaultPaymentLink: string | null
}

export default function PaymentsSettingsContent({
  orgId,
  initialDefaultPaymentLink,
}: PaymentsSettingsContentProps) {
  const [defaultPaymentLink, setDefaultPaymentLink] = useState(initialDefaultPaymentLink || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Block 1: Default payment link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Платёжная ссылка по умолчанию</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Ссылка будет автоматически подставляться при создании любого нового платного события.
            Можно изменить для каждого события отдельно.
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
        </CardContent>
      </Card>

      {/* Block 2: Prodamus promo */}
      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            <CardTitle className="text-base text-indigo-900">
              Приём оплаты картами через Prodamus
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-700">
            Принимайте оплату банковскими картами за участие в мероприятиях.
            Подходит для <strong>ООО, ИП и самозанятых</strong> — регистрация занимает несколько минут.
          </p>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-white rounded-lg border border-indigo-100 p-3 text-center">
              <div className="font-semibold text-indigo-700 text-base">2,9–3,8%</div>
              <div className="text-gray-500 text-xs mt-0.5">комиссия</div>
            </div>
            <div className="bg-white rounded-lg border border-indigo-100 p-3 text-center">
              <div className="font-semibold text-indigo-700 text-base">Visa / МИР</div>
              <div className="text-gray-500 text-xs mt-0.5">карты РФ</div>
            </div>
            <div className="bg-white rounded-lg border border-indigo-100 p-3 text-center">
              <div className="font-semibold text-indigo-700 text-base">СБП</div>
              <div className="text-gray-500 text-xs mt-0.5">по QR-коду</div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-indigo-100 p-3 text-sm text-gray-700 space-y-1">
            <p className="font-medium text-gray-800">Как это работает:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-gray-600">
              <li>Заполните короткую анкету и узнайте персональные условия</li>
              <li>Получите платёжную ссылку после подключения</li>
              <li>Вставьте её в поле выше — она будет в каждом платном событии</li>
            </ol>
          </div>

          <Button
            asChild
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <a
              href={PRODAMUS_REF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2"
            >
              Заполнить анкету на подключение
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>

          <p className="text-xs text-center text-gray-400">
            Комиссия 2,9–3,8% уточняется индивидуально после заполнения анкеты
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
