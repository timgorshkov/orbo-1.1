'use client'

import { Mail, AtSign } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AdminBadge } from '@/components/admin-badge'
import { ParticipantAvatar } from './participant-avatar'

interface Participant {
  id: string
  full_name: string | null
  tg_username: string | null
  username?: string | null // Telegram username (alternative field name)
  tg_user_id: string | null
  email: string | null
  bio: string | null
  custom_attributes: any
  participant_status: string
  photo_url: string | null
  created_at?: string
  last_activity_at?: string | null
  is_owner?: boolean // Для обратной совместимости (= is_org_owner)
  is_org_owner?: boolean // ✅ Владелец организации (фиолетовая корона)
  is_group_creator?: boolean // ✅ Создатель группы в Telegram (синий бейдж)
  is_admin?: boolean // Администратор (организации или группы)
  custom_title?: string | null
  tags?: Array<{
    id: string
    name: string
    color: string
  }>
}

interface MembersTableProps {
  participants: Participant[]
}

export default function MembersTable({ participants }: MembersTableProps) {
  const params = useParams()
  const router = useRouter()
  const orgId = params?.org as string

  const handleRowClick = (participantId: string) => {
    router.push(`/p/${orgId}/members/${participantId}`)
  }

  const formatLastActivity = (dateString?: string | null) => {
    if (!dateString) return '—'
    
    const activityDate = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - activityDate.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    // Today - show time
    if (diffDays === 0) {
      if (diffMins < 5) return 'только что'
      if (diffMins < 60) return `${diffMins} мин назад`
      return activityDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    }
    
    // Yesterday
    if (diffDays === 1) {
      return 'вчера'
    }
    
    // Less than 7 days
    if (diffDays < 7) {
      return `${diffDays} дн назад`
    }
    
    // More than 7 days - show date
    return activityDate.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Участник</TableHead>
            <TableHead>Telegram</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Роль</TableHead>
            <TableHead>Теги</TableHead>
            <TableHead className="text-right">Последняя активность</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {participants.map((participant) => (
            <TableRow
              key={participant.id}
              className="cursor-pointer hover:bg-gray-50"
              onClick={() => handleRowClick(participant.id)}
            >
              {/* Участник (Фото + Имя) */}
              <TableCell>
                <div className="flex items-center gap-3">
                  <ParticipantAvatar
                    participantId={participant.id}
                    photoUrl={participant.photo_url}
                    tgUserId={participant.tg_user_id}
                    displayName={participant.full_name || 'Без имени'}
                    size="md"
                  />
                  <div>
                    <div className="font-medium text-gray-900">
                      {participant.full_name || 'Без имени'}
                    </div>
                    {participant.tg_user_id && (
                      <div className="text-xs text-gray-500">
                        ID: {participant.tg_user_id}
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>

              {/* Telegram */}
              <TableCell>
                {(participant.tg_username || participant.username) ? (
                  <a
                    href={`https://t.me/${participant.tg_username || participant.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AtSign className="h-4 w-4" />
                    {participant.tg_username || participant.username}
                  </a>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </TableCell>

              {/* Email */}
              <TableCell>
                {participant.email ? (
                  <a
                    href={`mailto:${participant.email}`}
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Mail className="h-4 w-4" />
                    {participant.email}
                  </a>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </TableCell>

              {/* Роль (Admin/Owner badge) */}
              <TableCell>
                <AdminBadge 
                  isOrgOwner={participant.is_org_owner}
                  isGroupCreator={participant.is_group_creator}
                  isAdmin={participant.is_admin}
                  customTitle={participant.custom_title}
                  size="sm"
                  showLabel={false}
                />
              </TableCell>

              {/* Теги */}
              <TableCell>
                {participant.tags && participant.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {participant.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
                        style={{ backgroundColor: tag.color }}
                        title={tag.name}
                      >
                        {tag.name}
                      </span>
                    ))}
                    {participant.tags.length > 2 && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700"
                        title={`+${participant.tags.length - 2} ещё`}
                      >
                        +{participant.tags.length - 2}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </TableCell>

              {/* Последняя активность */}
              <TableCell className="text-right text-sm text-gray-600">
                {formatLastActivity(participant.last_activity_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

