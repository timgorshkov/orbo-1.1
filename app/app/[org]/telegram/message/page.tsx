'use client'

import { useState, useEffect } from 'react'
import AppShell from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClientBrowser } from '@/lib/client/supabaseClient'

type TelegramGroupOption = {
  id: number
  tg_chat_id: string
  title: string | null
}

type TelegramTopicOption = {
  id: string
  title: string
}

export default function SendMessagePage({ params }: { params: { org: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [message, setMessage] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [selectedTopic, setSelectedTopic] = useState<string>('')
  const [groups, setGroups] = useState<TelegramGroupOption[]>([])
  const [topics, setTopics] = useState<TelegramTopicOption[]>([])
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const loadTopics = async (chatId: string) => {
    if (!chatId) {
      setTopics([])
      setSelectedTopic('')
      return
    }

    setTopicsLoading(true)

    try {
      const supabase = createClientBrowser()
      const numericChatId = Number(chatId)
      const chatFilter = Number.isFinite(numericChatId) ? numericChatId : chatId

      const { data, error } = await supabase
        .from('telegram_topics')
        .select('id, title, tg_chat_id')
        .eq('tg_chat_id', chatFilter)
        .order('title', { ascending: true })

      const inferFromActivityEvents = async () => {
        try {
          const { data: activityRows, error: activityError } = await supabase
            .from('telegram_activity_events')
            .select('message_thread_id, thread_title, meta')
            .eq('tg_chat_id', chatFilter)
            .order('created_at', { ascending: false })
            .limit(200)

          if (activityError) {
            if (activityError.code !== '42P01') {
              console.error('Error inferring topics from activity events:', activityError)
            }
            return { topics: [] as TelegramTopicOption[], generalEntry: null as TelegramTopicOption | null, onlyGeneral: false }
          }

          const topicMap = new Map<string, string>()
          let generalTitle: string | null = null
          let hasGeneral = false

          ;(activityRows || []).forEach(row => {
            const meta = (row as any)?.meta || {}
            const threadIdRaw = row?.message_thread_id ?? meta?.message_thread_id ?? null
            const threadTitle = (row?.thread_title ?? meta?.thread_title)?.toString().trim() || null

            if (threadIdRaw == null) {
              hasGeneral = true
              if (!generalTitle && threadTitle) {
                generalTitle = threadTitle
              }
              return
            }

            const key = String(threadIdRaw)
            if (!topicMap.has(key)) {
              topicMap.set(key, threadTitle || `Тема ${key}`)
            }
          })

          const topics = Array.from(topicMap.entries()).map(([id, title]) => ({ id, title }))
          const generalEntry = hasGeneral && topics.length > 0 ? { id: 'null', title: generalTitle || 'Основной канал' } : null
          const onlyGeneral = hasGeneral && topics.length === 0

          return { topics, generalEntry, onlyGeneral }
        } catch (activityException) {
          console.error('Unexpected error inferring topics from activity events:', activityException)
          return { topics: [] as TelegramTopicOption[], generalEntry: null as TelegramTopicOption | null, onlyGeneral: false }
        }
      }

      const activityFallback = await inferFromActivityEvents()

      if (error) {
        if (error.code !== 'PGRST205' && error.code !== '42P01' && error.code !== 'PGRST202') {
          console.error('Error loading telegram topics:', error)
        }

        if (activityFallback.onlyGeneral) {
          setTopics([])
          setSelectedTopic('')
          return
        }

        if (activityFallback.generalEntry && activityFallback.topics.length > 0) {
          setTopics([activityFallback.generalEntry, ...activityFallback.topics])
          setSelectedTopic(activityFallback.generalEntry.id)
          return
        }

        if (activityFallback.topics.length > 0) {
          setTopics(activityFallback.topics)
          setSelectedTopic(activityFallback.topics[0].id)
        } else {
          setTopics([])
          setSelectedTopic('')
        }
        return
      }

      let topicOptions: TelegramTopicOption[] = (data || []).map(topic => ({
        id: String(topic.id),
        title: topic.title || `Тема ${topic.id}`
      }))

      if (activityFallback.topics.length > 0) {
        const existingIds = new Set(topicOptions.map(topic => topic.id))
        activityFallback.topics.forEach(topic => {
          if (!existingIds.has(topic.id)) {
            topicOptions.push(topic)
          }
        })
      }

      if (activityFallback.generalEntry && topicOptions.length > 0) {
        topicOptions = [activityFallback.generalEntry, ...topicOptions]
      }

      if (topicOptions.length === 1 && topicOptions[0].id === 'null') {
        setTopics([])
        setSelectedTopic('')
        return
      }

      if (topicOptions.length === 0 && activityFallback.onlyGeneral) {
        setTopics([])
        setSelectedTopic('')
        return
      }

      if (topicOptions.length === 0) {
        setTopics([])
        setSelectedTopic('')
        return
      }

      setTopics(topicOptions)
      setSelectedTopic(topicOptions[0]?.id ?? '')
    } catch (topicsException) {
      console.error('Unexpected error loading telegram topics:', topicsException)
      setTopics([])
      setSelectedTopic('')
    } finally {
      setTopicsLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false

    const loadGroups = async () => {
      let normalized: TelegramGroupOption[] = []

      try {
        const response = await fetch(`/api/telegram/groups/for-user?orgId=${encodeURIComponent(params.org)}&includeExisting=true`, {
          cache: 'no-store'
        })

        if (!response.ok) {
          throw new Error('Failed to load groups from API')
        }

        const payload = await response.json()

        normalized = (payload?.groups || []).map((group: any) => ({
          id: group.id,
          tg_chat_id: String(group.tg_chat_id),
          title: group.title ?? null
        }))
      } catch (apiError) {
        console.error('Error loading telegram groups for messaging:', apiError)
        normalized = []
      }

      if (ignore) {
        return
      }

      setGroups(normalized)

      const preselectedGroupId = searchParams?.get('groupId')
      if (preselectedGroupId && normalized.length > 0) {
        const matched = normalized.find(group => String(group.id) === preselectedGroupId || group.tg_chat_id === preselectedGroupId)
        if (matched) {
          setSelectedGroup(matched.tg_chat_id)
          void loadTopics(matched.tg_chat_id)
        }
      }
    }

    loadGroups()

    return () => {
      ignore = true
    }
  }, [params.org, searchParams])

  const handleSelectGroup = (value: string) => {
    setSelectedGroup(value)
    setSelectedTopic('')
    if (value) {
      void loadTopics(value)
    } else {
      setTopics([])
    }
  }

  const handleSendMessage = async () => {
    if (!message || !selectedGroup) {
      setError('Необходимо выбрать группу и ввести сообщение')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const chatIdNumeric = Number(selectedGroup)
      const payload: Record<string, any> = {
        orgId: params.org,
        chatId: Number.isFinite(chatIdNumeric) ? chatIdNumeric : selectedGroup,
        message
      }

      if (selectedTopic && selectedTopic !== 'null') {
        const topicNumeric = Number(selectedTopic)
        payload.topicId = Number.isFinite(topicNumeric) ? topicNumeric : selectedTopic
      }

      const response = await fetch('/api/telegram/bot/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Ошибка при отправке сообщения')
      }

      setSuccess(true)
      setMessage('')
    } catch (e: any) {
      setError(e.message || 'Произошла ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell orgId={params.org} currentPath={`/app/${params.org}/telegram`}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Отправить сообщение</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Отправка сообщения в Telegram</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-neutral-600 block mb-2">
              Выберите группу
            </label>
            <select
              className="w-full p-2 border rounded-lg"
              value={selectedGroup}
              onChange={(e) => handleSelectGroup(e.target.value)}
            >
              <option value="">Выберите группу</option>
              {groups.map(group => (
                <option key={`${group.id}-${group.tg_chat_id}`} value={group.tg_chat_id}>
                  {group.title || `Группа ${group.tg_chat_id}`}
                </option>
              ))}
            </select>
          </div>

          {topics.length > 0 && (
            <div>
              <label className="text-sm text-neutral-600 block mb-2">
                Выберите тему
              </label>
              <select
                className="w-full p-2 border rounded-lg"
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                disabled={topicsLoading}
              >
                {topics.map(topic => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-sm text-neutral-600 block mb-2">
              Текст сообщения
            </label>
            <textarea
              className="w-full p-2 border rounded-lg min-h-[100px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Введите текст сообщения..."
            />
            <p className="text-xs text-neutral-500 mt-1">
              Поддерживается HTML-форматирование: &lt;b&gt;жирный&lt;/b&gt;, &lt;i&gt;курсив&lt;/i&gt;, &lt;a href="..."&gt;ссылка&lt;/a&gt;
            </p>
          </div>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          {success && (
            <div className="text-green-500 text-sm">
              Сообщение успешно отправлено!
            </div>
          )}

          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => router.push(`/app/${params.org}/telegram`)}
            >
              Назад
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={loading || !selectedGroup || !message}
            >
              {loading ? 'Отправка...' : 'Отправить сообщение'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  )
}
