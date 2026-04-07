'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import ContractWizard from './contract-wizard'
import { ContractStatusBadge, BankStatusBadge, CounterpartyTypeBadge } from './contract-status-badge'
import { FileText, Download, Loader2 } from 'lucide-react'

interface ContractData {
  id: string
  contract_number: string
  contract_date: string
  status: string
  invoice_url: string | null
  counterparty: {
    type: string
    inn: string | null
    email: string | null
    phone: string | null
    full_name: string | null
    passport_series_number: string | null
    passport_issued_by: string | null
    passport_issue_date: string | null
    registration_address: string | null
    passport_photo_1_url: string | null
    passport_photo_2_url: string | null
    org_name: string | null
    kpp: string | null
    ogrn: string | null
    legal_address: string | null
    signatory_name: string | null
    signatory_position: string | null
    vat_rate: string | null
  }
  bank_account: {
    bik: string
    bank_name: string
    correspondent_account: string
    settlement_account: string
    transfer_comment: string | null
    status: string
  }
}

const VAT_LABELS: Record<string, string> = {
  none: 'Без НДС',
  '5': 'НДС 5%',
  '7': 'НДС 7%',
  '22': 'НДС 22%',
}

export default function ContractContent() {
  const params = useParams()
  const orgId = params.org as string
  const [contract, setContract] = useState<ContractData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchContract = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/contracts?orgId=${orgId}`)
      if (res.ok) {
        const data = await res.json()
        setContract(data.contract || null)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchContract() }, [orgId])

  if (loading) {
    return <div className="p-6 text-gray-400 text-sm">Загрузка...</div>
  }

  if (!contract) {
    return (
      <div className="max-w-xl">
        <ContractWizard onComplete={fetchContract} />
      </div>
    )
  }

  const cp = contract.counterparty
  const ba = contract.bank_account

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Contract header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Договор {contract.contract_number}</h3>
          <p className="text-sm text-gray-500">
            от {new Date(contract.contract_date).toLocaleDateString('ru-RU')}
          </p>
        </div>
        <ContractStatusBadge status={contract.status} />
      </div>

      {/* Counterparty card */}
      <div className="rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700">Контрагент</h4>
          <CounterpartyTypeBadge type={cp.type} />
        </div>

        {cp.type === 'individual' ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <InfoRow label="ФИО" value={cp.full_name} />
            <InfoRow label="ИНН" value={cp.inn} />
            <InfoRow label="E-mail" value={cp.email} />
            <InfoRow label="Телефон" value={cp.phone} />
            <InfoRow label="Паспорт" value={cp.passport_series_number} />
            <InfoRow label="Дата выдачи" value={cp.passport_issue_date ? new Date(cp.passport_issue_date).toLocaleDateString('ru-RU') : null} />
            <InfoRow label="Кем выдан" value={cp.passport_issued_by} className="col-span-2" />
            <InfoRow label="Адрес регистрации" value={cp.registration_address} className="col-span-2" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <InfoRow label="Наименование" value={cp.org_name} className="col-span-2" />
            <InfoRow label="ИНН" value={cp.inn} />
            <InfoRow label="КПП" value={cp.kpp} />
            <InfoRow label="ОГРН / ОГРНИП" value={cp.ogrn} />
            <InfoRow label="НДС" value={cp.vat_rate ? VAT_LABELS[cp.vat_rate] || cp.vat_rate : null} />
            <InfoRow label="Юр. адрес" value={cp.legal_address} className="col-span-2" />
            <InfoRow label="Подписант" value={cp.signatory_name} />
            <InfoRow label="Должность" value={cp.signatory_position} />
            <InfoRow label="E-mail" value={cp.email} />
            <InfoRow label="Телефон" value={cp.phone} />
          </div>
        )}
      </div>

      {/* Bank account card */}
      <div className="rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700">Расчётный счёт</h4>
          <BankStatusBadge status={ba.status} />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <InfoRow label="БИК" value={ba.bik} />
          <InfoRow label="Банк" value={ba.bank_name} />
          <InfoRow label="Корр. счёт" value={ba.correspondent_account} />
          <InfoRow label="Расч. счёт" value={ba.settlement_account} />
          {ba.transfer_comment && <InfoRow label="Назначение" value={ba.transfer_comment} className="col-span-2" />}
        </div>
      </div>

      {/* Confirmation block for pending contracts */}
      {contract.status === 'filled_by_client' && (
        <VerificationBlock contractId={contract.id} invoiceUrl={contract.invoice_url} />
      )}

      {/* Hint */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-xs text-gray-500">
        Для изменения реквизитов напишите на{' '}
        <a href="mailto:sales@orbo.ru" className="text-blue-600 hover:underline">sales@orbo.ru</a>
      </div>
    </div>
  )
}

function VerificationBlock({ contractId, invoiceUrl: initialUrl }: { contractId: string; invoiceUrl: string | null }) {
  const [invoiceUrl, setInvoiceUrl] = useState(initialUrl)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-generate invoice if not yet generated
  useEffect(() => {
    if (invoiceUrl) return

    setGenerating(true)
    fetch(`/api/contracts/${contractId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate-invoice' }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.url) setInvoiceUrl(data.url)
        else setError('Не удалось сформировать счёт')
      })
      .catch(() => setError('Ошибка сети'))
      .finally(() => setGenerating(false))
  }, [contractId, invoiceUrl])

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-4">
      <h4 className="text-sm font-semibold text-blue-800">Подтверждение расчётного счёта</h4>
      <p className="text-sm text-blue-700">
        Для активации договора необходимо подтвердить расчётный счёт одним из двух способов:
      </p>
      <ol className="text-sm text-blue-700 list-decimal list-inside space-y-2">
        <li>
          <strong>Банковский перевод 200 ₽</strong> с указанного расчётного счёта по реквизитам
          в счёте на оплату.
        </li>
        <li>
          <strong>Подписанное заявление</strong> — оригинал подписанного заявления о присоединении к оферте.
        </li>
      </ol>

      {/* Invoice link */}
      <div className="rounded-lg border border-blue-300 bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-5 h-5 text-blue-600" />
          <h5 className="text-sm font-semibold text-blue-900">Счёт на оплату</h5>
        </div>
        {generating ? (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Формирование счёта...
          </div>
        ) : invoiceUrl ? (
          <a
            href={invoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Открыть счёт на оплату
          </a>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : null}
        {invoiceUrl && (
          <p className="text-xs text-blue-500 mt-2">
            Оплатите 200 ₽ с расчётного счёта, указанного выше. Назначение платежа указано в счёте.
          </p>
        )}
      </div>

      <p className="text-xs text-blue-500">
        После подтверждения мы активируем ваш договор. По вопросам:{' '}
        <a href="mailto:sales@orbo.ru" className="underline">sales@orbo.ru</a>
      </p>
    </div>
  )
}

function InfoRow({ label, value, className = '' }: { label: string; value: string | null; className?: string }) {
  return (
    <div className={className}>
      <span className="text-gray-400">{label}:</span>{' '}
      <span className="text-gray-900">{value || '—'}</span>
    </div>
  )
}
