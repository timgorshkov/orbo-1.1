'use client'

import { useState, useMemo } from 'react'
import { X, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'

type AutoCategory = 'newcomer' | 'core' | 'experienced' | 'silent' | 'observer' | 'all'

interface Tag {
  tag_id: string
  tag_name: string
  tag_color: string
  participant_count: number
}

interface Participant {
  id: string
  created_at?: string
  last_activity_at?: string | null
  real_join_date?: string // Real join date from first message or created_at
  real_last_activity?: string | null // Real last activity from last message or last_activity_at
  group_joined_at?: string | null // Earliest joined_at from participant_groups (if available)
  activity_score?: number
  tags?: Array<{ id: string; name: string; color: string }>
  is_org_owner?: boolean
  is_admin?: boolean
  source?: string | null
}

export interface MembersFilters {
  roles: string[]
  tags: string[]
  autoCategories: AutoCategory[]
  sources: string[]
  activityPeriod: string | null
}

interface MembersFiltersSidebarProps {
  participants: Participant[]
  availableTags: Tag[]
  filters: MembersFilters
  onFiltersChange: (filters: MembersFilters) => void
  isAdmin: boolean
  isOpen: boolean
  onClose: () => void
}

export default function MembersFiltersSidebar({
  participants,
  availableTags,
  filters,
  onFiltersChange,
  isAdmin,
  isOpen,
  onClose,
}: MembersFiltersSidebarProps) {

  // Calculate participant category (shared logic for counts and filtering)
  const getParticipantCategory = (p: Participant): AutoCategory | null => {
    const now = new Date()
    // Use real join date: приоритет group_joined_at > real_join_date > created_at
    const joinDate = p.group_joined_at
      ? new Date(p.group_joined_at)
      : p.real_join_date
        ? new Date(p.real_join_date)
        : p.created_at
          ? new Date(p.created_at)
          : null
    // Use real last activity (from last message or last_activity_at)
    const lastActivity = p.real_last_activity
      ? new Date(p.real_last_activity)
      : p.last_activity_at
        ? new Date(p.last_activity_at)
        : null

    const daysSinceJoined = joinDate ? (now.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24) : 999
    const daysSinceActivity = lastActivity ? (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24) : 999
    const activityScore = p.activity_score || 0

    // Priority 1: Silent — БЫЛА активность и прошло >30 дней; ИЛИ НИКОГДА не было и joined >7 дней.
    // Важно: при null lastActivity → daysSinceActivity = 999, но мы НЕ считаем silent
    // только по этому — нужна явная проверка, что активность БЫЛА (lastActivity !== null).
    if ((lastActivity && daysSinceActivity > 30) || (!lastActivity && daysSinceJoined > 7)) {
      return 'silent'
    }

    // Priority 2: Newcomers (joined <30 days ago AND not silent)
    if (daysSinceJoined < 30) {
      return 'newcomer'
    }

    // Priority 3: Core (activity_score >= 60)
    if (activityScore >= 60) {
      return 'core'
    }

    // Priority 4: Experienced (activity_score >= 30)
    if (activityScore >= 30) {
      return 'experienced'
    }

    // Priority 5: Observer — есть какая-то активность, но score <30.
    // Это «тихие наблюдатели»: состоят в группе, пишут мало, но присутствуют.
    return 'observer'
  }

  // Calculate auto-category counts
  const categoryCounts = useMemo(() => {
    const counts = {
      all: participants.length,
      newcomer: 0,
      core: 0,
      experienced: 0,
      silent: 0,
      observer: 0,
    }

    participants.forEach((p) => {
      const category = getParticipantCategory(p)
      if (category && category !== 'all' && category in counts) {
        counts[category as keyof typeof counts]++
      }
    })

    return counts
  }, [participants])

  // Calculate role counts
  const roleCounts = useMemo(() => {
    return {
      owner: participants.filter((p) => p.is_org_owner).length,
      admin: participants.filter((p) => p.is_admin && !p.is_org_owner).length,
      member: participants.filter((p) => !p.is_admin && !p.is_org_owner).length,
    }
  }, [participants])

  const toggleFilter = (type: keyof MembersFilters, value: string) => {
    const currentValues = filters[type] as string[]
    const newValues = currentValues.includes(value)
      ? currentValues.filter((v) => v !== value)
      : [...currentValues, value]

    onFiltersChange({
      ...filters,
      [type]: newValues,
    })
  }

  const clearAllFilters = () => {
    onFiltersChange({
      roles: [],
      tags: [],
      autoCategories: [],
      sources: [],
      activityPeriod: null,
    })
  }

  const activeFiltersCount =
    filters.roles.length +
    filters.tags.length +
    filters.autoCategories.length +
    filters.sources.length +
    (filters.activityPeriod ? 1 : 0)

  return (
    <>
      {/* Sidebar (hidden by default on all devices) */}
      <div
        className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 
          transform transition-transform duration-200 ease-in-out overflow-y-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="p-4 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Фильтры</h3>
            </div>
            <div className="flex items-center gap-2">
              {activeFiltersCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Сбросить
                </button>
              )}
              <button onClick={onClose}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Auto Categories */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Категории вовлечённости
            </h4>
            <div className="space-y-1">
              <FilterOption
                label="Все участники"
                count={categoryCounts.all}
                active={filters.autoCategories.includes('all')}
                onClick={() => toggleFilter('autoCategories', 'all')}
                color="gray"
              />
              <FilterOption
                label="🔵 Новички"
                count={categoryCounts.newcomer}
                active={filters.autoCategories.includes('newcomer')}
                onClick={() => toggleFilter('autoCategories', 'newcomer')}
                color="#3B82F6"
              />
              <FilterOption
                label="🟢 Ядро"
                count={categoryCounts.core}
                active={filters.autoCategories.includes('core')}
                onClick={() => toggleFilter('autoCategories', 'core')}
                color="#10B981"
              />
              <FilterOption
                label="🟡 Опытные"
                count={categoryCounts.experienced}
                active={filters.autoCategories.includes('experienced')}
                onClick={() => toggleFilter('autoCategories', 'experienced')}
                color="#F59E0B"
              />
              <FilterOption
                label="⚫ Молчуны"
                count={categoryCounts.silent}
                active={filters.autoCategories.includes('silent')}
                onClick={() => toggleFilter('autoCategories', 'silent')}
                color="#6B7280"
              />
              <FilterOption
                label="👁 Наблюдатели"
                count={categoryCounts.observer}
                active={filters.autoCategories.includes('observer')}
                onClick={() => toggleFilter('autoCategories', 'observer')}
                color="#8B5CF6"
              />
            </div>
          </div>

          {/* Custom Tags (Admin only) */}
          {isAdmin && availableTags.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Ваши теги
              </h4>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {availableTags.map((tag) => (
                  <FilterOption
                    key={tag.tag_id}
                    label={tag.tag_name}
                    count={tag.participant_count}
                    active={filters.tags.includes(tag.tag_id)}
                    onClick={() => toggleFilter('tags', tag.tag_id)}
                    color={tag.tag_color}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Roles (Admin only) */}
          {isAdmin && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Роль
              </h4>
              <div className="space-y-1">
                <FilterOption
                  label="👑 Владельцы"
                  count={roleCounts.owner}
                  active={filters.roles.includes('owner')}
                  onClick={() => toggleFilter('roles', 'owner')}
                  color="purple"
                />
                <FilterOption
                  label="🛡️ Администраторы"
                  count={roleCounts.admin}
                  active={filters.roles.includes('admin')}
                  onClick={() => toggleFilter('roles', 'admin')}
                  color="blue"
                />
                <FilterOption
                  label="👤 Участники"
                  count={roleCounts.member}
                  active={filters.roles.includes('member')}
                  onClick={() => toggleFilter('roles', 'member')}
                  color="gray"
                />
              </div>
            </div>
          )}

          {/* Activity Period */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Активность
            </h4>
            <div className="space-y-1">
              <FilterOption
                label="Сегодня"
                active={filters.activityPeriod === 'today'}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    activityPeriod: filters.activityPeriod === 'today' ? null : 'today',
                  })
                }
                color="green"
              />
              <FilterOption
                label="За неделю"
                active={filters.activityPeriod === 'week'}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    activityPeriod: filters.activityPeriod === 'week' ? null : 'week',
                  })
                }
                color="blue"
              />
              <FilterOption
                label="За месяц"
                active={filters.activityPeriod === 'month'}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    activityPeriod: filters.activityPeriod === 'month' ? null : 'month',
                  })
                }
                color="yellow"
              />
              <FilterOption
                label="Более месяца"
                active={filters.activityPeriod === 'old'}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    activityPeriod: filters.activityPeriod === 'old' ? null : 'old',
                  })
                }
                color="gray"
              />
              <FilterOption
                label="Нет активности"
                active={filters.activityPeriod === 'never'}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    activityPeriod: filters.activityPeriod === 'never' ? null : 'never',
                  })
                }
                color="red"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={onClose}
        />
      )}
    </>
  )
}

// Export the category calculation function for use in members-view
export const getParticipantCategory = (p: Participant): AutoCategory | null => {
  const now = new Date()
  const joinDate = p.group_joined_at
    ? new Date(p.group_joined_at)
    : p.real_join_date
      ? new Date(p.real_join_date)
      : p.created_at
        ? new Date(p.created_at)
        : null
  const lastActivity = p.real_last_activity
    ? new Date(p.real_last_activity)
    : p.last_activity_at
      ? new Date(p.last_activity_at)
      : null

  const daysSinceJoined = joinDate ? (now.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24) : 999
  const daysSinceActivity = lastActivity ? (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24) : 999
  const activityScore = p.activity_score || 0

  if ((lastActivity && daysSinceActivity > 30) || (!lastActivity && daysSinceJoined > 7)) {
    return 'silent'
  }
  if (daysSinceJoined < 30) {
    return 'newcomer'
  }
  if (activityScore >= 60) {
    return 'core'
  }
  if (activityScore >= 30) {
    return 'experienced'
  }
  return 'observer'
}

// Helper component for filter options
interface FilterOptionProps {
  label: string
  count?: number
  active: boolean
  onClick: () => void
  color?: string
}

function FilterOption({ label, count, active, onClick, color }: FilterOptionProps) {
  const getBgColor = () => {
    if (!active) return 'hover:bg-gray-100 dark:hover:bg-gray-700'
    
    // If color is a hex code, use inline styles
    if (color?.startsWith('#')) {
      return 'border-gray-300 dark:border-gray-600'
    }
    
    // Otherwise use predefined Tailwind colors
    switch (color) {
      case 'blue':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
      case 'green':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      case 'yellow':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
      case 'red':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      case 'purple':
        return 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
      case 'gray':
      default:
        return 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
    }
  }

  const style = active && color?.startsWith('#') ? { backgroundColor: `${color}10`, borderColor: `${color}50` } : {}

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm
        transition-colors border
        ${active ? getBgColor() : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'}
      `}
      style={style}
    >
      <span className={`font-medium ${active ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
        {label}
      </span>
      {count !== undefined && (
        <span className={`text-xs ${active ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

