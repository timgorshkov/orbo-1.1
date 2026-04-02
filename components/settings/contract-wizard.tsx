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

// --- Валидация ---

type ValidationRule = { check: (v: string) => boolean; hint: string }

const digitsOnly = (v: string) => v.replace(/\D/g, '')

const VALIDATORS: Record<string, ValidationRule> = {
  full_name: { check: v => v.trim().split(/\s+/).length >= 2, hint: 'Укажите минимум имя и фамилию' },
  email: { check: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), hint: 'Некорректный e-mail' },
  phone: { check: v => digitsOnly(v).length >= 10, hint: 'Минимум 10 цифр' },
  inn_individual: { check: v => digitsOnly(v).length === 12, hint: 'ИНН физлица — 12 цифр' },
  inn_legal: { check: v => { const d = digitsOnly(v).length; return d === 10 || d === 12 }, hint: 'ИНН юрлица — 10 цифр, ИП — 12 цифр' },
  passport_series_number: { check: v => digitsOnly(v).length === 10, hint: 'Серия (4 цифры) + номер (6 цифр)' },
  passport_issued_by: { check: v => v.trim().length >= 10, hint: 'Слишком короткое значение' },
  registration_address: { check: v => v.trim().length >= 10, hint: 'Слишком короткий адрес' },
  org_name: { check: v => v.trim().length >= 5, hint: 'Слишком короткое наименование' },
  kpp: { check: v => !v.trim() || digitsOnly(v).length === 9, hint: 'КПП — 9 цифр (необязательно для ИП)' },
  ogrn: { check: v => { const d = digitsOnly(v).length; return d === 13 || d === 15 }, hint: 'ОГРН — 13 цифр, ОГРНИП — 15 цифр' },
  legal_address: { check: v => v.trim().length >= 10, hint: 'Слишком короткий адрес' },
  signatory_name: { check: v => v.trim().split(/\s+/).length >= 2, hint: 'Укажите минимум имя и фамилию' },
  signatory_position: { check: v => v.trim().length >= 3, hint: 'Слишком короткое значение' },
  bik: { check: v => digitsOnly(v).length === 9, hint: 'БИК — 9 цифр' },
  bank_name: { check: v => v.trim().length >= 3, hint: 'Слишком короткое название' },
  correspondent_account: { check: v => digitsOnly(v).length === 20, hint: 'Корр. счёт — 20 цифр' },
  settlement_account: { check: v => digitsOnly(v).length === 20, hint: 'Расч. счёт — 20 цифр' },
}

function validate(field: string, value: string): string | null {
  const rule = VALIDATORS[field]
  if (!rule) return null
  if (!value.trim()) return null // пустое обрабатывается через required
  return rule.check(value) ? null : rule.hint
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
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [showValidation, setShowValidation] = useState(false)
  const [showBankValidation, setShowBankValidation] = useState(false)

  const updateCp = (field: string, value: string) => setCp(prev => ({ ...prev, [field]: value }))
  const updateBank = (field: string, value: string) => setBank(prev => ({ ...prev, [field]: value }))

  const handlePhotoUpload = async (photoIndex: 1 | 2, file: File) => {
    setUploadingPhoto(photoIndex)
    setPhotoError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('counterpartyId', `temp-${orgId}`)
      formData.append('photoIndex', String(photoIndex))

      const res = await fetch('/api/contracts/upload-passport', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        updateCp(photoIndex === 1 ? 'passport_photo_1_url' : 'passport_photo_2_url', data.url)
      } else {
        const data = await res.json().catch(() => ({}))
        setPhotoError(data.error || 'Не удалось загрузить фото')
      }
    } catch {
      setPhotoError('Ошибка сети при загрузке фото')
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

  const getStep3Errors = (): string[] => {
    const errors: string[] = []
    const req = (field: string, value: string, validatorKey?: string) => {
      if (!value.trim()) errors.push(field)
      else if (validatorKey) {
        const err = validate(validatorKey, value)
        if (err) errors.push(field)
      }
    }
    if (cp.type === 'individual') {
      req('full_name', cp.full_name, 'full_name')
      req('email', cp.email, 'email')
      req('phone', cp.phone, 'phone')
      req('inn', cp.inn, 'inn_individual')
      req('passport_series_number', cp.passport_series_number, 'passport_series_number')
      req('passport_issue_date', cp.passport_issue_date)
      req('passport_issued_by', cp.passport_issued_by, 'passport_issued_by')
      req('registration_address', cp.registration_address, 'registration_address')
    } else {
      req('org_name', cp.org_name, 'org_name')
      req('inn', cp.inn, 'inn_legal')
      // КПП необязательно для ИП, но если заполнено — проверяем формат
      if (cp.kpp.trim() && validate('kpp', cp.kpp)) errors.push('kpp')
      req('ogrn', cp.ogrn, 'ogrn')
      req('legal_address', cp.legal_address, 'legal_address')
      req('signatory_name', cp.signatory_name, 'signatory_name')
      req('signatory_position', cp.signatory_position, 'signatory_position')
      req('email', cp.email, 'email')
      req('phone', cp.phone, 'phone')
    }
    return errors
  }

  const getStep4Errors = (): string[] => {
    const errors: string[] = []
    const req = (field: string, value: string, validatorKey?: string) => {
      if (!value.trim()) errors.push(field)
      else if (validatorKey) {
        const err = validate(validatorKey, value)
        if (err) errors.push(field)
      }
    }
    req('bik', bank.bik, 'bik')
    req('bank_name', bank.bank_name, 'bank_name')
    req('correspondent_account', bank.correspondent_account, 'correspondent_account')
    req('settlement_account', bank.settlement_account, 'settlement_account')
    return errors
  }

  const canProceedStep3 = getStep3Errors().length === 0
  const canProceedStep4 = getStep4Errors().length === 0

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
              <Field label="ФИО (как в паспорте)" value={cp.full_name} onChange={v => updateCp('full_name', v)} required showValidation={showValidation} validatorKey="full_name" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="E-mail" type="email" value={cp.email} onChange={v => updateCp('email', v)} required showValidation={showValidation} validatorKey="email" />
                <Field label="Телефон" value={cp.phone} onChange={v => updateCp('phone', v)} placeholder="+7..." required showValidation={showValidation} validatorKey="phone" />
              </div>
              <Field label="ИНН" value={cp.inn} onChange={v => updateCp('inn', v)} placeholder="12 цифр" required showValidation={showValidation} validatorKey="inn_individual" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Серия и номер паспорта" value={cp.passport_series_number} onChange={v => updateCp('passport_series_number', v)} placeholder="0000 000000" required showValidation={showValidation} validatorKey="passport_series_number" />
                <Field label="Дата выдачи" type="date" value={cp.passport_issue_date} onChange={v => updateCp('passport_issue_date', v)} required showValidation={showValidation} />
              </div>
              <Field label="Кем выдан паспорт" value={cp.passport_issued_by} onChange={v => updateCp('passport_issued_by', v)} required showValidation={showValidation} validatorKey="passport_issued_by" />
              <Field label="Адрес регистрации" value={cp.registration_address} onChange={v => updateCp('registration_address', v)} required showValidation={showValidation} validatorKey="registration_address" />
              <div className="grid grid-cols-2 gap-3">
                <PhotoUpload label="Фото паспорта (разворот)" url={cp.passport_photo_1_url} uploading={uploadingPhoto === 1}
                  onUpload={f => handlePhotoUpload(1, f)} />
                <PhotoUpload label="Фото паспорта (прописка)" url={cp.passport_photo_2_url} uploading={uploadingPhoto === 2}
                  onUpload={f => handlePhotoUpload(2, f)} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Полное наименование организации (с ОПФ)" value={cp.org_name} onChange={v => updateCp('org_name', v)} placeholder='ООО "Название" или ИП Фамилия И.О.' required showValidation={showValidation} validatorKey="org_name" />
              <div className="grid grid-cols-3 gap-3">
                <Field label="ИНН" value={cp.inn} onChange={v => updateCp('inn', v)} required showValidation={showValidation} validatorKey="inn_legal" />
                <Field label="КПП" value={cp.kpp} onChange={v => updateCp('kpp', v)} placeholder="Для ИП не требуется" showValidation={showValidation} validatorKey="kpp" />
                <Field label="ОГРН / ОГРНИП" value={cp.ogrn} onChange={v => updateCp('ogrn', v)} required showValidation={showValidation} validatorKey="ogrn" />
              </div>
              <Field label="Юридический адрес" value={cp.legal_address} onChange={v => updateCp('legal_address', v)} required showValidation={showValidation} validatorKey="legal_address" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="ФИО подписывающего лица" value={cp.signatory_name} onChange={v => updateCp('signatory_name', v)} required showValidation={showValidation} validatorKey="signatory_name" />
                <Field label="Должность" value={cp.signatory_position} onChange={v => updateCp('signatory_position', v)} placeholder="Генеральный директор" required showValidation={showValidation} validatorKey="signatory_position" />
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
                <Field label="Контактный e-mail" type="email" value={cp.email} onChange={v => updateCp('email', v)} required showValidation={showValidation} validatorKey="email" />
                <Field label="Контактный телефон" value={cp.phone} onChange={v => updateCp('phone', v)} placeholder="+7..." required showValidation={showValidation} validatorKey="phone" />
              </div>
            </div>
          )}

          {photoError && (
            <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">{photoError}</div>
          )}

          {showValidation && !canProceedStep3 && (
            <div className="p-3 rounded-lg bg-amber-50 text-amber-700 text-sm border border-amber-200">
              Заполните все обязательные поля, отмеченные <span className="text-red-400">*</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => { setStep(2); setShowValidation(false) }} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Назад
            </button>
            <Button onClick={() => { setShowValidation(true); if (canProceedStep3) { setShowValidation(false); setStep(4) } }}>
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
              <Field label="БИК" value={bank.bik} onChange={v => updateBank('bik', v)} placeholder="9 цифр" required showValidation={showBankValidation} validatorKey="bik" />
              <Field label="Наименование банка" value={bank.bank_name} onChange={v => updateBank('bank_name', v)} required showValidation={showBankValidation} validatorKey="bank_name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Корреспондентский счёт" value={bank.correspondent_account} onChange={v => updateBank('correspondent_account', v)} placeholder="20 цифр" required showValidation={showBankValidation} validatorKey="correspondent_account" />
              <Field label="Расчётный счёт" value={bank.settlement_account} onChange={v => updateBank('settlement_account', v)} placeholder="20 цифр" required showValidation={showBankValidation} validatorKey="settlement_account" />
            </div>
            <Field label="Назначение платежа (комментарий)" value={bank.transfer_comment} onChange={v => updateBank('transfer_comment', v)} />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">{error}</div>
          )}

          {showBankValidation && !canProceedStep4 && (
            <div className="p-3 rounded-lg bg-amber-50 text-amber-700 text-sm border border-amber-200">
              Проверьте корректность банковских реквизитов
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setStep(3)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Назад
            </button>
            <Button onClick={() => { setShowBankValidation(true); if (canProceedStep4) submitContract() }} disabled={saving}>
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
  label, value, onChange, type = 'text', placeholder, required, showValidation, validatorKey
}: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; required?: boolean; showValidation?: boolean
  validatorKey?: string
}) {
  const isEmpty = required && !value.trim()
  const formatError = validatorKey && value.trim() ? validate(validatorKey, value) : null
  const hasError = showValidation && (isEmpty || !!formatError)
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
        className={`h-9 ${hasError ? 'border-red-300 ring-1 ring-red-200' : ''}`}
      />
      {showValidation && formatError && (
        <p className="text-xs text-red-500 mt-0.5">{formatError}</p>
      )}
    </div>
  )
}

function PhotoUpload({
  label, url, uploading, onUpload, onReplace
}: {
  label: string; url: string; uploading: boolean; onUpload: (f: File) => void; onReplace?: () => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {url ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <Check className="w-4 h-4 text-green-600" />
          <span className="text-xs text-green-700 flex-1">Файл загружен</span>
          <label className="text-xs text-blue-600 hover:underline cursor-pointer">
            Заменить
            <input type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
          </label>
        </div>
      ) : (
        <label className={`flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg transition-colors ${
          uploading ? 'border-blue-300 bg-blue-50' : 'border-gray-300 cursor-pointer hover:border-blue-400 hover:bg-blue-50'
        }`}>
          <Upload className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-500">{uploading ? 'Загрузка...' : 'Выбрать файл'}</span>
          <input type="file" accept="image/*" className="hidden" disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
        </label>
      )}
    </div>
  )
}
