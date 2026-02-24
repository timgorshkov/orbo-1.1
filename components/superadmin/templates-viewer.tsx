'use client'

import { useState, useEffect, useRef } from 'react'

interface Template {
  stepKey: string
  label: string
  channel: 'email' | 'telegram'
  stepNumber: number
  delayLabel: string
  subject?: string
  bodyHtml?: string
  bodyText?: string
  skipCondition?: string
}

export default function TemplatesViewer() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [selected, setSelected] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    fetch('/api/superadmin/templates')
      .then(r => r.json())
      .then(data => {
        const tpls = data.templates || []
        setTemplates(tpls)
        if (tpls.length > 0) setSelected(tpls[0])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const emailTemplates = templates.filter(t => t.channel === 'email')
  const tgTemplates = templates.filter(t => t.channel === 'telegram')

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Загрузка шаблонов...</div>
  }

  if (templates.length === 0) {
    return <div className="text-center py-12 text-gray-500">Шаблоны не найдены</div>
  }

  const tgBodyToHtml = (text: string) =>
    text.replace(/\n/g, '<br/>')

  return (
    <div className="flex gap-6" style={{ height: 'calc(100vh - 220px)' }}>
      {/* Left panel: template list */}
      <div className="w-80 flex-shrink-0 overflow-y-auto space-y-5 pr-2">
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-xs">✉</span>
            Email-цепочка
          </h3>
          <div className="space-y-1">
            {emailTemplates.map(t => (
              <TemplateItem
                key={`${t.channel}-${t.stepKey}`}
                template={t}
                isSelected={selected?.stepKey === t.stepKey && selected?.channel === t.channel}
                onClick={() => setSelected(t)}
              />
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-sky-100 text-sky-600 flex items-center justify-center text-xs">✈</span>
            Telegram-цепочка
          </h3>
          <div className="space-y-1">
            {tgTemplates.map(t => (
              <TemplateItem
                key={`${t.channel}-${t.stepKey}`}
                template={t}
                isSelected={selected?.stepKey === t.stepKey && selected?.channel === t.channel}
                onClick={() => setSelected(t)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right panel: preview */}
      <div className="flex-1 border rounded-xl overflow-hidden bg-white flex flex-col min-w-0">
        {selected ? (
          <>
            {/* Header */}
            <div className="px-5 py-3 bg-gray-50 border-b flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                selected.channel === 'email'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-sky-100 text-sky-700'
              }`}>
                {selected.channel === 'email' ? 'Email' : 'Telegram'}
              </span>
              <span className="text-sm font-medium text-gray-800">
                #{selected.stepNumber} {selected.label}
              </span>
              <span className="text-xs text-gray-400 ml-auto">{selected.delayLabel}</span>
            </div>
            {selected.subject && (
              <div className="px-5 py-2 bg-white border-b">
                <span className="text-xs text-gray-400">Тема:</span>{' '}
                <span className="text-sm font-medium text-gray-700">{selected.subject}</span>
              </div>
            )}
            {selected.skipCondition && (
              <div className="px-5 py-1.5 bg-amber-50 border-b text-xs text-amber-700">
                ⚡ Пропуск, если: {selected.skipCondition}
              </div>
            )}

            {/* Preview body */}
            <div className="flex-1 overflow-auto">
              {selected.channel === 'email' && selected.bodyHtml ? (
                <iframe
                  ref={iframeRef}
                  srcDoc={selected.bodyHtml}
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin"
                  title="Email preview"
                />
              ) : selected.channel === 'telegram' && selected.bodyText ? (
                <div className="p-6" style={{ background: '#e8dfd2' }}>
                  <div className="max-w-md">
                    {/* Telegram-like message bubble */}
                    <div className="bg-white rounded-xl rounded-tl-sm p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">O</div>
                        <span className="text-sm font-semibold text-purple-700">Orbo Start Bot</span>
                      </div>
                      <div
                        className="text-sm leading-relaxed text-gray-800"
                        dangerouslySetInnerHTML={{ __html: tgBodyToHtml(selected.bodyText) }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Нет содержимого
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Выберите шаблон из списка
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateItem({
  template: t,
  isSelected,
  onClick,
}: {
  template: Template
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition ${
        isSelected
          ? 'bg-purple-100 text-purple-900 font-medium ring-1 ring-purple-200'
          : 'hover:bg-gray-50 text-gray-700'
      }`}
    >
      <div className="flex justify-between items-center">
        <span className="truncate">
          <span className="text-gray-400 mr-1">#{t.stepNumber}</span>
          {t.label}
        </span>
        <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{t.delayLabel}</span>
      </div>
      {t.subject && (
        <p className="text-xs text-gray-500 truncate mt-0.5">{t.subject}</p>
      )}
      {t.skipCondition && (
        <p className="text-xs text-amber-600 mt-0.5">⚡ {t.skipCondition}</p>
      )}
    </button>
  )
}
