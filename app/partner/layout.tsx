import { ReactNode } from 'react'
import { Handshake } from 'lucide-react'
import Link from 'next/link'
import { requirePartner } from '@/lib/server/partnerGuard'

export const metadata = {
  title: 'Партнёрский кабинет | Orbo',
  description: 'Партнёрская программа Orbo'
}

export default async function PartnerLayout({
  children
}: {
  children: ReactNode
}) {
  const partner = await requirePartner()

  const navItems = [
    { href: '/partner/overview', label: 'Обзор' },
    { href: '/partner/referrals', label: 'Рефералы' },
    { href: '/partner/billing', label: 'Биллинг' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Handshake className="h-6 w-6" />
              <h1 className="text-lg font-bold">Партнёрский кабинет</h1>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs text-emerald-200">{partner.name} ({partner.code})</span>
              <Link
                href="/orgs"
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition"
              >
                К пространствам
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-6">
          <div className="flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-4 py-2.5 text-sm text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 border-b-2 border-transparent hover:border-emerald-600 transition font-medium"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="container mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
