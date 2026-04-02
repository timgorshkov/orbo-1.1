'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ExternalLink, Upload, ArrowLeft, ArrowRight, Check } from 'lucide-react'

interface CounterpartyData {
  type: 'individual' | 'legal_entity' | null
  // Individual
  full_name: string
  inn: string
  email: string
  phone: string
  passport_series_number: string
  passport_issued_by: string
  passport_issue_date: string
  registration_address: string
  passport_photo_1_url: string
  passport_photo_2_url: string
  // Legal entity
  org_name: string
  kpp: string
  ogrn: string
  legal_address: string
  signatory_name: string
  signatory_position: string
  vat_rate: 'none' | '5' | '7' | '22'
}

interface BankData {
  bik: string
  bank_name: string
  correspondent_account: string
  settlement_account: string
  transfer_comment: string
}

interface ContractResult {
  contract_number: string
  contract_date: string
}

const INITIAL_CP: CounterpartyData = {
  type: null,
  full_name: '', inn: '', email: '', phone: '',
  passport_series_number: '', passport_issued_by: '', passport_issue_date: '',
  registration_address: '', passport_photo_1_url: '', passport_photo_2_url: '',
  org_name: '', kpp: '', ogrn: '', legal_address: '',
  signatory_name: '', signatory_position: '', vat_rate: 'none',
}

const INITIAL_BANK: BankData = {
  bik: '', bank_name: '', correspondent_account: '',
  settlement_account: '', transfer_comment: '',
}

export default function ContractWizard({ onComplete }: { onComplete: () => void }) {
  const params = useParams()
  const orgId = params.org as string
  const [step, setStep] = useState(1)
  const [cp, setCp] = useState<CounterpartyData>(INITIAL_CP)
  const [bank, setBank] = useState<BankData>(INITIAL_BANK)
  const [result, setResult] = useState<ContractResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState<1 | 2 | null>(null)

  const updateCp = (field: string, value: string) => setCp(prev => ({ ...prev, [field]: value }))
  const updateBank = (field: string, value: string) => setBank(prev => ({ ...prev, [field]: value }))

  const handlePhotoUpload = async (photoIndex: 1 | 2, file: File) => {
    setUploadingPhoto(photoIndex)
    try {
      // Use a temporary ID for upload — will be re-uploaded with real ID after counterparty creation
      const formData = new FormData()
      formData.append('file', file)
      formData.append('counterpartyId', `temp-${orgId}`)
      formData.append('photoIndex', String(photoIndex))

      const res = await fetch('/api/contracts/upload-passport', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        updateCp(photoIndex === 1 ? 'passport_photo_1_url' : 'passport_photo_2_url', data.url)
      }
    } finally {
      setUploadingPhoto(null)
    }
  }

  const submitContract = async () => {
    setSaving(true)
    setError(null)
    try {
      const counterparty: any = { type: cp.type, email: cp.email, phone: cp.phone, inn: cp.inn }
      if (cp.type === 'individual') {
        Object.assign(counterparty, {
          full_name: cp.full_name,
          passport_series_number: cp.passport_series_number,
          passport_issued_by: cp.passport_issued_by,
          passport_issue_date: cp.passport_issue_date,
          registration_address: cp.registration_address,
          passport_photo_1_url: cp.passport_photo_1_url || undefined,
          passport_photo_2_url: cp.passport_photo_2_url || undefined,
        })
      } else {
        Object.assign(counterparty, {
          org_name: cp.org_name, kpp: cp.kpp, ogrn: cp.ogrn,
          legal_address: cp.legal_address, signatory_name: cp.signatory_name,
          signatory_position: cp.signatory_position, vat_rate: cp.vat_rate,
        })
      }

      const bankAccount = {
        bik: bank.bik, bank_name: bank.bank_name,
        correspondent_account: bank.correspondent_account,
        settlement_account: bank.settlement_account,
        transfer_comment: bank.transfer_comment || undefined,
      }

      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, counterparty, bankAccount }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Ошибка при создании договора')
        return
      }

      const data = await res.json()
      setResult({
        contract_number: data.contract.contract_number,
        contract_date: data.contract.contract_date,
      })
      setStep(5)
    } catch {
      setError('Ошибка сети. Попробуйте позже.')
    } finally {
      setSaving(false)
    }
  }

  const canProceedStep3 = cp.type === 'individual'
    ? !!(cp.full_name && cp.inn && cp.email && cp.phone && cp.passport_series_number && cp.passport_issued_by && cp.passport_issue_date && cp.registration_address)
    : !!(cp.org_name && cp.inn && cp.ogrn && cp.legal_address && cp.signatory_name && cp.signatory_position && cp.email && cp.phone)

  const canProceedStep4 = !!(bank.bik && bank.bank_name && bank.correspondent_account && bank.settlement_account)

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        {[1,2,3,4,5].map(s => (
          <div key={s} className="flex items-center gap-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
              s < step ? 'bg-green-100 text-green-700'
              : s === step ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-400'
            }`}>
              {s < step ? <Check className="w-3 h-3" /> : s}
            </div>
            {s < 5 && <div className={`w-8 h-0.5 ${s < step ? 'bg-green-200' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Offer */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Заключение договора</h3>
          <p className="text-sm text-gray-600">
            Для использования платных функций платформы необходимо заключить лицензионный договор.
            Ознакомьтесь с условиями оферты:
          </p>
          <a
            href="https://orbo.ru/offer"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            <ExternalLink className="w-4 h-4" />
            Лицензионный договор (оферта)
          </a>
          <p className="text-xs text-gray-500">
            Нажимая «Далее», вы подтверждаете, что ознакомились с условиями оферты.
          </p>
          <Button onClick={() => setStep(2)}>
            Далее <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Step 2: Type select */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Выберите тип контрагента</h3>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => { updateCp('type', 'individual'); setStep(3) }}
              className="p-6 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-center transition-colors"
            >
              <div className="text-2xl mb-2">👤</div>
              <div className="font-medium">Физическое лицо</div>
              <div className="text-xs text-gray-500 mt-1">Для физлиц</div>
            </button>
            <button
              onClick={() => { updateCp('type', 'legal_entity'); setStep(3) }}
              className="p-6 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-center transition-colors"
            >
              <div className="text-2xl mb-2">🏢</div>
              <div className="font-medium">Юридическое лицо / ИП</div>
              <div className="text-xs text-gray-500 mt-1">Для компаний и ИП</div>
            </button>
          </div>
          <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Назад
          </button>
        </div>
      )}

      {/* Step 3: Requisites */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">
            {cp.type === 'individual' ? 'Данные физического лица' : 'Данные организации'}
          </h3>

          {cp.type === 'individual' ? (
            <div className="space-y-3">
              <Field label="ФИО (как в паспорте)" value={cp.full_name} onChange={v => updateCp('full_name', v)} required />
              <div className="grid grid-cols-2 gap-3">
                <Field label="E-mail" type="email" value={cp.email} onChange={v => updateCp('email', v)} required />
                <Field label="Телефон" value={cp.phone} onChange={v => updateCp('phone', v)} placeholder="+7..." required />
              </div>
              <Field label="ИНН" value={cp.inn} onChange={v => updateCp('inn', v)} placeholder="12 цифр" required />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Серия и номер паспорта" value={cp.passport_series_number} onChange={v => updateCp('passport_series_number', v)} placeholder="0000 000000" required />
                <Field label="Дата выдачи" type="date" value={cp.passport_issue_date} onChange={v => updateCp('passport_issue_date', v)} required />
              </div>
              <Field label="Кем выдан паспорт" value={cp.passport_issued_by} onChange={v => updateCp('passport_issued_by', v)} required />
              <Field label="Адрес регистрации" value={cp.registration_address} onChange={v => updateCp('registration_address', v)} required />
              <div className="grid grid-cols-2 gap-3">
                <PhotoUpload label="Фото паспорта (разворот)" url={cp.passport_photo_1_url} uploading={uploadingPhoto === 1}
                  onUpload={f => handlePhotoUpload(1, f)} />
                <PhotoUpload label="Фото паспорта (прописка)" url={cp.passport_photo_2_url} uploading={uploadingPhoto === 2}
                  onUpload={f => handlePhotoUpload(2, f)} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Полное наименование организации (с ОПФ)" value={cp.org_name} onChange={v => updateCp('org_name', v)} placeholder='ООО "Название" или ИП Фамилия И.О.' required />
              <div className="grid grid-cols-3 gap-3">
                <Field label="ИНН" value={cp.inn} onChange={v => updateCp('inn', v)} required />
                <Field label="КПП" value={cp.kpp} onChange={v => updateCp('kpp', v)} placeholder="Для ИП не требуется" />
                <Field label="ОГРН / ОГРНИП" value={cp.ogrn} onChange={v => updateCp('ogrn', v)} required />
              </div>
              <Field label="Юридический адрес" value={cp.legal_address} onChange={v => updateCp('legal_address', v)} required />
              <div className="grid grid-cols-2 gap-3">
                <Field label="ФИО подписывающего лица" value={cp.signatory_name} onChange={v => updateCp('signatory_name', v)} required />
                <Field label="Должность" value={cp.signatory_position} onChange={v => updateCp('signatory_position', v)} placeholder="Генеральный директор" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ставка НДС</label>
                <select
                  value={cp.vat_rate}
                  onChange={e => updateCp('vat_rate', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="none">Без НДС</option>
                  <option value="5">НДС 5%</option>
                  <option value="7">НДС 7%</option>
                  <option value="22">НДС 22%</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Контактный e-mail" type="email" value={cp.email} onChange={v => updateCp('email', v)} required />
                <Field label="Контактный телефон" value={cp.phone} onChange={v => updateCp('phone', v)} placeholder="+7..." required />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Назад
            </button>
            <Button onClick={() => setStep(4)} disabled={!canProceedStep3}>
              Далее <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Bank details */}
      {step === 4 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Банковские реквизиты</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="БИК" value={bank.bik} onChange={v => updateBank('bik', v)} placeholder="9 цифр" required />
              <Field label="Наименование банка" value={bank.bank_name} onChange={v => updateBank('bank_name', v)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Корреспондентский счёт" value={bank.correspondent_account} onChange={v => updateBank('correspondent_account', v)} placeholder="20 цифр" required />
              <Field label="Расчётный счёт" value={bank.settlement_account} onChange={v => updateBank('settlement_account', v)} placeholder="20 цифр" required />
            </div>
            <Field label="Назначение платежа (комментарий)" value={bank.transfer_comment} onChange={v => updateBank('transfer_comment', v)} />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">{error}</div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setStep(3)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Назад
            </button>
            <Button onClick={submitContract} disabled={!canProceedStep4 || saving}>
              {saving ? 'Сохранение...' : 'Сохранить и продолжить'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 5: Confirmation */}
      {step === 5 && result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-green-200 bg-green-50 p-6 space-y-3">
            <h3 className="text-lg font-semibold text-green-800">Реквизиты сохранены</h3>
            <p className="text-sm text-green-700">
              Договор <strong>{result.contract_number}</strong> от {new Date(result.contract_date).toLocaleDateString('ru-RU')} создан
              и ожидает подтверждения расчётного счёта.
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 space-y-3">
            <h3 className="text-base font-semibold text-blue-800">Подтверждение расчётного счёта</h3>
            <p className="text-sm text-blue-700">Подтвердить расчётный счёт можно одним из двух способов:</p>
            <ol className="text-sm text-blue-700 list-decimal list-inside space-y-2">
              <li>
                <strong>Банковский перевод 200 ₽</strong> с указанного расчётного счёта по реквизитам,
                указанным в счёте (ссылка на счёт будет предоставлена).
              </li>
              <li>
                <strong>Подписанное заявление</strong> — оригинал подписанного заявления о присоединении
                к оферте (шаблон будет предоставлен).
              </li>
            </ol>
            <p className="text-xs text-blue-500 mt-2">
              После подтверждения мы активируем ваш договор. По вопросам пишите на{' '}
              <a href="mailto:sales@orbo.ru" className="underline">sales@orbo.ru</a>
            </p>
          </div>

          <Button onClick={onComplete} variant="outline">
            Готово
          </Button>
        </div>
      )}
    </div>
  )
}

// Helper components

function Field({
  label, value, onChange, type = 'text', placeholder, required
}: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <Input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
  )
}

function PhotoUpload({
  label, url, uploading, onUpload
}: {
  label: string; url: string; uploading: boolean; onUpload: (f: File) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {url ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-600">Загружено</span>
          <button onClick={() => {}} className="text-xs text-blue-600 hover:underline">Заменить</button>
        </div>
      ) : (
        <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
          <Upload className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-500">{uploading ? 'Загрузка...' : 'Выбрать файл'}</span>
          <input type="file" accept="image/*" className="hidden" disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
        </label>
      )}
    </div>
  )
}
