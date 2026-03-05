'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import HeroSection from './hero-section'
import UpcomingEventsSection from './upcoming-events-section'
import RecentMembersSection from './recent-members-section'
import RecentMaterialsSection from './recent-materials-section'
import AppsSection from './apps-section'
import WelcomeBlock from './welcome-block'
import { useAdminMode } from '@/lib/hooks/useAdminMode'
import type { HomePageData } from '@/lib/server/getHomePageData'

interface Props {
  orgId: string
  role: 'owner' | 'admin' | 'member' | 'guest'
}

function HiddenBadge() {
  return (
    <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-neutral-100 border border-neutral-300 rounded text-xs text-neutral-500">
      Скрыто от участников
    </div>
  )
}

function MaybeHidden({
  hidden,
  children,
}: {
  hidden: boolean
  children: React.ReactNode
}) {
  if (!hidden) return <>{children}</>
  return (
    <div className="relative opacity-70 ring-1 ring-dashed ring-neutral-300 rounded-xl">
      <HiddenBadge />
      {children}
    </div>
  )
}

export default function AuthenticatedHome({ orgId, role }: Props) {
  const { adminMode, isAdmin } = useAdminMode(role)
  const router = useRouter()
  const [data, setData] = useState<HomePageData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchHomePageData()
  }, [orgId])

  const fetchHomePageData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`/api/organizations/${orgId}/home`)

      if (!response.ok) {
        if (response.status === 401) {
          router.push(`/p/${orgId}/auth`)
          return
        }
        throw new Error('Failed to load home page')
      }

      const homeData = await response.json()
      setData(homeData)
    } catch (err: any) {
      console.error('[AuthenticatedHome] Error:', err)
      setError(err.message || 'Не удалось загрузить данные')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-sm text-neutral-500">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-neutral-900 mb-2">
            Не удалось загрузить страницу
          </h1>
          <p className="text-sm text-neutral-500 mb-4">
            {error || 'Проверьте ваше подключение'}
          </p>
          <button
            onClick={fetchHomePageData}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    )
  }

  const showAdminFeatures = isAdmin && adminMode
  const ps = data.portalSettings

  const showEvents = showAdminFeatures || ps.show_events
  const showMembers = showAdminFeatures || ps.show_members
  const showMaterials = showAdminFeatures || ps.show_materials
  const showApps = showAdminFeatures || ps.show_apps

  return (
    <div className="min-h-screen bg-white pb-16">
      <HeroSection
        orgName={data.organization.name}
        orgLogo={data.organization.logo_url}
        publicDescription={data.organization.public_description}
        coverUrl={data.organization.portal_cover_url}
      />

      <div className="space-y-8 mt-6">
        {/* Приветственный блок */}
        {ps.welcome_html && <WelcomeBlock html={ps.welcome_html} />}

        {/* События */}
        {showEvents && (
          <MaybeHidden hidden={showAdminFeatures && !ps.show_events}>
            <UpcomingEventsSection events={data.upcomingEvents} orgId={orgId} />
          </MaybeHidden>
        )}

        {/* Участники */}
        {showMembers && (
          <MaybeHidden hidden={showAdminFeatures && !ps.show_members}>
            <RecentMembersSection members={data.recentMembers} orgId={orgId} />
          </MaybeHidden>
        )}

        {/* Материалы */}
        {showMaterials && (
          <MaybeHidden hidden={showAdminFeatures && !ps.show_materials}>
            <RecentMaterialsSection materials={data.recentMaterials} orgId={orgId} />
          </MaybeHidden>
        )}

        {/* Приложения */}
        {showApps && (
          <MaybeHidden hidden={showAdminFeatures && !ps.show_apps}>
            <AppsSection apps={data.recentApps} orgId={orgId} />
          </MaybeHidden>
        )}
      </div>
    </div>
  )
}
