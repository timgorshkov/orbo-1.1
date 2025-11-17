'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '../ui/button'
import MembersView from './members-view'
import InvitesManager from '../settings/invites-manager'
import { useAdminMode } from '@/lib/hooks/useAdminMode'

interface Participant {
  id: string
  full_name: string | null
  tg_username: string | null
  tg_user_id: string | null
  email: string | null
  bio: string | null
  custom_attributes: any
  participant_status: string
  photo_url: string | null
}

interface MembersTabsProps {
  orgId: string
  initialParticipants: Participant[]
  initialInvites: any[]
  availableTags?: any[]
  role: 'owner' | 'admin' | 'member' | 'guest'
  activeTab: string
}

export default function MembersTabs({
  orgId,
  initialParticipants,
  initialInvites,
  availableTags = [],
  role,
  activeTab: initialTab,
}: MembersTabsProps) {
  const router = useRouter()
  const { adminMode, isAdmin } = useAdminMode(role)
  const [activeTab, setActiveTab] = useState(initialTab)
  
  // Show admin features only if user is admin AND in admin mode
  const showAdminFeatures = isAdmin && adminMode

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    router.push(`/p/${orgId}/members?tab=${tab}`, { scroll: false })
  }

  return (
    <div>
      {/* Tabs */}
      <div className="mb-6">
        <div className="flex gap-6 border-b border-gray-200">
          <button
            onClick={() => handleTabChange('list')}
            className={`pb-3 text-sm font-medium transition-colors relative focus-visible:outline-none ${
              activeTab === 'list'
                ? 'text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Список
            {activeTab === 'list' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900" />
            )}
          </button>

          {showAdminFeatures && (
            <button
              onClick={() => handleTabChange('invites')}
              className={`pb-3 text-sm font-medium transition-colors relative focus-visible:outline-none ${
                activeTab === 'invites'
                  ? 'text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Приглашения
              {activeTab === 'invites' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'list' && (
        <MembersView
          orgId={orgId}
          initialParticipants={initialParticipants}
          availableTags={availableTags}
          isAdmin={isAdmin}
          adminMode={adminMode}
        />
      )}

      {activeTab === 'invites' && showAdminFeatures && (
        <InvitesManager orgId={orgId} initialInvites={initialInvites} />
      )}
    </div>
  )
}

