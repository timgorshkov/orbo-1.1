'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '../ui/button'
import { Archive, RotateCcw, User, Loader2 } from 'lucide-react'
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
  
  // Archive tab state
  const [archivedParticipants, setArchivedParticipants] = useState<Participant[]>([])
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveLoaded, setArchiveLoaded] = useState(false)
  
  // Show admin features only if user is admin AND in admin mode
  const showAdminFeatures = isAdmin && adminMode

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    router.push(`/p/${orgId}/members?tab=${tab}`, { scroll: false })
  }

  // Load archived participants when archive tab is selected
  useEffect(() => {
    if (activeTab === 'archive' && !archiveLoaded && showAdminFeatures) {
      loadArchivedParticipants()
    }
  }, [activeTab, archiveLoaded, showAdminFeatures])

  const loadArchivedParticipants = async () => {
    setArchiveLoading(true)
    try {
      const response = await fetch(`/api/participants/archived?orgId=${orgId}`)
      if (response.ok) {
        const data = await response.json()
        setArchivedParticipants(data.participants || [])
        setArchiveLoaded(true)
      }
    } catch (error) {
      console.error('Error loading archived participants:', error)
    } finally {
      setArchiveLoading(false)
    }
  }

  const handleRestore = async (participantId: string) => {
    try {
      const response = await fetch(`/api/participants/${participantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, action: 'restore' })
      })

      if (response.ok) {
        // Remove from archived list
        setArchivedParticipants(prev => prev.filter(p => p.id !== participantId))
      }
    } catch (error) {
      console.error('Error restoring participant:', error)
    }
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
            <>
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

              <button
                onClick={() => handleTabChange('archive')}
                className={`pb-3 text-sm font-medium transition-colors relative focus-visible:outline-none flex items-center gap-1.5 ${
                  activeTab === 'archive'
                    ? 'text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Archive className="h-4 w-4" />
                Архив
                {activeTab === 'archive' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900" />
                )}
              </button>
            </>
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

      {activeTab === 'archive' && showAdminFeatures && (
        <div className="space-y-4">
          {archiveLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : archivedParticipants.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Archive className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Архив пуст</p>
              <p className="text-sm mt-1">Архивированные участники появятся здесь</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {archivedParticipants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4"
                >
                  {participant.photo_url ? (
                    <img
                      src={participant.photo_url}
                      alt={participant.full_name || 'User'}
                      className="h-12 w-12 rounded-full object-cover grayscale"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200">
                      <User className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {participant.full_name || 'Без имени'}
                    </p>
                    {participant.tg_username && (
                      <p className="text-sm text-gray-500 truncate">
                        @{participant.tg_username}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(participant.id)}
                    className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Восстановить
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

