'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, Loader2 } from 'lucide-react'

interface Topic {
  id: number
  title: string
  tg_chat_id: number
}

interface Props {
  orgId: string
  tgChatId: number
  isForum: boolean
}

export default function ForumTopicsManager({ orgId, tgChatId, isForum }: Props) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isForum) loadTopics()
  }, [isForum, tgChatId])

  const loadTopics = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/telegram/groups/topics?tgChatId=${tgChatId}&orgId=${orgId}`)
      if (res.ok) {
        const data = await res.json()
        setTopics((data.topics || []) as Topic[])
      }
    } finally {
      setLoading(false)
    }
  }

  if (!isForum) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-600" />
          Форум-топики
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Топики определяются автоматически при активности в них после добавления бота Orbo.
          Если топик не отображается — напишите в него любое сообщение.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Загрузка...
          </div>
        ) : topics.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Нет обнаруженных топиков</p>
        ) : (
          <div className="space-y-1">
            {topics.map(t => (
              <div key={t.id} className="flex items-center gap-2 py-1">
                <span className="text-xs text-gray-400 w-12 shrink-0">ID: {t.id}</span>
                <span className="text-sm text-gray-700">
                  {t.title || `Тема ${t.id}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
