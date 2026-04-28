'use client'

import { useState, useEffect, lazy, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '../ui/button'
import { Archive, RotateCcw, User, Loader2, Crown, AlertTriangle, Trash2 } from 'lucide-react'
import MembersView from './members-view'
import InvitesManager from '../settings/invites-manager'
import { useAdminMode } from '@/lib/hooks/useAdminMode'

interface BulkPreviewItem {
  id: string
  full_name: string | null
  username: string | null
  tg_user_id: number | null
  source: string | null
  created_at: string | null
}

const MembershipPageContent = lazy(() =>
  import('@/components/memberships/membership-page-content').then(m => ({ default: m.MembershipPageContent }))
)

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
  totalParticipantCount?: number
  initialInvites: any[]
  availableTags?: any[]
  role: 'owner' | 'admin' | 'member' | 'guest'
  activeTab: string
  orgPlan?: string
  hasTelegramAccount?: boolean
}

export default function MembersTabs({
  orgId,
  initialParticipants,
  totalParticipantCount,
  initialInvites,
  availableTags = [],
  role,
  activeTab: initialTab,
  orgPlan,
  hasTelegramAccount = false,
}: MembersTabsProps) {
  const router = useRouter()
  const { adminMode, isAdmin } = useAdminMode(role)
  const [activeTab, setActiveTab] = useState(initialTab)
  const isClubPlan = orgPlan === 'enterprise' || orgPlan === 'promo'
  const showMembershipTab = isAdmin && adminMode && !isClubPlan
  
  // Archive tab state
  const [archivedParticipants, setArchivedParticipants] = useState<Participant[]>([])
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveLoaded, setArchiveLoaded] = useState(false)

  // Bulk-archive dialog state
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkPreview, setBulkPreview] = useState<{ totalCandidates: number; preview: BulkPreviewItem[] } | null>(null)
  const [bulkResultCount, setBulkResultCount] = useState<number | null>(null)
  
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

  const openBulkDialog = async () => {
    setBulkOpen(true)
    setBulkError(null)
    setBulkPreview(null)
    setBulkResultCount(null)
    setBulkLoading(true)
    try {
      const response = await fetch('/api/participants/bulk-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, mode: 'not_in_any_active_group', dryRun: true }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Не удалось получить предпросмотр')
      setBulkPreview({ totalCandidates: data.totalCandidates || 0, preview: data.preview || [] })
    } catch (e: any) {
      setBulkError(e?.message || 'Ошибка предпросмотра')
    } finally {
      setBulkLoading(false)
    }
  }

  const closeBulkDialog = () => {
    if (bulkSubmitting) return
    setBulkOpen(false)
    // keep result count briefly visible if user reopens immediately — clears next open
  }

  const confirmBulkArchive = async () => {
    setBulkSubmitting(true)
    setBulkError(null)
    try {
      const response = await fetch('/api/participants/bulk-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, mode: 'not_in_any_active_group' }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Не удалось архивировать')
      setBulkResultCount(data.archived || 0)
      // Reload archive list — newly archived participants should appear in it
      setArchiveLoaded(false)
      await loadArchivedParticipants()
    } catch (e: any) {
      setBulkError(e?.message || 'Ошибка архивации')
    } finally {
      setBulkSubmitting(false)
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

              {showMembershipTab && (
                <button
                  onClick={() => handleTabChange('membership')}
                  className={`pb-3 text-sm font-medium transition-colors relative focus-visible:outline-none flex items-center gap-1.5 ${
                    activeTab === 'membership'
                      ? 'text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Crown className="h-4 w-4" />
                  Членство
                  {activeTab === 'membership' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900" />
                  )}
                </button>
              )}

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
          totalParticipantCount={totalParticipantCount}
          availableTags={availableTags}
          isAdmin={isAdmin}
          adminMode={adminMode}
          hasTelegramAccount={hasTelegramAccount}
          onGoToInvites={() => handleTabChange('invites')}
        />
      )}

      {activeTab === 'invites' && showAdminFeatures && (
        <InvitesManager orgId={orgId} initialInvites={initialInvites} />
      )}

      {activeTab === 'membership' && showMembershipTab && (
        <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>}>
          <MembershipPageContent orgId={orgId} embedded />
        </Suspense>
      )}

      {activeTab === 'archive' && showAdminFeatures && (
        <div className="space-y-4">
          {/* Toolbar: bulk-archive entry point */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div className="text-sm text-gray-500">
              Здесь видны архивированные участники. Архив — мягкая операция, участников можно восстановить.
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={openBulkDialog}
              className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <Trash2 className="h-4 w-4" />
              Архивировать неактивных
            </Button>
          </div>

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

      {/* Bulk-archive confirmation dialog */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeBulkDialog}>
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Архивировать неактивных</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Будут заархивированы участники, которые одновременно:
                </p>
                <ul className="text-sm text-gray-600 mt-2 list-disc pl-5 space-y-1">
                  <li>не состоят ни в одной из подключённых Telegram-групп этой организации;</li>
                  <li>не имеют активных регистраций на события;</li>
                  <li>не имеют активного членства.</li>
                </ul>
                <p className="text-xs text-gray-500 mt-2">
                  Архив — мягкая операция. Любого участника можно восстановить в этой же вкладке.
                </p>
              </div>
            </div>

            {bulkLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-500 gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Подсчёт кандидатов…
              </div>
            ) : bulkError ? (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {bulkError}
              </div>
            ) : bulkResultCount != null ? (
              <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                Архивировано участников: <strong>{bulkResultCount}</strong>. Они появились в этом списке ниже.
              </div>
            ) : bulkPreview ? (
              <>
                <div className="rounded-md bg-gray-50 border border-gray-200 p-3">
                  <div className="text-sm text-gray-700">
                    Будет архивировано: <strong>{bulkPreview.totalCandidates}</strong>{' '}
                    {bulkPreview.totalCandidates === 1 ? 'участник' : 'участников'}.
                  </div>
                </div>
                {bulkPreview.preview.length > 0 && (
                  <div className="max-h-60 overflow-y-auto rounded-md border border-gray-100 divide-y divide-gray-50">
                    {bulkPreview.preview.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-900 truncate block">
                            {p.full_name || (p.username ? `@${p.username}` : `id ${p.tg_user_id || '—'}`)}
                          </span>
                        </div>
                        <span className="text-gray-400 ml-2 shrink-0">{p.source || '—'}</span>
                      </div>
                    ))}
                    {bulkPreview.totalCandidates > bulkPreview.preview.length && (
                      <div className="px-3 py-1.5 text-xs text-gray-500 italic">
                        …и ещё {bulkPreview.totalCandidates - bulkPreview.preview.length}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeBulkDialog} disabled={bulkSubmitting}>
                {bulkResultCount != null ? 'Закрыть' : 'Отмена'}
              </Button>
              {bulkResultCount == null && (
                <Button
                  onClick={confirmBulkArchive}
                  disabled={bulkLoading || bulkSubmitting || !bulkPreview || bulkPreview.totalCandidates === 0}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {bulkSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Архивирую…
                    </span>
                  ) : (
                    'Архивировать'
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

