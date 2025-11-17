'use client'

import { useState, useMemo } from 'react'
import { Search, LayoutGrid, Table as TableIcon } from 'lucide-react'
import { Button } from '../ui/button'
import MemberCard from './member-card'
import MembersTable from './members-table'
import MembersFiltersSidebar, { type MembersFilters } from './members-filters-sidebar'
import BulkActionsBar from './bulk-actions-bar'

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
  created_at?: string
  last_activity_at?: string | null
  username?: string | null // Telegram username
  activity_score?: number
  is_org_owner?: boolean
  is_admin?: boolean
  source?: string | null
  tags?: Array<{
    id: string
    name: string
    color: string
  }>
}

interface Tag {
  tag_id: string
  tag_name: string
  tag_color: string
  participant_count: number
}

interface MembersViewProps {
  orgId: string
  initialParticipants: Participant[]
  availableTags?: Tag[]
  isAdmin: boolean
  adminMode: boolean
}

type ViewMode = 'cards' | 'table'

export default function MembersView({
  orgId,
  initialParticipants,
  availableTags = [],
  isAdmin,
  adminMode,
}: MembersViewProps) {
  const [participants] = useState<Participant[]>(initialParticipants)
  const [searchQuery, setSearchQuery] = useState('')
  // Default view mode: table for admins, cards for others
  const [viewMode, setViewMode] = useState<ViewMode>(isAdmin ? 'table' : 'cards')
  
  // Filters state
  const [filters, setFilters] = useState<MembersFilters>({
    roles: [],
    tags: [],
    autoCategories: [],
    sources: [],
    activityPeriod: null,
  })

  // Bulk selection state
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set())

  const toggleParticipantSelection = (participantId: string) => {
    setSelectedParticipants((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(participantId)) {
        newSet.delete(participantId)
      } else {
        newSet.add(participantId)
      }
      return newSet
    })
  }

  const toggleAllParticipants = () => {
    if (selectedParticipants.size === filteredParticipants.length) {
      setSelectedParticipants(new Set())
    } else {
      setSelectedParticipants(new Set(filteredParticipants.map((p) => p.id)))
    }
  }

  const clearSelection = () => {
    setSelectedParticipants(new Set())
  }

  // Bulk actions handlers
  const handleAssignTags = async (tagIds: string[]) => {
    try {
      const selectedIds = Array.from(selectedParticipants)
      const promises = selectedIds.map(async (participantId) => {
        for (const tagId of tagIds) {
          await fetch(`/api/participants/${participantId}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tagIds: [tagId] }),
          })
        }
      })
      await Promise.all(promises)
      alert(`Теги назначены для ${selectedIds.length} участников`)
      // Reload page to show updated tags
      window.location.reload()
    } catch (error) {
      console.error('Error assigning tags:', error)
      alert('Ошибка при назначении тегов')
    }
  }

  const handleRemoveTags = async (tagIds: string[]) => {
    try {
      const selectedIds = Array.from(selectedParticipants)
      const promises = selectedIds.flatMap((participantId) =>
        tagIds.map((tagId) =>
          fetch(`/api/participants/${participantId}/tags/${tagId}`, {
            method: 'DELETE',
          })
        )
      )
      await Promise.all(promises)
      alert(`Теги удалены у ${selectedIds.length} участников`)
      // Reload page to show updated tags
      window.location.reload()
    } catch (error) {
      console.error('Error removing tags:', error)
      alert('Ошибка при удалении тегов')
    }
  }

  const handleExportSelected = () => {
    const selectedData = filteredParticipants.filter((p) =>
      selectedParticipants.has(p.id)
    )

    // Create CSV
    const headers = ['ID', 'Имя', 'Username', 'Email', 'Роль', 'Теги', 'Дата создания', 'Последняя активность']
    const rows = selectedData.map((p) => [
      p.id,
      p.full_name || '',
      p.tg_username || p.username || '',
      p.email || '',
      p.is_org_owner ? 'Владелец' : p.is_admin ? 'Администратор' : 'Участник',
      p.tags?.map((t) => t.name).join('; ') || '',
      p.created_at || '',
      p.last_activity_at || '',
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `participants_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
  
  // Show admin features only if user is admin AND in admin mode
  const showAdminFeatures = isAdmin && adminMode

  // Фильтрация участников по поисковому запросу и фильтрам
  const filteredParticipants = useMemo(() => {
    let result = participants

    // Search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter((p) => {
        const fullName = (p.full_name || '').toLowerCase()
        const username = (p.tg_username || '').toLowerCase()
        const email = (p.email || '').toLowerCase()
        const bio = (p.bio || '').toLowerCase()

        return (
          fullName.includes(query) ||
          username.includes(query) ||
          email.includes(query) ||
          bio.includes(query)
        )
      })
    }

    // Role filter
    if (filters.roles.length > 0) {
      result = result.filter((p) => {
        if (filters.roles.includes('owner') && p.is_org_owner) return true
        if (filters.roles.includes('admin') && p.is_admin && !p.is_org_owner) return true
        if (filters.roles.includes('member') && !p.is_admin && !p.is_org_owner) return true
        return false
      })
    }

    // Tag filter
    if (filters.tags.length > 0) {
      result = result.filter((p) => {
        const participantTagIds = p.tags?.map((t) => t.id) || []
        return filters.tags.some((tagId) => participantTagIds.includes(tagId))
      })
    }

    // Auto-category filter
    if (filters.autoCategories.length > 0 && !filters.autoCategories.includes('all')) {
      result = result.filter((p) => {
        const now = new Date()
        const createdAt = p.created_at ? new Date(p.created_at) : null
        const lastActivity = p.last_activity_at ? new Date(p.last_activity_at) : null
        const daysSinceCreated = createdAt ? (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24) : 999
        const daysSinceActivity = lastActivity ? (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24) : 999
        const activityScore = p.activity_score || 0

        // Priority 1: Silent
        if (daysSinceActivity > 30 && filters.autoCategories.includes('silent')) {
          return true
        }

        // Priority 2: Newcomers
        if (daysSinceCreated < 30 && filters.autoCategories.includes('newcomer')) {
          return true
        }

        // Priority 3 & 4: Core/Experienced
        if (activityScore >= 60 && filters.autoCategories.includes('core')) {
          return true
        }
        if (activityScore >= 30 && activityScore < 60 && filters.autoCategories.includes('experienced')) {
          return true
        }

        return false
      })
    }

    // Activity period filter
    if (filters.activityPeriod) {
      result = result.filter((p) => {
        if (!p.last_activity_at && filters.activityPeriod === 'never') return true
        if (!p.last_activity_at) return false

        const now = new Date()
        const lastActivity = new Date(p.last_activity_at)
        const daysSince = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)

        switch (filters.activityPeriod) {
          case 'today':
            return daysSince < 1
          case 'week':
            return daysSince < 7
          case 'month':
            return daysSince < 30
          case 'old':
            return daysSince >= 30
          case 'never':
            return false
          default:
            return true
        }
      })
    }

    return result
  }, [participants, searchQuery, filters])

  return (
    <div className="flex gap-6">
      {/* Filters Sidebar (Admin only) */}
      {isAdmin && (
        <MembersFiltersSidebar
          participants={participants}
          availableTags={availableTags}
          filters={filters}
          onFiltersChange={setFilters}
          isAdmin={isAdmin}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Поиск и переключатель видов */}
        <div className="mb-6 flex items-center justify-between gap-4">
          {/* Поиск */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по имени, описанию, email, @username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Переключатель видов */}
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'cards' ? 'default' : 'outline'}
              size={'sm' as const}
              onClick={() => setViewMode('cards')}
              className="gap-2"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Карточки</span>
            </Button>
            
            {isAdmin && (
              <Button
                variant={viewMode === 'table' ? 'default' : 'outline'}
                size={'sm' as const}
                onClick={() => setViewMode('table')}
                className="gap-2"
              >
                <TableIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Таблица</span>
              </Button>
            )}
          </div>
        </div>

      {/* Счетчик */}
      <div className="mb-4 text-sm text-gray-600">
        {filteredParticipants.length}{' '}
        {filteredParticipants.length === 1
          ? 'участник'
          : filteredParticipants.length < 5
          ? 'участника'
          : 'участников'}
      </div>

      {/* Контент */}
      {filteredParticipants.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300">
          <div className="text-center">
            <p className="text-lg font-medium text-gray-900">
              {searchQuery ? 'Участники не найдены' : 'Пока нет участников'}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery
                ? 'Попробуйте изменить поисковый запрос'
                : 'Участники появятся после подключения Telegram-групп'}
            </p>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        <MembersTable
          participants={filteredParticipants}
          selectedParticipants={selectedParticipants}
          onToggleParticipant={toggleParticipantSelection}
          onToggleAll={toggleAllParticipants}
          showBulkActions={isAdmin && adminMode}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredParticipants.map((participant) => (
            <MemberCard key={participant.id} participant={participant} />
          ))}
        </div>
      )}

      {/* Bulk Actions Bar */}
      {isAdmin && adminMode && selectedParticipants.size > 0 && (
        <BulkActionsBar
          selectedCount={selectedParticipants.size}
          availableTags={availableTags.map((t) => ({
            id: t.tag_id,
            name: t.tag_name,
            color: t.tag_color,
          }))}
          onClearSelection={clearSelection}
          onAssignTags={handleAssignTags}
          onRemoveTags={handleRemoveTags}
          onExportSelected={handleExportSelected}
        />
      )}
      </div>
    </div>
  )
}

