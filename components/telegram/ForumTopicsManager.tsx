'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, Save, MessageSquare, Loader2 } from 'lucide-react'

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
  const [newId, setNewId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [editMap, setEditMap] = useState<Record<number, string>>({})
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
        const list = (data.topics || []) as Topic[]
        setTopics(list)
        const map: Record<number, string> = {}
        list.forEach(t => { map[t.id] = t.title })
        setEditMap(map)
      }
    } finally {
      setLoading(false)
    }
  }

  const saveTopics = async (updatedTopics: Topic[]) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/telegram/groups/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, tgChatId, topics: updatedTopics }),
      })
      if (res.ok) {
        setSuccessMsg('Топики сохранены')
        setTimeout(() => setSuccessMsg(null), 2000)
        await loadTopics()
      } else {
        const d = await res.json()
        setError(d.error || 'Ошибка при сохранении')
      }
    } catch {
      setError('Ошибка соединения')
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = async () => {
    const id = parseInt(newId)
    if (!id || !newTitle.trim()) {
      setError('Укажите ID и название топика')
      return
    }
    if (topics.some(t => t.id === id)) {
      setError('Топик с таким ID уже добавлен')
      return
    }
    const updated = [...topics, { id, tg_chat_id: tgChatId, title: newTitle.trim() }]
    setNewId('')
    setNewTitle('')
    await saveTopics(updated)
  }

  const handleDelete = async (topicId: number) => {
    const updated = topics.filter(t => t.id !== topicId)
    await saveTopics(updated)
  }

  const handleRename = async (topicId: number) => {
    const newName = editMap[topicId]?.trim()
    if (!newName) return
    const updated = topics.map(t => t.id === topicId ? { ...t, title: newName } : t)
    await saveTopics(updated)
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
              Добавьте топики с их ID из Telegram. ID топика можно узнать, нажав на тему в группе —
              в URL или в информации о сообщении будет указан номер.
            </p>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Загрузка...
              </div>
            ) : (
              <div className="space-y-2">
                {topics.length === 0 && (
                  <p className="text-sm text-gray-400 italic">Нет добавленных топиков</p>
                )}
                {topics.map(t => (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-12 shrink-0">ID: {t.id}</span>
                    <Input
                      value={editMap[t.id] ?? t.title}
                      onChange={e => setEditMap(prev => ({ ...prev, [t.id]: e.target.value }))}
                      onBlur={() => handleRename(t.id)}
                      onKeyDown={e => e.key === 'Enter' && handleRename(t.id)}
                      className="h-7 text-sm"
                      placeholder="Название топика"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-600"
                      onClick={() => handleDelete(t.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new topic */}
            <div className="flex gap-2 items-end pt-1 border-t">
              <div>
                <Label className="text-xs">ID топика</Label>
                <Input
                  value={newId}
                  onChange={e => setNewId(e.target.value)}
                  placeholder="67"
                  className="h-7 text-sm w-20"
                  type="number"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">Название</Label>
                <Input
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="Вакансии"
                  className="h-7 text-sm"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={handleAdd}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Добавить
              </Button>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
            {successMsg && <p className="text-xs text-green-600">{successMsg}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
