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
  
  // Determine which tab is active based on pathname
  const isWhatsAppActive = pathname.startsWith(`/p/${orgId}/telegram/whatsapp`)
  const isMaxActive = pathname.startsWith(`/p/${orgId}/telegram/max`)
  // Telegram is active if not WhatsApp and not Max
  const isTelegramActive = !isWhatsAppActive && !isMaxActive
  
  const tabs = [
    {
      name: 'Telegram',
      href: `/p/${orgId}/telegram`,
      isActive: isTelegramActive
    },
    {
      name: 'WhatsApp',
      href: `/p/${orgId}/telegram/whatsapp`,
      isActive: isWhatsAppActive
    },
    {
      name: 'Max',
      href: `/p/${orgId}/telegram/max`,
      isActive: isMaxActive
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

