'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ContractStatusBadge, BankStatusBadge, CounterpartyTypeBadge } from '@/components/settings/contract-status-badge'
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Pencil, Save, Upload, X } from 'lucide-react'

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
          {!editing && contract.status === 'filled_by_client' && (
            <PaymentVerifyButton contractId={contractId} />
          )}
          {!editing && (contract.status === 'verified' || contract.status === 'signed' || contract.status === 'filled_by_client') && (
            <ManualVerificationFeeButton contractId={contractId} />
          )}
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
          <>
            <select value={contractStatus} onChange={e => setContractStatus(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm">
              {CONTRACT_STATUSES.map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <ContractStatusLegend />
          </>
        ) : (
          <div className="space-y-2">
            <ContractStatusBadge status={contract.status} />
            <div className="text-xs text-gray-500">
              {contract.status === 'filled_by_client' && 'Ожидает проверки: клиент заполнил реквизиты и должен оплатить счёт на 200 ₽.'}
              {contract.status === 'verified' && 'Реквизиты сверены, платёж получен — можно принимать оплаты через платформу. Выплаты недоступны до статуса «Заключён».'}
              {contract.status === 'signed' && 'Бумажный договор подписан обеими сторонами — доступны и приём платежей, и вывод средств.'}
              {contract.status === 'terminated' && 'Договор расторгнут: приём платежей и выплаты заблокированы.'}
            </div>
          </div>
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

function ContractStatusLegend() {
  return (
    <div className="mt-3 text-xs text-gray-500 space-y-1">
      <div><strong className="text-gray-700">Заполнен клиентом</strong> — ожидает проверки реквизитов и оплаты счёта.</div>
      <div><strong className="text-gray-700">Проверен</strong> — приём оплат включён. <span className="text-orange-600">Выплаты пока недоступны.</span></div>
      <div><strong className="text-gray-700">Заключён</strong> — бумажный договор подписан. Доступны и приём оплат, и вывод средств.</div>
      <div><strong className="text-gray-700">Расторгнут</strong> — приём оплат и выплаты заблокированы.</div>
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

// ─────────────────────────────────────────────────────────────────────────────
// Кнопка «Загрузить платёжки» + модалка со сверкой 1С-выписки
// ─────────────────────────────────────────────────────────────────────────────

interface VerifyDiscrepancy {
  field: string
  label: string
  expected: string
  actual: string
}

interface VerifyResponse {
  contractNumber: string
  paymentsInStatement: number
  paymentFound: boolean
  matched: boolean
  payment: {
    number: string
    date: string
    amount: number
    purpose: string
    payer: { name: string; inn: string; kpp: string; account: string; bankBik: string }
  } | null
  discrepancies: VerifyDiscrepancy[]
  warnings: string[]
}

function PaymentVerifyButton({ contractId }: { contractId: string }) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<VerifyResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  const close = () => {
    if (uploading) return
    setOpen(false)
    setResult(null)
    setError(null)
    setFileName(null)
  }

  const upload = async (file: File) => {
    setUploading(true)
    setError(null)
    setResult(null)
    setFileName(file.name)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/superadmin/contracts/${contractId}/verify-payment`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка сверки')
      setResult(data as VerifyResponse)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="w-3.5 h-3.5 mr-1" /> Загрузить платёжки
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Сверка с банковской выпиской</h3>
              <button
                onClick={close}
                disabled={uploading}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <p className="text-sm text-gray-600">
                Загрузите файл банковской выписки в формате <strong>1С</strong> (обычно
                <code className="bg-gray-100 px-1 rounded text-xs mx-1">.txt</code> в кодировке
                Windows-1251). Система найдёт платёжку по номеру договора в «Назначении платежа»
                и сверит реквизиты плательщика с заполненными в договоре.
              </p>

              <label className="block">
                <input
                  type="file"
                  accept=".txt,text/plain"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) upload(f)
                  }}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 file:cursor-pointer"
                />
              </label>

              {fileName && (
                <div className="text-xs text-gray-500">
                  Файл: <span className="font-mono">{fileName}</span>
                </div>
              )}

              {uploading && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Обработка файла...
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>{error}</div>
                </div>
              )}

              {result && <VerifyResultBlock result={result} />}
            </div>

            <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
              <Button variant="outline" size="sm" onClick={close} disabled={uploading}>
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function VerifyResultBlock({ result }: { result: VerifyResponse }) {
  if (!result.paymentFound) {
    return (
      <div className="flex items-start gap-2 text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded-lg p-3">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          В выписке не найдено платёжное поручение с упоминанием номера договора{' '}
          <strong>{result.contractNumber}</strong> в «Назначении платежа».
          Всего платежей в файле: {result.paymentsInStatement}.
        </div>
      </div>
    )
  }

  if (result.matched) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Все реквизиты совпадают.</div>
            <div className="text-xs mt-0.5">
              Найдено платёжное поручение №{result.payment?.number} от {result.payment?.date}{' '}
              на сумму {result.payment?.amount.toFixed(2)} ₽.
            </div>
          </div>
        </div>
        <PaymentDetails payment={result.payment!} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <div className="font-medium">Найдены расхождения ({result.discrepancies.length}):</div>
          <div className="text-xs mt-0.5">
            Платёжное поручение №{result.payment?.number} от {result.payment?.date} —
            реквизиты не полностью совпадают с договором.
          </div>
        </div>
      </div>
      <div className="border border-red-200 rounded-lg divide-y divide-red-100">
        {result.discrepancies.map((d) => (
          <div key={d.field} className="px-3 py-2 text-xs">
            <div className="font-medium text-gray-700 mb-0.5">{d.label}</div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono">
              <span className="text-gray-500">Договор:</span>
              <span className="text-green-700 break-all">{d.expected || '(пусто)'}</span>
              <span className="text-gray-500">Выписка:</span>
              <span className="text-red-700 break-all">{d.actual || '(пусто)'}</span>
            </div>
          </div>
        ))}
      </div>
      <PaymentDetails payment={result.payment!} />
    </div>
  )
}

function PaymentDetails({ payment }: { payment: NonNullable<VerifyResponse['payment']> }) {
  return (
    <details className="text-xs border border-gray-200 rounded-lg">
      <summary className="px-3 py-2 cursor-pointer text-gray-600 hover:bg-gray-50">
        Данные платёжки в выписке
      </summary>
      <div className="px-3 py-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
        <span className="text-gray-500">№:</span><span>{payment.number}</span>
        <span className="text-gray-500">Дата:</span><span>{payment.date}</span>
        <span className="text-gray-500">Сумма:</span><span>{payment.amount.toFixed(2)} ₽</span>
        <span className="text-gray-500">Плательщик:</span><span className="break-all">{payment.payer.name}</span>
        <span className="text-gray-500">ИНН:</span><span>{payment.payer.inn}</span>
        <span className="text-gray-500">КПП:</span><span>{payment.payer.kpp || '—'}</span>
        <span className="text-gray-500">Р/с:</span><span>{payment.payer.account}</span>
        <span className="text-gray-500">БИК:</span><span>{payment.payer.bankBik}</span>
        <span className="text-gray-500">Назначение:</span><span className="break-all">{payment.purpose}</span>
      </div>
    </details>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Кнопка «Зафиксировать оплату вручную» — для случаев когда платёж пришёл, но
// сверка по выписке не была проведена (старые платежи, потерянная выписка).
// Создаёт org_invoice + триггерит акт АЛ + автосинхронизацию с Эльбой.
// ─────────────────────────────────────────────────────────────────────────────

function ManualVerificationFeeButton({ contractId }: { contractId: string }) {
  const [open, setOpen] = useState(false)
  const [paidDate, setPaidDate] = useState<string>('')
  const [amount, setAmount] = useState<string>('200')
  const [paymentNumber, setPaymentNumber] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ actNumber: string | null; actUrl: string | null; alreadyExisted: boolean } | null>(null)

  const close = () => {
    if (submitting) return
    setOpen(false)
    setError(null)
    setDone(null)
  }

  const submit = async () => {
    if (!paidDate) {
      setError('Укажите дату оплаты')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/superadmin/contracts/${contractId}/record-verification-fee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paidDate,
          amount: amount ? Number(amount) : 200,
          paymentNumber: paymentNumber || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось зафиксировать')
      setDone({ actNumber: data.actNumber, actUrl: data.actUrl, alreadyExisted: !!data.alreadyExisted })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="w-3.5 h-3.5 mr-1" /> Зафиксировать оплату вручную
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Ручная фиксация оплаты</h3>
              <button onClick={close} disabled={submitting} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {!done ? (
                <>
                  <p className="text-sm text-gray-600">
                    Создаст инвойс, акт лицензии (АЛ) и отправит его в Контур.Эльбу.
                    Используйте, когда оплата пришла на счёт, но сверка по выписке не проводилась.
                  </p>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Дата оплаты</label>
                    <input
                      type="date"
                      value={paidDate}
                      onChange={(e) => setPaidDate(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Сумма, ₽</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">№ платёжки (необязательно)</label>
                    <input
                      type="text"
                      value={paymentNumber}
                      onChange={(e) => setPaymentNumber(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                      disabled={submitting}
                      placeholder="например, 1234"
                    />
                  </div>

                  {error && (
                    <div className="text-sm text-red-600 p-2 bg-red-50 border border-red-200 rounded">{error}</div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={close} disabled={submitting}>Отмена</Button>
                    <Button size="sm" onClick={submit} disabled={submitting}>
                      {submitting ? 'Создаём…' : 'Зафиксировать'}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="text-green-700 text-sm">
                    {done.alreadyExisted
                      ? 'Оплата уже была зафиксирована ранее.'
                      : 'Готово. Инвойс и акт созданы.'}
                  </div>
                  {done.actNumber && (
                    <div className="text-sm text-gray-700">
                      Акт: <span className="font-mono">{done.actNumber}</span>
                    </div>
                  )}
                  {done.actUrl && (
                    <a href={done.actUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
                      Открыть HTML акта
                    </a>
                  )}
                  <div className="flex justify-end pt-2">
                    <Button size="sm" onClick={close}>Готово</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
