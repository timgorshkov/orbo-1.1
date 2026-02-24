import { ReactNode } from 'react'
import { Shield } from 'lucide-react'
import Link from 'next/link'
import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export const metadata = {
  title: 'Superadmin | Orbo',
  description: 'Техническая админка платформы Orbo'
}

export default async function SuperadminLayout({
  children
}: {
  children: ReactNode
}) {
  await requireSuperadmin()
  
  const user = await getUnifiedUser()
  
  const navItems = [
    { href: '/superadmin/organizations', label: 'Организации' },
    { href: '/superadmin/users', label: 'Пользователи' },
    { href: '/superadmin/public-apps', label: 'Каталог' },
    { href: '/superadmin/telegram', label: 'Telegram' },
    { href: '/superadmin/errors', label: 'Errors' },
    { href: '/superadmin/audit-log', label: 'Audit' },
    { href: '/superadmin/billing', label: 'Биллинг' },
    { href: '/superadmin/ai-costs', label: 'AI' },
    { href: '/superadmin/onboarding', label: 'Онбординг' },
    { href: '/superadmin/qualification', label: 'Квалификация' },
    { href: '/superadmin/superadmins', label: 'Суперадмины' },
  ]
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6" />
              <h1 className="text-lg font-bold">Superadmin</h1>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-xs text-purple-200">{user?.email}</span>
              <Link
                href="/"
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition"
              >
                Выход
              </Link>
            </div>
          </div>
        </div>
      </header>
      
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-6">
          <div className="flex flex-wrap">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-2 text-xs text-gray-600 hover:text-purple-600 hover:bg-purple-50 border-b-2 border-transparent hover:border-purple-600 transition font-medium"
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

