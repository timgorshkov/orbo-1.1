'use client'
import Link from 'next/link'
import { ReactNode, useEffect, useState } from 'react'
import clsx from 'clsx'
import TelegramGroupsNav from './telegram-groups-nav'
import OrganizationSwitcher from './organization-switcher'

type NavItem = {
  href: string;
  label: string;
  icon?: string;
}

export default function AppShell({ 
  orgId, 
  children,
  currentPath,
  telegramGroups = [],
  orgName = ''
}: { 
  orgId: string; 
  children: ReactNode;
  currentPath?: string;
  telegramGroups?: any[];
  orgName?: string;
}) {
  const [groups, setGroups] = useState(telegramGroups);
  
  useEffect(() => {
    // Если группы уже переданы, не нужно загружать
    if (telegramGroups && telegramGroups.length > 0) {
      setGroups(telegramGroups);
      return;
    }
    
    // Загружаем группы для клиентских компонентов
    async function loadGroups() {
      try {
        const res = await fetch(`/api/telegram/groups/${orgId}`);
        const data = await res.json();
        if (data.groups) {
          setGroups(data.groups);
        }
      } catch (error) {
        console.error('Failed to load telegram groups:', error);
      }
    }
    
    loadGroups();
  }, [orgId, telegramGroups]);

  const nav: NavItem[] = [
    { href: `/app/${orgId}/dashboard`, label: 'Дашборд', icon: '🏠' },
    { href: `/app/${orgId}/events`, label: 'События', icon: '📅' },
    { href: `/app/${orgId}/telegram`, label: 'Telegram', icon: '💬' },
    { href: `/app/${orgId}/telegram/analytics`, label: 'Аналитика', icon: '📊' },
    { href: `/app/${orgId}/members`, label: 'Участники', icon: '👥' },
    { href: `/app/${orgId}/materials`, label: 'Материалы', icon: '📁' },
  ]
  
  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="w-64 shrink-0 border-r bg-white/70 backdrop-blur fixed h-screen">
        <div className="p-4">
          <div className="h-8 flex items-center">
            <OrganizationSwitcher currentOrgId={orgId} currentOrgName={orgName} />
          </div>
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
          
          {/* Телеграм группы */}
          <TelegramGroupsNav 
            groups={groups} 
            orgId={orgId} 
            currentPath={currentPath} 
          />
        </nav>
      </aside>
      <div className="flex-1 ml-64">
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
