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
  telegramGroups,
  orgName
}: { 
  orgId: string; 
  children: ReactNode;
  currentPath?: string;
  telegramGroups?: any[];
  orgName?: string;
}) {
  const [groups, setGroups] = useState<any[]>(telegramGroups ?? []);
  const [orgDisplayName, setOrgDisplayName] = useState(orgName || '');

  useEffect(() => {
    setGroups(telegramGroups ?? []);
  }, [telegramGroups, orgId]);

  useEffect(() => {
    if (!orgDisplayName && orgName) {
      setOrgDisplayName(orgName);
    }
  }, [orgName, orgDisplayName]);

  useEffect(() => {
    let isMounted = true;

    async function loadGroups() {
      try {
        const timestamp = Date.now();
        const res = await fetch(`/api/telegram/groups/${orgId}?t=${timestamp}`);

        if (!isMounted) return;

        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setGroups(data.groups || []);
          }
          return;
        }

        const fallback = await fetch(`/api/telegram/groups/for-user?orgId=${orgId}&t=${timestamp}`);

        if (!isMounted) return;

        if (fallback.ok) {
          const data = await fallback.json();
          if (isMounted) {
            setGroups(data.groups || []);
          }
        }
      } catch (error) {
        if (isMounted) {
          console.error('Failed to load telegram groups:', error);
        }
      }
    }

    async function loadOrgName() {
      try {
        const res = await fetch(`/api/organizations/info?orgId=${orgId}`);
        if (!isMounted) return;
        if (res.ok) {
          const data = await res.json();
          setOrgDisplayName(data?.name || data?.title || '');
        }
      } catch (error) {
        if (isMounted) {
          console.error('Failed to load organization name:', error);
        }
      }
    }

    // Если телеграм-группы и название не передали, грузим
    if (!telegramGroups || telegramGroups.length === 0) {
      loadGroups();
    }

    if (orgDisplayName) {
      // already have name
    } else {
      loadOrgName();
    }

    return () => {
      isMounted = false;
    };
  }, [orgId, telegramGroups, orgName]);

  const nav: NavItem[] = [
    { href: `/app/${orgId}/dashboard`, label: 'Дашборд', icon: '🏠' },
    { href: `/app/${orgId}/events`, label: 'События', icon: '📅' },
    { href: `/app/${orgId}/telegram`, label: 'Telegram', icon: '💬' },
    { href: `/app/${orgId}/telegram/analytics`, label: 'Аналитика', icon: '📊' },
    { href: `/app/${orgId}/members`, label: 'Участники', icon: '👥' },
    { href: `/app/${orgId}/materials`, label: 'Материалы', icon: '📁' },
    { href: `/app/${orgId}/integrations`, label: 'Интеграции', icon: '🔗' },
  ]
  
  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="w-64 shrink-0 border-r bg-white/70 backdrop-blur fixed h-screen">
        <div className="p-4">
          <div className="h-8 flex items-center">
            <OrganizationSwitcher currentOrgId={orgId} currentOrgName={orgDisplayName || orgName || ''} />
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
