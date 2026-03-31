'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trash2, MessageSquare, Loader2, RefreshCw } from 'lucide-react'

interface Topic {
  id: number
  title: string
  tg_chat_id: number
}

interface Props {
  orgId: string
  tgChatId: number
  isForum: boolean
  onForumToggle?: (isForum: boolean) => void
}

export default function ForumTopicsManager({ orgId, tgChatId, isForum, onForumToggle }: Props) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

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

  const handleDelete = async (topicId: number) => {
    setSaving(true)
    setError(null)
    try {
      const updated = topics.filter(t => t.id !== topicId)
      const res = await fetch('/api/telegram/groups/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, tgChatId, topics: updated }),
      })
      if (res.ok) {
        setSuccessMsg('Топик удалён')
        setTimeout(() => setSuccessMsg(null), 2000)
        await loadTopics()
      } else {
        const d = await res.json()
        setError(d.error || 'Ошибка при удалении')
      }
    } catch {
      setError('Ошибка соединения')
    } finally {
      setSaving(false)
    }
  }

  const toggleForum = async () => {
    try {
      const res = await fetch('/api/telegram/groups/forum-flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, tgChatId, isForum: !isForum }),
      })
      if (res.ok) {
        onForumToggle?.(!isForum)
        if (!isForum) loadTopics()
      }
    } catch {}
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-600" />
          Форум-топики
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="is-forum"
            checked={isForum}
            onChange={toggleForum}
            className="w-4 h-4 accent-indigo-600"
          />
          <Label htmlFor="is-forum" className="cursor-pointer">
            Группа использует форум-топики
          </Label>
        </div>

        {isForum && (
          <>
            <p className="text-xs text-gray-500">
              Топики определяются автоматически при любой активности в них после добавления бота Orbo в группу.
              Если топик не отображается — напишите в него любое сообщение, и он появится здесь.
            </p>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Загрузка...
              </div>
            ) : (
              <div className="space-y-2">
                {topics.length === 0 && (
                  <p className="text-sm text-gray-400 italic">Нет обнаруженных топиков</p>
                )}
                {topics.map(t => (
                  <div key={t.id} className="flex items-center gap-2 py-1">
                    <span className="text-xs text-gray-400 w-12 shrink-0">ID: {t.id}</span>
                    <span className="text-sm text-gray-700 truncate flex-1">
                      {t.title || `Тема ${t.id}`}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-600"
                      onClick={() => handleDelete(t.id)}
                      disabled={saving}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {topics.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-gray-500"
                onClick={loadTopics}
                disabled={loading}
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                Обновить список
              </Button>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
            {successMsg && <p className="text-xs text-green-600">{successMsg}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
