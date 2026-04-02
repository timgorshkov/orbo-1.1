'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ContractStatusBadge, BankStatusBadge, CounterpartyTypeBadge } from '@/components/settings/contract-status-badge'
import { ArrowLeft, Pencil, Save } from 'lucide-react'

interface ContractData {
  id: string
  org_id: string
  contract_number: string
  contract_date: string
  status: string
  org_name?: string
  counterparty: Record<string, any>
  bank_account: Record<string, any>
}

const CONTRACT_STATUSES = ['filled_by_client', 'verified', 'signed', 'terminated']
const BANK_STATUSES = ['filled_by_client', 'active', 'inactive']
const VAT_OPTIONS = [
  { value: 'none', label: 'Без НДС' },
  { value: '5', label: 'НДС 5%' },
  { value: '7', label: 'НДС 7%' },
  { value: '22', label: 'НДС 22%' },
]

const STATUS_LABELS: Record<string, string> = {
  filled_by_client: 'Заполнен клиентом',
  verified: 'Проверен',
  signed: 'Заключён',
  terminated: 'Расторгнут',
  active: 'Действующий',
  inactive: 'Недействующий',
}

export default function ContractDetailForm({ contractId }: { contractId: string }) {
  const router = useRouter()
  const [contract, setContract] = useState<ContractData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)

  // Editable copies
  const [contractStatus, setContractStatus] = useState('')
  const [bankStatus, setBankStatus] = useState('')
  const [cpFields, setCpFields] = useState<Record<string, any>>({})
  const [baFields, setBaFields] = useState<Record<string, any>>({})

  useEffect(() => {
    fetchContract()
  }, [contractId])

  const fetchContract = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/superadmin/contracts/${contractId}`)
      if (res.ok) {
        const data = await res.json()
        setContract(data.contract)
        setContractStatus(data.contract.status)
        setBankStatus(data.contract.bank_account.status)
        setCpFields({ ...data.contract.counterparty })
        setBaFields({ ...data.contract.bank_account })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!contract) return
    setSaving(true)
    try {
      const body: any = {}

      if (contractStatus !== contract.status) {
        body.contract = { status: contractStatus }
      }

      // Collect changed counterparty fields
      const cpChanges: Record<string, any> = {}
      for (const [key, value] of Object.entries(cpFields)) {
        if (key === 'id' || key === 'type') continue
        if (value !== contract.counterparty[key]) cpChanges[key] = value
      }
      if (Object.keys(cpChanges).length > 0) body.counterparty = cpChanges

      // Collect changed bank account fields
      const baChanges: Record<string, any> = {}
      for (const [key, value] of Object.entries(baFields)) {
        if (key === 'id') continue
        if (value !== contract.bank_account[key]) baChanges[key] = value
      }
      if (bankStatus !== contract.bank_account.status) baChanges.status = bankStatus
      if (Object.keys(baChanges).length > 0) body.bankAccount = baChanges

      if (Object.keys(body).length === 0) {
        setEditing(false)
        return
      }

      const res = await fetch(`/api/superadmin/contracts/${contractId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        await fetchContract()
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-gray-400 text-sm">Загрузка...</div>
  if (!contract) return <div className="text-red-500 text-sm">Договор не найден</div>

  const cp = contract.counterparty
  const isIndividual = cp.type === 'individual'

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/superadmin/contracts')} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{contract.contract_number}</h2>
            <p className="text-sm text-gray-500">
              {contract.org_name} &middot; {new Date(contract.contract_date).toLocaleDateString('ru-RU')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1" /> Редактировать
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => { setEditing(false); fetchContract() }}>
                Отмена
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="w-3.5 h-3.5 mr-1" /> {saving ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Contract status */}
      <Section title="Статус договора">
        {editing ? (
          <select value={contractStatus} onChange={e => setContractStatus(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm">
            {CONTRACT_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        ) : (
          <ContractStatusBadge status={contract.status} />
        )}
      </Section>

      {/* Counterparty */}
      <Section title={<span className="flex items-center gap-2">Контрагент <CounterpartyTypeBadge type={cp.type} /></span>}>
        {isIndividual ? (
          <div className="grid grid-cols-2 gap-4">
            <EditableField label="ФИО" field="full_name" fields={cpFields} setFields={setCpFields} editing={editing} />
            <EditableField label="ИНН" field="inn" fields={cpFields} setFields={setCpFields} editing={editing} />
            <EditableField label="E-mail" field="email" fields={cpFields} setFields={setCpFields} editing={editing} />
            <EditableField label="Телефон" field="phone" fields={cpFields} setFields={setCpFields} editing={editing} />
            <EditableField label="Паспорт" field="passport_series_number" fields={cpFields} setFields={setCpFields} editing={editing} />
            <EditableField label="Дата выдачи" field="passport_issue_date" fields={cpFields} setFields={setCpFields} editing={editing} type="date" />
            <EditableField label="Кем выдан" field="passport_issued_by" fields={cpFields} setFields={setCpFields} editing={editing} className="col-span-2" />
            <EditableField label="Адрес регистрации" field="registration_address" fields={cpFields} setFields={setCpFields} editing={editing} className="col-span-2" />
            {cp.passport_photo_1_url && (
              <div className="col-span-2">
                <span className="text-xs text-gray-400">Фото паспорта:</span>{' '}
                <a href={cp.passport_photo_1_url} target="_blank" className="text-xs text-blue-600 hover:underline">Фото 1</a>
                {cp.passport_photo_2_url && (
                  <>{', '}<a href={cp.passport_photo_2_url} target="_blank" className="text-xs text-blue-600 hover:underline">Фото 2</a></>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <EditableField label="Наименование" field="org_name" fields={cpFields} setFields={setCpFields} editing={editing} className="col-span-2" />
            <EditableField label="ИНН" field="inn" fields={cpFields} setFields={setCpFields} editing={editing} />
            <EditableField label="КПП" field="kpp" fields={cpFields} setFields={setCpFields} editing={editing} />
            <EditableField label="ОГРН / ОГРНИП" field="ogrn" fields={cpFields} setFields={setCpFields} editing={editing} />
            {editing ? (
              <div>
                <label className="block text-xs text-gray-400 mb-1">НДС</label>
                <select value={cpFields.vat_rate || 'none'} onChange={e => setCpFields(prev => ({ ...prev, vat_rate: e.target.value }))}
                  className="border rounded-lg px-3 py-2 text-sm w-full">
                  {VAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ) : (
              <div><span className="text-xs text-gray-400">НДС:</span> <span className="text-sm">{VAT_OPTIONS.find(o => o.value === cp.vat_rate)?.label || '—'}</span></div>
            )}
            <EditableField label="Юр. адрес" field="legal_address" fields={cpFields} setFields={setCpFields} editing={editing} className="col-span-2" />
            <EditableField label="Подписант" field="signatory_name" fields={cpFields} setFields={setCpFields} editing={editing} />
            <EditableField label="Должность" field="signatory_position" fields={cpFields} setFields={setCpFields} editing={editing} />
            <EditableField label="E-mail" field="email" fields={cpFields} setFields={setCpFields} editing={editing} />
            <EditableField label="Телефон" field="phone" fields={cpFields} setFields={setCpFields} editing={editing} />
          </div>
        )}
      </Section>

      {/* Bank account */}
      <Section title="Расчётный счёт">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Статус:</span>
            {editing ? (
              <select value={bankStatus} onChange={e => setBankStatus(e.target.value)}
                className="border rounded-lg px-2 py-1 text-xs">
                {BANK_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            ) : (
              <BankStatusBadge status={contract.bank_account.status} />
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <EditableField label="БИК" field="bik" fields={baFields} setFields={setBaFields} editing={editing} />
            <EditableField label="Банк" field="bank_name" fields={baFields} setFields={setBaFields} editing={editing} />
            <EditableField label="Корр. счёт" field="correspondent_account" fields={baFields} setFields={setBaFields} editing={editing} />
            <EditableField label="Расч. счёт" field="settlement_account" fields={baFields} setFields={setBaFields} editing={editing} />
            <EditableField label="Назначение" field="transfer_comment" fields={baFields} setFields={setBaFields} editing={editing} className="col-span-2" />
          </div>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      {children}
    </div>
  )
}

function EditableField({
  label, field, fields, setFields, editing, type = 'text', className = ''
}: {
  label: string; field: string; fields: Record<string, any>
  setFields: (fn: (prev: Record<string, any>) => Record<string, any>) => void
  editing: boolean; type?: string; className?: string
}) {
  const value = fields[field] ?? ''
  if (editing) {
    return (
      <div className={className}>
        <label className="block text-xs text-gray-400 mb-1">{label}</label>
        <Input
          type={type}
          value={value}
          onChange={e => setFields(prev => ({ ...prev, [field]: e.target.value }))}
          className="h-8 text-sm"
        />
      </div>
    )
  }

  return (
    <div className={className}>
      <span className="text-xs text-gray-400">{label}:</span>{' '}
      <span className="text-sm text-gray-900">{value || '—'}</span>
    </div>
  )
}
