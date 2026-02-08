'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import HeroSection from './hero-section'
import UpcomingEventsSection from './upcoming-events-section'
import QuickLinksSection from './quick-links-section'
import RecentMembersSection from './recent-members-section'
import type { HomePageData } from '@/lib/server/getHomePageData'

interface Props {
  orgId: string
  isAdmin: boolean
}

export default function AuthenticatedHome({ orgId, isAdmin }: Props) {
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Не удалось загрузить страницу
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {error || 'Проверьте ваше подключение'}
          </p>
          <button
            onClick={fetchHomePageData}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-12">
      <HeroSection
        orgName={data.organization.name}
        orgLogo={data.organization.logo_url}
        publicDescription={data.organization.public_description}
      />

      <div className="py-8">
        <UpcomingEventsSection
          events={data.upcomingEvents}
          orgId={orgId}
        />

        {isAdmin && (
          <QuickLinksSection
            orgId={orgId}
            isAdmin={isAdmin}
          />
        )}

        <RecentMembersSection
          members={data.recentMembers}
          orgId={orgId}
        />
      </div>
    </div>
  )
}

