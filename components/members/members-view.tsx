'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Search, LayoutGrid, Table as TableIcon, Filter, FileJson, Loader2, ChevronDown, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Button } from '../ui/button'
import MemberCard from './member-card'
import MembersTable from './members-table'
import MembersFiltersSidebar, { type MembersFilters, getParticipantCategory } from './members-filters-sidebar'
import BulkActionsBar from './bulk-actions-bar'
import { SmartSearchDialog } from './smart-search-dialog'
import { MembershipBadge, type MembershipStatusType } from '@/components/memberships/membership-badge'

const PAGE_SIZE = 50

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
  totalParticipantCount?: number
  availableTags?: Tag[]
  isAdmin: boolean
  adminMode: boolean
  hasTelegramAccount?: boolean
  onGoToInvites?: () => void
}

type ViewMode = 'cards' | 'table'

export default function MembersView({
  orgId,
  initialParticipants,
  totalParticipantCount,
  availableTags = [],
  isAdmin,
  adminMode,
  hasTelegramAccount = false,
  onGoToInvites,
}: MembersViewProps) {
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants)
  // true when enriched list is fully loaded (no background fetch needed)
  const isInitiallyAllLoaded = totalParticipantCount === undefined || initialParticipants.length >= (totalParticipantCount ?? 0)
  const [allLoaded, setAllLoaded] = useState(isInitiallyAllLoaded)
  // Start as true for large orgs so we show skeleton instead of unsorted fast-path data
  const [backgroundLoading, setBackgroundLoading] = useState(!isInitiallyAllLoaded)
  const [searchQuery, setSearchQuery] = useState('')
  // Таблица — только для admin в admin-режиме; участники и owner в "режиме участника" видят карточки
  const showAdminFeatures = isAdmin && adminMode
  const [viewMode, setViewMode] = useState<ViewMode>(showAdminFeatures ? 'table' : 'cards')

  // При переключении режима обновляем viewMode
  useEffect(() => {
    if (showAdminFeatures) {
      setViewMode('table')
    } else {
      setViewMode('cards')
    }
  }, [showAdminFeatures])
  // How many filtered items to render
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  
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

  // Shared fetch function for full enriched list
  const fetchEnriched = useCallback(() => {
    let cancelled = false
    setBackgroundLoading(true)
    fetch(`/api/participants/enriched?orgId=${orgId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.participants) return
        setParticipants(data.participants)
        setAllLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setAllLoaded(true)
      })
      .finally(() => {
        if (!cancelled) setBackgroundLoading(false)
      })
    return () => { cancelled = true }
  }, [orgId])

  // Background-load all remaining participants if initial load was capped
  useEffect(() => {
    if (allLoaded) return
    return fetchEnriched()
  }, [orgId, allLoaded, fetchEnriched])

  // Re-fetch when the tab becomes visible again (catches merges done in another tab/page)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchEnriched()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchEnriched])

  // Membership status map (participant_id -> status)
  const [membershipMap, setMembershipMap] = useState<Record<string, string>>({})
  useEffect(() => {
    fetch(`/api/participant-memberships?orgId=${orgId}&map=true`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.membershipMap) setMembershipMap(data.membershipMap) })
      .catch(() => {})
  }, [orgId])

  // Reset visible count when search or filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [searchQuery, filters])

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

  const buildExportRows = () => filteredParticipants.map((p) => {
    const attrs = p.custom_attributes || {}
    return {
      'ID': p.id,
      'Имя': p.full_name || '',
      'Telegram Username': p.tg_username || p.username || '',
      'Telegram ID': p.tg_user_id || '',
      'Email': p.email || '',
      'Описание (Telegram bio)': p.bio || '',
      'Роль': p.is_org_owner ? 'owner' : p.is_admin ? 'admin' : 'member',
      'Теги': p.tags?.map((t) => t.name).join(', ') || '',
      'Дата создания': p.created_at || '',
      'Дата присоединения': p.real_join_date || '',
      'Последняя активность': p.real_last_activity || p.last_activity_at || '',
      'Оценка активности': p.activity_score || 0,
      // User-filled profile fields
      'О себе': attrs.bio_custom || '',
      'Город (подтверждён)': attrs.city_confirmed || '',
      'Цели в сообществе': attrs.goals_self || '',
      'Чем могу помочь': Array.isArray(attrs.offers) ? attrs.offers.join('; ') : '',
      'Что мне нужно': Array.isArray(attrs.asks) ? attrs.asks.join('; ') : '',
      // AI-analyzed fields
      'AI: Интересы': Array.isArray(attrs.interests_keywords) ? attrs.interests_keywords.join('; ') : '',
      'AI: Город': attrs.city_inferred || '',
      'AI: Роль в сообществе': attrs.behavioral_role || '',
      'AI: Актуальные запросы': Array.isArray(attrs.recent_asks) ? attrs.recent_asks.join('; ') : '',
    }
  })

  const handleExportAll = (format: 'xlsx' | 'json') => {
    const date = new Date().toISOString().split('T')[0]

    if (format === 'xlsx') {
      const rows = buildExportRows()
      const ws = XLSX.utils.json_to_sheet(rows)
      // Auto-width for columns
      const colWidths = Object.keys(rows[0] || {}).map((key) => ({
        wch: Math.max(key.length, ...rows.map((r) => String((r as any)[key] || '').length).slice(0, 100)) + 2,
      }))
      ws['!cols'] = colWidths
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Участники')
      XLSX.writeFile(wb, `participants_${date}.xlsx`)
    } else if (format === 'json') {
      const rows = buildExportRows()
      const jsonContent = JSON.stringify(rows, null, 2)
      const blob = new Blob([jsonContent], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', `participants_${date}.json`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }
  }
  
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

    const needSync = initialParticipants
      .filter(p => p.tg_user_id && (!(p.tg_username || p.username) || !p.bio))
      .map(p => p.id)

    if (needSync.length === 0) return

    fetch('/api/participants/batch-sync-usernames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, participantIds: needSync.slice(0, 100) }),
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

  const visibleParticipants = useMemo(
    () => filteredParticipants.slice(0, visibleCount),
    [filteredParticipants, visibleCount]
  )

  const hasMore = visibleCount < filteredParticipants.length

  const loadMore = useCallback(() => {
    setVisibleCount(c => c + PAGE_SIZE)
  }, [])

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
          {/* Кнопка фильтров — только в admin-режиме */}
          {showAdminFeatures && (
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

          {/* Умный поиск */}
          <SmartSearchDialog orgId={orgId} />

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
            
            {/* Таблица и экспорт — только в admin-режиме */}
            {showAdminFeatures && (
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
                <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-300">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportAll('xlsx')}
                    className="gap-2"
                    title="Экспорт всех участников в Excel"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    <span className="hidden lg:inline">Excel</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportAll('json')}
                    className="hidden md:flex gap-2"
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
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
        <span>
          {filteredParticipants.length}{' '}
          {filteredParticipants.length === 1
            ? 'участник'
            : filteredParticipants.length < 5
            ? 'участника'
            : 'участников'}
          {hasMore && (
            <span className="text-gray-400"> · показано {visibleParticipants.length}</span>
          )}
        </span>
        {backgroundLoading && (
          <span className="flex items-center gap-1 text-gray-400 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            загружается полный список...
          </span>
        )}
      </div>

      {/* Скелетон при фоновой загрузке (только если нет поиска/фильтров — пользователь ещё не взаимодействовал) */}
      {backgroundLoading && !searchQuery && activeFiltersCount === 0 ? (
        viewMode === 'table' ? (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 animate-pulse">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2 p-2">
                <div className="w-24 h-24 rounded-full bg-gray-200" />
                <div className="w-16 h-3 bg-gray-200 rounded" />
                <div className="w-12 h-2 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        )
      ) : /* Контент */ filteredParticipants.length === 0 ? (
        searchQuery ? (
          <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300">
            <div className="text-center px-4">
              <p className="text-lg font-medium text-gray-900">Участники не найдены</p>
              <p className="mt-1 text-sm text-gray-500">
                {backgroundLoading
                  ? 'Полный список ещё загружается, попробуйте снова через секунду'
                  : 'Попробуйте изменить поисковый запрос'}
              </p>
            </div>
          </div>
        ) : showAdminFeatures ? (
          <div className="py-16 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Участников пока нет</h2>
            <p className="text-sm text-gray-500 mb-8 max-w-sm">
              Импортируйте из Telegram-группы или пригласите вручную по email
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl text-left">
              {/* Telegram card */}
              <Link
                href={hasTelegramAccount ? `/p/${orgId}/telegram/available-groups` : `/p/${orgId}/telegram/account`}
                className="group flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-[#2AABEE]/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#2AABEE]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Импорт из Telegram</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    {hasTelegramAccount
                      ? 'Аккаунт подключён. Добавьте бота в группу и подключите её.'
                      : 'Привяжите Telegram-аккаунт и добавьте группу — участники синхронизируются автоматически.'}
                  </p>
                </div>
                <span className="text-xs font-medium text-blue-600 group-hover:underline mt-auto">
                  {hasTelegramAccount ? 'Подключить группу →' : 'Подключить аккаунт →'}
                </span>
              </Link>

              {/* Email invite card */}
              <button
                type="button"
                onClick={onGoToInvites}
                className="group flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 hover:border-violet-300 hover:shadow-sm transition-all text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Пригласить по email</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    Отправьте персональные приглашения — по одному или загрузите список из CSV.
                  </p>
                </div>
                <span className="text-xs font-medium text-violet-600 group-hover:underline mt-auto">
                  Перейти к приглашениям →
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300">
            <div className="text-center px-4">
              <p className="text-lg font-medium text-gray-900">Пока нет участников</p>
            </div>
          </div>
        )
      ) : viewMode === 'table' ? (
        <>
          <MembersTable
            participants={visibleParticipants}
            selectedParticipants={selectedParticipants}
            onToggleParticipant={toggleParticipantSelection}
            onToggleAll={toggleAllParticipants}
            showBulkActions={isAdmin && adminMode}
            membershipMap={membershipMap}
          />
          {hasMore && (
            <div className="mt-4 flex flex-col items-center gap-1">
              <Button variant="outline" size="sm" onClick={loadMore} className="gap-2">
                <ChevronDown className="h-4 w-4" />
                Показать ещё {Math.min(PAGE_SIZE, filteredParticipants.length - visibleCount)}
              </Button>
              <span className="text-xs text-gray-400">
                {visibleParticipants.length} из {filteredParticipants.length}
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {visibleParticipants.map((participant) => (
              <MemberCard key={participant.id} participant={participant} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-6 flex flex-col items-center gap-1">
              <Button variant="outline" size="sm" onClick={loadMore} className="gap-2">
                <ChevronDown className="h-4 w-4" />
                Показать ещё {Math.min(PAGE_SIZE, filteredParticipants.length - visibleCount)}
              </Button>
              <span className="text-xs text-gray-400">
                {visibleParticipants.length} из {filteredParticipants.length}
              </span>
            </div>
          )}
        </>
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

