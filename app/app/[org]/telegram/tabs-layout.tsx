'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

interface TabsLayoutProps {
  orgId: string
  children: React.ReactNode
}

export default function TabsLayout({ orgId, children }: TabsLayoutProps) {
  const pathname = usePathname()
  
  const tabs = [
    {
      name: 'Настройки',
      href: `/app/${orgId}/telegram`,
      isActive: pathname === `/app/${orgId}/telegram`
    },
    // ✅ Вкладка "Группы" убрана - избыточна (только перенаправляла в "Доступные группы")
    {
      name: 'Аналитика',
      href: `/app/${orgId}/telegram/analytics`,
      isActive: pathname === `/app/${orgId}/telegram/analytics`
    }
  ]
  
  return (
    <div>
      <div className="border-b border-neutral-200 mb-6">
        <nav className="flex gap-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              href={tab.href}
              className={clsx(
                'border-b-2 py-4 px-1 text-sm font-medium',
                tab.isActive
                  ? 'border-black text-black'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              )}
            >
              {tab.name}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  )
}

