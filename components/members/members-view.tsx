'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Search, LayoutGrid, Table as TableIcon, Filter, Download, FileJson } from 'lucide-react'
import { Button } from '../ui/button'
import MemberCard from './member-card'
import MembersTable from './members-table'
import MembersFiltersSidebar, { type MembersFilters, getParticipantCategory } from './members-filters-sidebar'
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
  real_join_date?: string // Real join date from first message or created_at
  real_last_activity?: string | null // Real last activity from last message or last_activity_at
  first_message_at?: string | null // Date of first message ever
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
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Bulk selection state
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set())

  const activeFiltersCount =
    filters.roles.length +
    filters.tags.length +
    filters.autoCategories.length +
    filters.sources.length +
    (filters.activityPeriod ? 1 : 0)

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
      const promises = selectedIds.flatMap((participantId) =>
        tagIds.map((tagId) =>
          fetch(`/api/participants/${participantId}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag_id: tagId }),
          })
        )
      )
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

  const handleBulkArchive = async () => {
    try {
      const selectedIds = Array.from(selectedParticipants)
      const promises = selectedIds.map((participantId) =>
        fetch(`/api/participants/${participantId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            action: 'archive'
          })
        })
      )
      await Promise.all(promises)
      alert(`Архивировано ${selectedIds.length} участников`)
      window.location.reload()
    } catch (error) {
      console.error('Error archiving participants:', error)
      alert('Ошибка при архивации участников')
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
      p.real_last_activity || p.last_activity_at || '',
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `participants_selected_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleExportAll = (format: 'csv' | 'json') => {
    const exportData = filteredParticipants.map((p) => ({
      id: p.id,
      full_name: p.full_name || '',
      tg_username: p.tg_username || p.username || '',
      tg_user_id: p.tg_user_id || '',
      email: p.email || '',
      phone: '',
      bio: p.bio || '',
      role: p.is_org_owner ? 'owner' : p.is_admin ? 'admin' : 'member',
      tags: p.tags?.map((t) => t.name).join(', ') || '',
      created_at: p.created_at || '',
      real_join_date: p.real_join_date || '',
      last_activity_at: p.last_activity_at || '',
      real_last_activity: p.real_last_activity || '',
      activity_score: p.activity_score || 0,
      custom_attributes: p.custom_attributes || {},
    }))

    if (format === 'csv') {
      const headers = [
        'ID',
        'Имя',
        'Telegram Username',
        'Telegram ID',
        'Email',
        'Телефон',
        'Описание',
        'Роль',
        'Теги',
        'Дата создания (запись)',
        'Реальная дата присоединения',
        'Последняя активность (метаданные)',
        'Реальная последняя активность',
        'Оценка активности',
      ]
      const rows = exportData.map((p) => [
        p.id,
        p.full_name,
        p.tg_username,
        p.tg_user_id,
        p.email,
        p.phone,
        p.bio,
        p.role,
        p.tags,
        p.created_at,
        p.real_join_date,
        p.last_activity_at,
        p.real_last_activity,
        p.activity_score,
      ])

      const csvContent =
        'data:text/csv;charset=utf-8,\uFEFF' + // BOM for Excel UTF-8
        [headers.join(','), ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n')

      const encodedUri = encodeURI(csvContent)
      const link = document.createElement('a')
      link.setAttribute('href', encodedUri)
      link.setAttribute('download', `participants_full_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } else if (format === 'json') {
      const jsonContent = JSON.stringify(exportData, null, 2)
      const blob = new Blob([jsonContent], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', `participants_full_${new Date().toISOString().split('T')[0]}.json`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }
  }
  
  // Show admin features only if user is admin AND in admin mode
  const showAdminFeatures = isAdmin && adminMode

  // Background batch photo sync: fire once on mount for participants missing avatars
  const batchSyncFired = useRef(false)
  useEffect(() => {
    if (batchSyncFired.current) return
    batchSyncFired.current = true

    const needPhoto = initialParticipants
      .filter(p => p.tg_user_id && (!p.photo_url || !p.photo_url.includes('participant-photos')) && p.photo_url !== 'none')
      .map(p => p.id)

    if (needPhoto.length === 0) return

    fetch('/api/participants/batch-sync-photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, participantIds: needPhoto.slice(0, 100) }),
    }).catch(() => {})
  }, [initialParticipants, orgId])

  const usernameSyncFired = useRef(false)
  useEffect(() => {
    if (usernameSyncFired.current) return
    usernameSyncFired.current = true

    const needUsername = initialParticipants
      .filter(p => p.tg_user_id && !(p.tg_username || p.username))
      .map(p => p.id)

    if (needUsername.length === 0) return

    fetch('/api/participants/batch-sync-usernames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, participantIds: needUsername.slice(0, 100) }),
    }).catch(() => {})
  }, [initialParticipants, orgId])

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
        const category = getParticipantCategory(p)
        return category && filters.autoCategories.includes(category)
      })
    }

    // Activity period filter
    if (filters.activityPeriod) {
      result = result.filter((p) => {
        const activityDate = p.real_last_activity || p.last_activity_at
        
        if (!activityDate && filters.activityPeriod === 'never') return true
        if (!activityDate) return false

        const now = new Date()
        const lastActivity = new Date(activityDate)
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
    <>
      {/* Filters Sidebar (Admin only) */}
      {isAdmin && (
        <MembersFiltersSidebar
          participants={participants}
          availableTags={availableTags}
          filters={filters}
          onFiltersChange={setFilters}
          isAdmin={isAdmin}
          isOpen={filtersOpen}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="w-full">
        {/* Поиск и переключатель видов */}
        <div className="mb-6 flex items-center gap-3">
          {/* Кнопка фильтров (Admin only) */}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="flex items-center gap-2 shrink-0"
            >
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline">Фильтры</span>
              {activeFiltersCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                  {activeFiltersCount}
                </span>
              )}
            </Button>
          )}

          {/* Поиск */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по имени, описанию, email, @username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Переключатель видов + Export (Admin) */}
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
              <>
                <Button
                  variant={viewMode === 'table' ? 'default' : 'outline'}
                  size={'sm' as const}
                  onClick={() => setViewMode('table')}
                  className="gap-2"
                >
                  <TableIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Таблица</span>
                </Button>

                {/* Export Buttons */}
                <div className="hidden md:flex items-center gap-2 ml-2 pl-2 border-l border-gray-300">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportAll('csv')}
                    className="gap-2"
                    title="Экспорт всех участников в CSV"
                  >
                    <Download className="h-4 w-4" />
                    <span className="hidden lg:inline">CSV</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportAll('json')}
                    className="gap-2"
                    title="Экспорт всех участников в JSON (бэкап)"
                  >
                    <FileJson className="h-4 w-4" />
                    <span className="hidden lg:inline">JSON</span>
                  </Button>
                </div>
              </>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
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
          onArchiveSelected={handleBulkArchive}
        />
      )}
      </div>
    </>
  )
}

