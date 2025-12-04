'use client'

import { useState } from 'react'
import { renderTelegramMarkdownText } from '@/lib/utils/telegramMarkdown'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'

interface TelegramMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export default function TelegramMarkdownEditor({
  value,
  onChange,
  placeholder = 'Расскажите о событии...',
  className = ''
}: TelegramMarkdownEditorProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit')

  return (
    <div className={className}>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'preview')}>
        <TabsList className="mb-3">
          <TabsTrigger value="edit">Редактор</TabsTrigger>
          <TabsTrigger value="preview">Предпросмотр</TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="mt-0">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full min-h-[200px] p-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
          <div className="mt-2 text-xs text-neutral-500">
            <p className="mb-1">Поддерживается Telegram Markdown:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li><code>**жирный**</code> или <code>__жирный__</code></li>
              <li><code>*курсив*</code> или <code>_курсив_</code></li>
              <li><code>~~зачеркнутый~~</code></li>
              <li><code>||скрытый текст||</code></li>
              <li><code>`код`</code></li>
              <li><code>[ссылка](https://example.com)</code></li>
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="mt-0">
          <Card>
            <CardContent className="p-4 min-h-[200px]">
              {value ? (
                <div className="prose prose-sm max-w-none">
                  {renderTelegramMarkdownText(value)}
                </div>
              ) : (
                <p className="text-neutral-400 italic">{placeholder}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

