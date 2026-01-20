'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UserPlus, MessageCircle, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface Participant {
  id: string
  tg_user_id: number
  username: string | null
  first_name: string | null
  last_name: string | null
  comments_count: number
  reactions_count: number
  first_seen_at: string
  last_activity_at: string
  participant_id: string | null
}

interface NewParticipantsListProps {
  participants: Participant[]
  orgId: string
}

export function NewParticipantsList({ participants, orgId }: NewParticipantsListProps) {
  if (!participants || participants.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Новые участники
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-500 text-center py-8">
            Нет новых участников за выбранный период
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Новые участники
        </CardTitle>
        <p className="text-sm text-neutral-500 mt-1">
          Участники, которые впервые прокомментировали посты канала
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {participants.map((participant) => {
            const displayName = participant.first_name || participant.last_name 
              ? [participant.first_name, participant.last_name].filter(Boolean).join(' ')
              : participant.username || `User ${participant.tg_user_id}`

            return (
              <div 
                key={participant.id}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-semibold">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{displayName}</p>
                    {participant.username && (
                      <a 
                        href={`https://t.me/${participant.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      >
                        @{participant.username}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-neutral-600">
                        <MessageCircle className="h-3 w-3" />
                        {participant.comments_count} комм.
                      </span>
                      <span className="text-xs text-neutral-500">
                        {new Date(participant.first_seen_at).toLocaleDateString('ru')}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Link to participant card - only if participant exists in CRM */}
                {participant.participant_id ? (
                  <Link href={`/p/${orgId}/members/${participant.participant_id}`}>
                    <Button variant="outline" size="sm">
                      Карточка
                    </Button>
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" disabled title="Участник еще не добавлен в CRM">
                    Карточка
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
