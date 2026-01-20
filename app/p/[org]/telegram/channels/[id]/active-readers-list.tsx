'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Heart, MessageCircle, Star, Clock } from 'lucide-react'
import Link from 'next/link'

interface Reader {
  id: string
  tg_user_id: number
  username: string | null
  first_name: string | null
  last_name: string | null
  reactions_count: number
  comments_count: number
  last_activity_at: string | null
}

interface ActiveReadersListProps {
  readers: Reader[]
  orgId: string
}

export function ActiveReadersList({ readers, orgId }: ActiveReadersListProps) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Нет данных'
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Сегодня'
    if (diffDays === 1) return 'Вчера'
    if (diffDays < 7) return `${diffDays} дн. назад`
    return date.toLocaleDateString('ru', { day: 'numeric', month: 'short' })
  }
  
  const getDisplayName = (reader: Reader) => {
    if (reader.first_name || reader.last_name) {
      return [reader.first_name, reader.last_name].filter(Boolean).join(' ')
    }
    if (reader.username) {
      return `@${reader.username}`
    }
    return `User ${reader.tg_user_id}`
  }
  
  const getInitials = (reader: Reader) => {
    if (reader.first_name) {
      return reader.first_name.charAt(0).toUpperCase()
    }
    if (reader.username) {
      return reader.username.charAt(0).toUpperCase()
    }
    return '?'
  }
  
  // Generate consistent color based on user ID
  const getAvatarColor = (userId: number) => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-amber-500',
      'bg-cyan-500',
      'bg-red-500',
      'bg-indigo-500'
    ]
    return colors[userId % colors.length]
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5" />
          Самые активные комментаторы
        </CardTitle>
        <p className="text-sm text-neutral-500 mt-1">
          Участники с наибольшим количеством комментариев
        </p>
      </CardHeader>
      <CardContent>
        {readers.length === 0 ? (
          <div className="text-center py-8 text-neutral-500">
            Нет данных об активных комментаторах
          </div>
        ) : (
          <div className="space-y-3">
            {readers.map((reader, idx) => (
              <div 
                key={reader.id}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-neutral-50 transition-colors"
              >
                <div className="flex-shrink-0 w-6 text-center">
                  {idx < 3 ? (
                    <span className="text-lg">
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400 font-medium">{idx + 1}</span>
                  )}
                </div>
                
                <div className={`w-10 h-10 rounded-full ${getAvatarColor(reader.tg_user_id)} flex items-center justify-center text-white font-medium`}>
                  {getInitials(reader)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-neutral-800 truncate">
                    {getDisplayName(reader)}
                  </p>
                  {reader.username && reader.first_name && (
                    <p className="text-xs text-neutral-500 truncate">
                      @{reader.username}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center gap-1 text-xs text-neutral-600" title="Комментарии">
                      <MessageCircle className="h-3 w-3" />
                      {reader.comments_count}
                    </span>
                    <span className="text-xs text-neutral-400">•</span>
                    <span className="text-xs text-neutral-500" title="Последняя активность">
                      {formatDate(reader.last_activity_at)}
                    </span>
                  </div>
                </div>
                
                <Link href={`/p/${orgId}/participants?search=${reader.tg_user_id}`}>
                  <Button variant="outline" size="sm">
                    Карточка
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
