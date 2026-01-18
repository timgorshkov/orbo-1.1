'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye, Heart, MessageCircle, Share2, ExternalLink, Image, Video, FileText } from 'lucide-react'

interface Post {
  id: string
  tg_message_id: number
  text: string | null
  has_media: boolean
  media_type: string | null
  views_count: number
  reactions_count: number
  comments_count: number
  forwards_count: number
  engagement_rate: number
  posted_at: string
}

interface TopPostsListProps {
  posts: Post[]
  channelUsername: string | null
}

export function TopPostsList({ posts, channelUsername }: TopPostsListProps) {
  const getMediaIcon = (mediaType: string | null) => {
    switch (mediaType) {
      case 'photo':
        return <Image className="h-4 w-4 text-blue-500" />
      case 'video':
      case 'animation':
        return <Video className="h-4 w-4 text-purple-500" />
      default:
        return <FileText className="h-4 w-4 text-neutral-400" />
    }
  }
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ru', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  const truncateText = (text: string | null, maxLength: number = 100) => {
    if (!text) return 'Без текста'
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Топ постов по вовлечённости</CardTitle>
      </CardHeader>
      <CardContent>
        {posts.length === 0 ? (
          <div className="text-center py-8 text-neutral-500">
            Нет данных о постах
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post, idx) => (
              <div 
                key={post.id}
                className="flex gap-3 p-3 rounded-lg bg-neutral-50 hover:bg-neutral-100 transition-colors"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-bold text-neutral-600">
                  {idx + 1}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-neutral-800 line-clamp-2">
                      {truncateText(post.text)}
                    </p>
                    {channelUsername && (
                      <a
                        href={`https://t.me/${channelUsername}/${post.tg_message_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 p-1 hover:bg-neutral-200 rounded"
                        title="Открыть в Telegram"
                      >
                        <ExternalLink className="h-4 w-4 text-neutral-400" />
                      </a>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4 mt-2 text-xs text-neutral-500">
                    <span className="flex items-center gap-1">
                      {post.has_media && getMediaIcon(post.media_type)}
                      {formatDate(post.posted_at)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1 text-xs text-neutral-600">
                      <Eye className="h-3.5 w-3.5" />
                      {post.views_count.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-pink-600">
                      <Heart className="h-3.5 w-3.5" />
                      {post.reactions_count}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-purple-600">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {post.comments_count}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-blue-600">
                      <Share2 className="h-3.5 w-3.5" />
                      {post.forwards_count}
                    </span>
                    <span className="ml-auto text-xs font-medium text-green-600">
                      ER: {(post.engagement_rate * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
