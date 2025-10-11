'use client'

import { User, Mail, AtSign, Calendar, Tag } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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

interface MembersTableProps {
  participants: Participant[]
}

export default function MembersTable({ participants }: MembersTableProps) {
  const params = useParams()
  const router = useRouter()
  const orgId = params?.org as string

  const handleRowClick = (participantId: string) => {
    router.push(`/app/${orgId}/members/${participantId}`)
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'participant':
        return 'Участник'
      case 'event_attendee':
        return 'Событие'
      case 'candidate':
        return 'Кандидат'
      case 'excluded':
        return 'Исключён'
      default:
        return status
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'participant':
        return 'bg-green-100 text-green-800'
      case 'event_attendee':
        return 'bg-blue-100 text-blue-800'
      case 'candidate':
        return 'bg-yellow-100 text-yellow-800'
      case 'excluded':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Участник</TableHead>
            <TableHead>Telegram</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead className="text-right">Добавлен</TableHead>
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
                  {participant.photo_url ? (
                    <img
                      src={participant.photo_url}
                      alt={participant.full_name || 'User'}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                      <User className="h-5 w-5 text-gray-500" />
                    </div>
                  )}
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
                {participant.tg_username ? (
                  <a
                    href={`https://t.me/${participant.tg_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AtSign className="h-4 w-4" />
                    {participant.tg_username}
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

              {/* Статус */}
              <TableCell>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(
                    participant.participant_status
                  )}`}
                >
                  <Tag className="h-3 w-3" />
                  {getStatusLabel(participant.participant_status)}
                </span>
              </TableCell>

              {/* Добавлен */}
              <TableCell className="text-right text-sm text-gray-600">
                <div className="inline-flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatDate(participant.created_at)}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

