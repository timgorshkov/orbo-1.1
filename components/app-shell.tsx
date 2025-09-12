import Link from 'next/link'
import { ReactNode } from 'react'
import clsx from 'clsx'

type NavItem = {
  href: string;
  label: string;
  icon?: string;
}

export default function AppShell({ 
  orgId, 
  children,
  currentPath
}: { 
  orgId: string; 
  children: ReactNode;
  currentPath?: string;
}) {
  const nav: NavItem[] = [
    { href: `/app/${orgId}/dashboard`, label: 'Дашборд', icon: '🏠' },
    { href: `/app/${orgId}/telegram`, label: 'Telegram', icon: '💬' },
    { href: `/app/${orgId}/members`, label: 'Участники', icon: '👥' },
    { href: `/app/${orgId}/materials`, label: 'Материалы', icon: '📁' },
    { href: `/app/${orgId}/events`, label: 'События', icon: '📅' },
  ]
  
  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="w-64 shrink-0 border-r bg-white/70 backdrop-blur fixed h-screen">
        <div className="p-4 font-semibold">
          <div className="h-8 flex items-center">Orbo</div>
        </div>
        <nav className="px-2 space-y-1 mt-6">
          {nav.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center px-3 py-2 text-sm rounded-xl",
                currentPath === item.href
                  ? "bg-black text-white"
                  : "hover:bg-black/5"
              )}
            >
              {item.icon && <span className="mr-2">{item.icon}</span>}
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 ml-64">
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
