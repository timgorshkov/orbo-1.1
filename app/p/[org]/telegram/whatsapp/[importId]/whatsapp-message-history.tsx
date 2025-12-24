'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, ChevronDown, Image as ImageIcon, Video, FileText, Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { format, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'

interface Message {
  id: string
  text: string | null
  sentAt: string
  hasMedia: boolean
  mediaType: string | null
  sender: {
    id: string | null
    name: string
    phone: string | null
    photoUrl: string | null
  }
}

interface WhatsAppMessageHistoryProps {
  importId: string
  groupName: string
}

export default function WhatsAppMessageHistory({ 
  importId,
  groupName 
}: WhatsAppMessageHistoryProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const LIMIT = 50
  const MAX_MESSAGES = 200
  
  useEffect(() => {
    loadMessages(0)
  }, [importId])
  
  const loadMessages = async (newOffset: number) => {
    if (newOffset === 0) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }
    
    try {
      const res = await fetch(`/api/whatsapp/${importId}/messages?limit=${LIMIT}&offset=${newOffset}`)
      const data = await res.json()
      
      if (res.ok) {
        if (newOffset === 0) {
          setMessages(data.messages)
        } else {
          setMessages(prev => [...prev, ...data.messages])
        }
        setTotal(data.total)
        setHasMore(data.hasMore && (newOffset + LIMIT) < MAX_MESSAGES)
        setOffset(newOffset)
      }
    } catch (error) {
      console.error('Error loading messages:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }
  
  const loadMore = () => {
    if (!loadingMore && hasMore) {
      loadMessages(offset + LIMIT)
    }
  }
  
  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'HH:mm', { locale: ru })
    } catch {
      return ''
    }
  }
  
  const formatDateSeparator = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      
      if (isSameDay(date, today)) return 'Сегодня'
      if (isSameDay(date, yesterday)) return 'Вчера'
      return format(date, 'd MMMM yyyy', { locale: ru })
    } catch {
      return dateStr
    }
  }
  
  const getMediaIcon = (mediaType: string | null) => {
    switch (mediaType) {
      case 'photo':
      case 'image':
        return <ImageIcon className="w-4 h-4" />
      case 'video':
        return <Video className="w-4 h-4" />
      case 'audio':
      case 'voice':
        return <Mic className="w-4 h-4" />
      default:
        return <FileText className="w-4 h-4" />
    }
  }
  
  // Generate consistent color based on sender name
  const getSenderColor = (name: string) => {
    const colors = [
      '#25D366', // WhatsApp green
      '#128C7E', // Darker green
      '#075E54', // Dark teal
      '#34B7F1', // Blue
      '#9C27B0', // Purple
      '#E91E63', // Pink
      '#FF5722', // Deep orange
      '#795548', // Brown
    ]
    
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }
  
  // Group messages by date
  const groupedMessages = messages.reduce((groups, message, index) => {
    const date = message.sentAt.split('T')[0]
    const prevMessage = messages[index - 1]
    const prevDate = prevMessage?.sentAt.split('T')[0]
    
    if (date !== prevDate) {
      groups.push({ type: 'date', date: message.sentAt })
    }
    groups.push({ type: 'message', message })
    
    return groups
  }, [] as Array<{ type: 'date'; date: string } | { type: 'message'; message: Message }>)
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }
  
  if (messages.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p>Нет сообщений для отображения</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-4">
      {/* Info */}
      <div className="text-sm text-gray-500 flex items-center justify-between">
        <span>
          Показано {messages.length} из {total.toLocaleString('ru')} сообщений
        </span>
        {messages.length >= MAX_MESSAGES && (
          <span className="text-amber-600">
            Достигнут лимит отображения (200)
          </span>
        )}
      </div>
      
      {/* WhatsApp-style chat container */}
      <div 
        ref={containerRef}
        className="rounded-xl overflow-hidden border border-gray-200 shadow-sm"
        style={{
          background: `
            linear-gradient(135deg, #e5ddd5 0%, #d9d2c5 100%)
          `,
          backgroundImage: `
            url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c5b9a8' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")
          `
        }}
      >
        {/* Header */}
        <div className="bg-[#075E54] text-white px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#128C7E] flex items-center justify-center text-lg">
            💬
          </div>
          <div>
            <div className="font-medium">{groupName}</div>
            <div className="text-xs text-green-100 opacity-80">
              {total.toLocaleString('ru')} сообщений
            </div>
          </div>
        </div>
        
        {/* Messages */}
        <div className="p-4 space-y-1 max-h-[600px] overflow-y-auto">
          {groupedMessages.map((item, index) => {
            if (item.type === 'date') {
              return (
                <div key={`date-${index}`} className="flex justify-center my-3">
                  <span className="bg-white/90 text-gray-600 text-xs px-3 py-1 rounded-full shadow-sm">
                    {formatDateSeparator(item.date)}
                  </span>
                </div>
              )
            }
            
            const { message } = item
            const senderColor = getSenderColor(message.sender.name)
            
            return (
              <div key={message.id} className="flex justify-start mb-1">
                <div 
                  className="max-w-[85%] bg-white rounded-lg shadow-sm px-3 py-2 relative"
                  style={{
                    borderTopLeftRadius: '4px',
                  }}
                >
                  {/* Sender name */}
                  <div 
                    className="text-xs font-medium mb-1"
                    style={{ color: senderColor }}
                  >
                    {message.sender.name}
                    {message.sender.phone && (
                      <span className="text-gray-400 font-normal ml-2">
                        {message.sender.phone}
                      </span>
                    )}
                  </div>
                  
                  {/* Media indicator */}
                  {message.hasMedia && (
                    <div className="flex items-center gap-1.5 text-gray-400 text-sm mb-1">
                      {getMediaIcon(message.mediaType)}
                      <span className="text-xs">
                        {message.mediaType === 'photo' && 'Фото'}
                        {message.mediaType === 'video' && 'Видео'}
                        {message.mediaType === 'audio' && 'Аудио'}
                        {message.mediaType === 'voice' && 'Голосовое'}
                        {message.mediaType === 'document' && 'Документ'}
                        {!['photo', 'video', 'audio', 'voice', 'document'].includes(message.mediaType || '') && 'Медиа'}
                      </span>
                    </div>
                  )}
                  
                  {/* Message text */}
                  {message.text && (
                    <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                      {message.text}
                    </div>
                  )}
                  
                  {/* Time */}
                  <div className="flex justify-end mt-1">
                    <span className="text-[10px] text-gray-400">
                      {formatTime(message.sentAt)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
          
          {/* Load more button */}
          {hasMore && (
            <div className="flex justify-center pt-4 pb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
                className="bg-white/90 hover:bg-white"
              >
                {loadingMore ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <ChevronDown className="w-4 h-4 mr-2" />
                )}
                Загрузить ещё
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

