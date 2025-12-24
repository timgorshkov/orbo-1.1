'use client'
import Link from 'next/link'
import { ReactNode, useEffect, useState } from 'react'
import clsx from 'clsx'
import TelegramGroupsNav from './telegram-groups-nav'
import WhatsAppGroupsNav from './whatsapp-groups-nav'
import OrganizationSwitcher from './organization-switcher'

type NavItem = {
  href: string;
  label: string;
  icon?: string;
}

interface WhatsAppGroup {
  id: string;
  group_name: string | null;
  messages_imported: number;
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
  const [whatsappGroups, setWhatsappGroups] = useState<WhatsAppGroup[]>([]);
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

    async function loadWhatsAppGroups() {
      try {
        const res = await fetch(`/api/whatsapp/menu-groups?orgId=${orgId}`);
        if (!isMounted) return;
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setWhatsappGroups(data.groups || []);
          }
        }
      } catch (error) {
        if (isMounted) {
          console.error('Failed to load WhatsApp groups:', error);
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

    // Load WhatsApp groups
    loadWhatsAppGroups();

    return () => {
      isMounted = false;
    };
  }, [orgId, telegramGroups, orgName]);

  const nav: NavItem[] = [
    { href: `/p/${orgId}/dashboard`, label: 'Дашборд', icon: '🏠' },
    { href: `/p/${orgId}/events`, label: 'События', icon: '📅' },
    { href: `/p/${orgId}/members`, label: 'Участники', icon: '👥' },
    { href: `/p/${orgId}/materials`, label: 'Материалы', icon: '📁' },
    { href: `/p/${orgId}/integrations`, label: 'Интеграции', icon: '🔗' },
  ]
  
  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="w-64 shrink-0 border-r bg-white/70 backdrop-blur fixed h-screen">
        <div className="p-4">
          <div className="h-8 flex items-center">
            <OrganizationSwitcher currentOrgId={orgId} currentOrgName={orgDisplayName || orgName || ''} />
          </div>
        </div>
        <nav className="px-2 space-y-1 mt-6 flex flex-col h-[calc(100vh-5rem)]">
          <div className="flex-1">
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
            
            {/* WhatsApp группы (если включены в меню) */}
            <WhatsAppGroupsNav
              groups={whatsappGroups}
              orgId={orgId}
              currentPath={currentPath}
            />
          </div>
          
          {/* Настройки внизу */}
          <div className="border-t pt-2 pb-2">
            <Link
              href={`/p/${orgId}/settings`}
              className={clsx(
                "flex items-center px-3 py-2 text-sm rounded-xl",
                currentPath === `/p/${orgId}/settings`
                  ? "bg-black text-white"
                  : "hover:bg-black/5"
              )}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="w-4 h-4 mr-2"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              Настройки
            </Link>
          </div>
        </nav>
      </aside>
      <div className="flex-1 ml-64">
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
