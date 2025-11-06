import { ReactNode } from 'react'
import { Shield, Users, Building2, MessageSquare, UserCog, Send, DollarSign } from 'lucide-react'
import Link from 'next/link'
import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createClientServer } from '@/lib/server/supabaseServer'

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
  
  const supabase = await createClientServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  const navItems = [
    { href: '/superadmin/organizations', label: 'Организации', icon: Building2 },
    { href: '/superadmin/groups', label: 'Группы', icon: MessageSquare },
    { href: '/superadmin/users', label: 'Пользователи', icon: Users },
          { href: '/superadmin/telegram', label: 'Telegram', icon: Send },
          { href: '/superadmin/ai-costs', label: 'AI Расходы', icon: DollarSign },
    { href: '/superadmin/superadmins', label: 'Суперадмины', icon: UserCog }
  ]
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8" />
              <div>
                <h1 className="text-2xl font-bold">Superadmin</h1>
                <p className="text-sm text-purple-200">Техническая админка Orbo</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-medium">{user?.email}</div>
                <div className="text-xs text-purple-200">Суперадмин</div>
              </div>
              <Link
                href="/"
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition"
              >
                Выход в основное приложение
              </Link>
            </div>
          </div>
        </div>
      </header>
      
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-6">
          <div className="flex gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:text-purple-600 hover:bg-purple-50 border-b-2 border-transparent hover:border-purple-600 transition"
                >
                  <Icon className="h-4 w-4" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              )
            })}
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

