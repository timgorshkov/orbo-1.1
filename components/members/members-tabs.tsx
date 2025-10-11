'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '../ui/button'
import MembersView from './members-view'
import InvitesManager from '../settings/invites-manager'

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
  isAdmin: boolean
  activeTab: string
}

export default function MembersTabs({
  orgId,
  initialParticipants,
  initialInvites,
  isAdmin,
  activeTab: initialTab,
}: MembersTabsProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState(initialTab)

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    router.push(`/app/${orgId}/members?tab=${tab}`, { scroll: false })
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        <button
          onClick={() => handleTabChange('list')}
          className={`px-4 py-2 font-medium transition-colors relative ${
            activeTab === 'list'
              ? 'text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Список
          {activeTab === 'list' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>

        {isAdmin && (
          <button
            onClick={() => handleTabChange('invites')}
            className={`px-4 py-2 font-medium transition-colors relative ${
              activeTab === 'invites'
                ? 'text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Приглашения
            {activeTab === 'invites' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'list' && (
        <MembersView
          orgId={orgId}
          initialParticipants={initialParticipants}
          isAdmin={isAdmin}
        />
      )}

      {activeTab === 'invites' && isAdmin && (
        <InvitesManager orgId={orgId} initialInvites={initialInvites} />
      )}
    </div>
  )
}

