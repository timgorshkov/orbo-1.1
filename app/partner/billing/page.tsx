import { requirePartner } from '@/lib/server/partnerGuard'
import { Wallet, FileText, ArrowDownToLine, Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PartnerBillingPage() {
  const partner = await requirePartner()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Биллинг</h2>
        <p className="mt-1 text-gray-600">
          Начисления, баланс и выплаты партнёрского вознаграждения
        </p>
      </div>

      {/* Balance cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-white border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
              <Wallet className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="text-sm text-gray-500">Текущий баланс</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">0 &#8381;</p>
        </div>
        <div className="rounded-lg bg-white border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
              <ArrowDownToLine className="h-5 w-5 text-blue-600" />
            </div>
            <p className="text-sm text-gray-500">Всего начислено</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">0 &#8381;</p>
        </div>
        <div className="rounded-lg bg-white border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
              <Clock className="h-5 w-5 text-purple-600" />
            </div>
            <p className="text-sm text-gray-500">Выведено</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">0 &#8381;</p>
        </div>
      </div>

      {/* Transactions */}
      <div className="rounded-lg bg-white border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Wallet className="h-5 w-5 text-emerald-600" />
          История начислений
        </h3>
        <div className="p-8 text-center">
          <Wallet className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Начислений пока нет</p>
          <p className="text-sm text-gray-400 mt-1">
            Начисления появятся после оплаты подписки вашими рефералами
          </p>
        </div>
      </div>

      {/* Withdrawal requests */}
      <div className="rounded-lg bg-white border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
          Заявки на вывод
        </h3>
        <div className="p-8 text-center">
          <ArrowDownToLine className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Заявок на вывод пока нет</p>
          <p className="text-sm text-gray-400 mt-1">
            Функционал формирования заявок на вывод будет доступен в ближайшее время
          </p>
        </div>
      </div>

      {/* Documents */}
      <div className="rounded-lg bg-white border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-emerald-600" />
          Документы (акты)
        </h3>
        <div className="p-8 text-center">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Документов пока нет</p>
          <p className="text-sm text-gray-400 mt-1">
            Акты будут формироваться при создании заявки на вывод средств
          </p>
        </div>
      </div>
    </div>
  )
}
