import { requirePartner } from '@/lib/server/partnerGuard'
import { BookOpen, Image, Video, Link as LinkIcon, Copy } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PartnerOverviewPage() {
  const partner = await requirePartner()

  const referralLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://orbo.ru'}/pricing?via=${partner.code}`

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Добро пожаловать, {partner.name}!
        </h2>
        <p className="mt-1 text-gray-600">
          Вы участник партнёрской программы Orbo. Здесь вы найдёте все необходимые материалы и сможете отслеживать своих рефералов.
        </p>
      </div>

      {/* Referral link */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
        <h3 className="text-sm font-semibold text-emerald-800 mb-2">Ваша реферальная ссылка</h3>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded bg-white px-3 py-2 text-sm text-gray-800 border border-emerald-200 truncate">
            {referralLink}
          </code>
          <button
            className="hidden"
            data-referral-link={referralLink}
            id="referral-link-value"
          />
        </div>
        <p className="mt-2 text-xs text-emerald-700">
          Делитесь этой ссылкой с потенциальными клиентами. Все регистрации по ней автоматически привязываются к вашему аккаунту.
        </p>
      </div>

      {/* Program conditions */}
      <div className="rounded-lg bg-white border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-emerald-600" />
          Условия партнёрской программы
        </h3>
        <div className="prose prose-sm text-gray-700 max-w-none">
          <ul className="space-y-2">
            <li>Вы получаете вознаграждение за каждого привлечённого клиента, который оформил платную подписку</li>
            <li>Размер вознаграждения — процент от суммы оплаты клиента (уточняйте у менеджера)</li>
            <li>Начисления происходят автоматически после подтверждения оплаты реферала</li>
            <li>Вывод средств осуществляется по заявке после подписания акта выполненных работ</li>
            <li>Минимальная сумма для вывода — 5 000 руб.</li>
          </ul>
        </div>
      </div>

      {/* Materials section */}
      <div className="rounded-lg bg-white border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Image className="h-5 w-5 text-emerald-600" />
          Маркетинговые материалы
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Используйте эти материалы для продвижения Orbo среди ваших контактов и аудитории.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 p-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Image className="h-6 w-6 text-emerald-600" />
            </div>
            <h4 className="text-sm font-medium text-gray-900">Баннеры</h4>
            <p className="mt-1 text-xs text-gray-500">Скоро будут доступны</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <LinkIcon className="h-6 w-6 text-emerald-600" />
            </div>
            <h4 className="text-sm font-medium text-gray-900">Презентация</h4>
            <p className="mt-1 text-xs text-gray-500">Скоро будет доступна</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Video className="h-6 w-6 text-emerald-600" />
            </div>
            <h4 className="text-sm font-medium text-gray-900">Обучающее видео</h4>
            <p className="mt-1 text-xs text-gray-500">Скоро будет доступно</p>
          </div>
        </div>
      </div>

      {/* Video placeholder */}
      <div className="rounded-lg bg-white border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Video className="h-5 w-5 text-emerald-600" />
          Обучение
        </h3>
        <div className="aspect-video rounded-lg bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <Video className="h-12 w-12 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Обучающие видеоматериалы скоро появятся здесь</p>
          </div>
        </div>
      </div>
    </div>
  )
}
