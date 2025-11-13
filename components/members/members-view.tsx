'use client'

import { useState, useMemo } from 'react'
import { Search, LayoutGrid, Table as TableIcon } from 'lucide-react'
import { Button } from '../ui/button'
import MemberCard from './member-card'
import MembersTable from './members-table'

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
}

interface MembersViewProps {
  orgId: string
  initialParticipants: Participant[]
  isAdmin: boolean
  adminMode: boolean
}

type ViewMode = 'cards' | 'table'

export default function MembersView({
  orgId,
  initialParticipants,
  isAdmin,
  adminMode,
}: MembersViewProps) {
  const [participants] = useState<Participant[]>(initialParticipants)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  
  // Show admin features only if user is admin AND in admin mode
  const showAdminFeatures = isAdmin && adminMode

  // Фильтрация участников по поисковому запросу
  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) {
      return participants
    }

    const query = searchQuery.toLowerCase()
    return participants.filter((p) => {
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
  }, [participants, searchQuery])

  return (
    <div>
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
        <MembersTable participants={filteredParticipants} />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredParticipants.map((participant) => (
            <MemberCard key={participant.id} participant={participant} />
          ))}
        </div>
      )}
    </div>
  )
}

