'use client'

const CONTRACT_STATUS_MAP: Record<string, { label: string; className: string }> = {
  filled_by_client: { label: 'Заполнен', className: 'bg-yellow-100 text-yellow-700' },
  verified: { label: 'Проверен', className: 'bg-blue-100 text-blue-700' },
  signed: { label: 'Заключён', className: 'bg-green-100 text-green-700' },
  terminated: { label: 'Расторгнут', className: 'bg-red-100 text-red-700' },
}

const BANK_STATUS_MAP: Record<string, { label: string; className: string }> = {
  filled_by_client: { label: 'Заполнен', className: 'bg-yellow-100 text-yellow-700' },
  active: { label: 'Действующий', className: 'bg-green-100 text-green-700' },
  inactive: { label: 'Недействующий', className: 'bg-gray-100 text-gray-600' },
}

export function ContractStatusBadge({ status }: { status: string }) {
  const info = CONTRACT_STATUS_MAP[status] || { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${info.className}`}>
      {info.label}
    </span>
  )
}

export function BankStatusBadge({ status }: { status: string }) {
  const info = BANK_STATUS_MAP[status] || { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${info.className}`}>
      {info.label}
    </span>
  )
}

export function CounterpartyTypeBadge({ type }: { type: string }) {
  const isIndividual = type === 'individual'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      isIndividual ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'
    }`}>
      {isIndividual ? 'Физлицо' : 'Юрлицо / ИП'}
    </span>
  )
}
