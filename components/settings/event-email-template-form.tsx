'use client'

/**
 * Event Email Template Editor — lets owners/admins customise the confirmation
 * email + Telegram DM that participants receive after registering for events.
 *
 * Layout: two-column. Left — fields (subject + body markdown + QR instruction).
 * Right — live preview rendered server-side via /preview endpoint, refreshed on
 * every change (debounced).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Send, RotateCcw, Eye, Bold, Italic, Link as LinkIcon, ListOrdered, List, Plus } from 'lucide-react'

interface Template {
  subject: string
  bodyMarkdown: string
  qrInstructionMarkdown: string
}

interface VarOption {
  key: string
  label: string
}

const VARIABLES: VarOption[] = [
  { key: 'event.title', label: 'Название события' },
  { key: 'event.date', label: 'Дата события' },
  { key: 'event.time', label: 'Время начала' },
  { key: 'event.endTime', label: 'Время окончания' },
  { key: 'event.location', label: 'Место (или «Онлайн»)' },
  { key: 'event.url', label: 'Ссылка на событие' },
  { key: 'participant.name', label: 'Имя участника' },
  { key: 'org.name', label: 'Название организации' },
  { key: 'ticket.shortCode', label: 'Короткий код билета' },
  { key: 'ticket.amount', label: 'Сумма оплаты' },
]

const CONDITIONAL_BLOCKS = [
  { snippet: '{{#if ticket.paid}}\nОплачено: {{ticket.amount}} ₽\n{{/if}}', label: 'Если оплачено' },
  { snippet: '{{#unless ticket.paid}}\nБилет ещё не оплачен.\n{{/unless}}', label: 'Если НЕ оплачено' },
  { snippet: '{{#if ticket.requiresPayment}}\n…только для платных событий…\n{{/if}}', label: 'Только для платного события' },
]

export default function EventEmailTemplateForm({ orgId }: { orgId: string }) {
  const [template, setTemplate] = useState<Template | null>(null)
  const [isDefault, setIsDefault] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Preview
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [previewSubject, setPreviewSubject] = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewPaid, setPreviewPaid] = useState(true)
  const [previewHasQr, setPreviewHasQr] = useState(true)

  const [showTestDialog, setShowTestDialog] = useState(false)
  const [testEmail, setTestEmail] = useState<string>('')
  const [testSending, setTestSending] = useState(false)

  // Active textarea ref — for inserting variables at cursor position
  const activeTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const subjectRef = useRef<HTMLInputElement | null>(null)
  const [activeField, setActiveField] = useState<'subject' | 'body' | 'qr' | null>(null)

  // Load template
  useEffect(() => {
    fetch(`/api/organizations/${orgId}/event-email-template`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Не удалось загрузить шаблон')
        const data = await res.json()
        setTemplate(data.template)
        setIsDefault(data.isDefault)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [orgId])

  // Refresh preview (debounced)
  const refreshPreview = useCallback(async (tpl: Template) => {
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/organizations/${orgId}/event-email-template/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tpl, paid: previewPaid, hasQr: previewHasQr }),
      })
      if (!res.ok) throw new Error('Не удалось построить превью')
      const data = await res.json()
      setPreviewHtml(data.html)
      setPreviewSubject(data.subject)
    } catch (e: any) {
      setError(e.message || 'Ошибка превью')
    } finally {
      setPreviewLoading(false)
    }
  }, [orgId, previewPaid, previewHasQr])

  useEffect(() => {
    if (!template) return
    const timer = setTimeout(() => { refreshPreview(template) }, 400)
    return () => clearTimeout(timer)
  }, [template, refreshPreview])

  const updateField = (field: keyof Template, value: string) => {
    if (!template) return
    setTemplate({ ...template, [field]: value })
    setSuccess(null)
  }

  const insertAtCursor = (text: string) => {
    if (activeField === 'subject' && subjectRef.current && template) {
      const el = subjectRef.current
      const start = el.selectionStart ?? template.subject.length
      const end = el.selectionEnd ?? template.subject.length
      const newVal = template.subject.slice(0, start) + text + template.subject.slice(end)
      updateField('subject', newVal)
      setTimeout(() => {
        el.focus()
        el.setSelectionRange(start + text.length, start + text.length)
      }, 0)
      return
    }

    const el = activeTextareaRef.current
    if (!el || !template) return
    const fieldKey = activeField === 'qr' ? 'qrInstructionMarkdown' : 'bodyMarkdown'
    const current = template[fieldKey]
    const start = el.selectionStart
    const end = el.selectionEnd
    const newVal = current.slice(0, start) + text + current.slice(end)
    updateField(fieldKey, newVal)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + text.length, start + text.length)
    }, 0)
  }

  const wrapSelection = (before: string, after: string = before) => {
    const el = activeTextareaRef.current
    if (!el || !template) return
    const fieldKey = activeField === 'qr' ? 'qrInstructionMarkdown' : 'bodyMarkdown'
    const current = template[fieldKey]
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = current.slice(start, end) || 'текст'
    const newVal = current.slice(0, start) + before + selected + after + current.slice(end)
    updateField(fieldKey, newVal)
    setTimeout(() => {
      el.focus()
      const cursorStart = start + before.length
      el.setSelectionRange(cursorStart, cursorStart + selected.length)
    }, 0)
  }

  const save = async () => {
    if (!template) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/organizations/${orgId}/event-email-template`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || 'Не удалось сохранить')
      }
      const data = await res.json()
      setIsDefault(!!data.isDefault)
      setSuccess('Шаблон сохранён.')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const resetToDefault = async () => {
    if (!confirm('Сбросить шаблон к стандартному? Текущие правки будут потеряны.')) return
    setResetting(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/organizations/${orgId}/event-email-template`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      })
      if (!res.ok) throw new Error('Не удалось сбросить')

      // Reload defaults
      const r2 = await fetch(`/api/organizations/${orgId}/event-email-template`)
      const data = await r2.json()
      setTemplate(data.template)
      setIsDefault(true)
      setSuccess('Шаблон сброшен к стандартному.')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setResetting(false)
    }
  }

  const sendTest = async () => {
    if (!template) return
    if (!testEmail) {
      setError('Укажите email получателя')
      return
    }
    setTestSending(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/organizations/${orgId}/event-email-template/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...template, to: testEmail, paid: previewPaid, hasQr: previewHasQr }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось отправить')
      setSuccess(`Тестовое письмо отправлено на ${data.to}.`)
      setShowTestDialog(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setTestSending(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
        </CardContent>
      </Card>
    )
  }

  if (!template) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-red-600">
          {error || 'Не удалось загрузить шаблон'}
        </CardContent>
      </Card>
    )
  }

  const isBodyOrQr = activeField === 'body' || activeField === 'qr'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Письмо участнику после регистрации</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Шаблон используется для email и личного сообщения в Telegram. Поддерживает
              переменные <code className="bg-gray-100 px-1 rounded">{'{{event.title}}'}</code> и условные блоки
              <code className="bg-gray-100 px-1 rounded ml-1">{'{{#if ticket.paid}}…{{/if}}'}</code>.
            </p>
          </div>
          {isDefault && (
            <span className="flex-shrink-0 text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">Стандартный</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Editor */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Тема письма</label>
              <input
                ref={subjectRef}
                type="text"
                value={template.subject}
                onChange={(e) => updateField('subject', e.target.value)}
                onFocus={() => setActiveField('subject')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                placeholder="Регистрация: {{event.title}}"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Тело письма</label>
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-1 px-2 py-1 border border-gray-200 rounded-t-lg bg-gray-50 text-xs">
                <button type="button" onClick={() => wrapSelection('**')} className="p-1 hover:bg-gray-200 rounded" title="Жирный" disabled={!isBodyOrQr}><Bold className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => wrapSelection('*')} className="p-1 hover:bg-gray-200 rounded" title="Курсив" disabled={!isBodyOrQr}><Italic className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => wrapSelection('[', '](https://)')} className="p-1 hover:bg-gray-200 rounded" title="Ссылка" disabled={!isBodyOrQr}><LinkIcon className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => insertAtCursor('\n- ')} className="p-1 hover:bg-gray-200 rounded" title="Маркированный список" disabled={!isBodyOrQr}><List className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => insertAtCursor('\n1. ')} className="p-1 hover:bg-gray-200 rounded" title="Нумерованный список" disabled={!isBodyOrQr}><ListOrdered className="w-3.5 h-3.5" /></button>
                <span className="mx-1 h-4 w-px bg-gray-300" />
                <details className="relative">
                  <summary className="cursor-pointer p-1 hover:bg-gray-200 rounded list-none flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Переменная
                  </summary>
                  <div className="absolute z-10 mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-1 max-h-64 overflow-auto min-w-[260px]">
                    {VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={(e) => { e.preventDefault(); insertAtCursor(`{{${v.key}}}`) }}
                        className="block w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 rounded"
                      >
                        <code className="text-gray-900 font-mono">{`{{${v.key}}}`}</code>
                        <span className="text-gray-500 ml-2">{v.label}</span>
                      </button>
                    ))}
                    <div className="border-t border-gray-100 my-1" />
                    {CONDITIONAL_BLOCKS.map((b) => (
                      <button
                        key={b.label}
                        type="button"
                        onClick={(e) => { e.preventDefault(); insertAtCursor(b.snippet) }}
                        className="block w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 rounded text-gray-700"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
              <textarea
                value={template.bodyMarkdown}
                onChange={(e) => updateField('bodyMarkdown', e.target.value)}
                onFocus={(e) => { setActiveField('body'); activeTextareaRef.current = e.currentTarget }}
                rows={12}
                className="w-full px-3 py-2 border border-t-0 border-gray-300 rounded-b-lg text-sm font-mono"
                placeholder="Markdown с переменными в фигурных скобках"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Текст под QR-кодом</label>
              <textarea
                value={template.qrInstructionMarkdown}
                onChange={(e) => updateField('qrInstructionMarkdown', e.target.value)}
                onFocus={(e) => { setActiveField('qr'); activeTextareaRef.current = e.currentTarget }}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                placeholder="Например: «Если QR не считается — назовите код {{ticket.shortCode}}»"
              />
              <p className="text-xs text-gray-500 mt-1">
                Показывается только если QR-код включён для события.
              </p>
            </div>
          </div>

          {/* Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                <Eye className="w-4 h-4" /> Превью email
              </span>
              {previewLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
            </div>
            <div className="flex items-center gap-3 mb-2 text-xs text-gray-600">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={previewPaid} onChange={(e) => setPreviewPaid(e.target.checked)} />
                Оплачен
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={previewHasQr} onChange={(e) => setPreviewHasQr(e.target.checked)} />
                С QR-кодом
              </label>
            </div>
            {previewSubject && (
              <div className="mb-2 px-3 py-2 bg-gray-50 rounded-t-lg text-xs">
                <span className="text-gray-500">Тема: </span>
                <span className="text-gray-900 font-medium">{previewSubject}</span>
              </div>
            )}
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white" style={{ height: 600 }}>
              <iframe
                srcDoc={previewHtml}
                title="Email preview"
                className="w-full h-full border-0"
                sandbox=""
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Сохранить
          </Button>
          <Button variant="outline" onClick={() => setShowTestDialog(true)}>
            <Send className="w-4 h-4 mr-2" />
            Отправить тестовое письмо
          </Button>
          {!isDefault && (
            <Button variant="outline" onClick={resetToDefault} disabled={resetting} className="ml-auto text-red-600 hover:text-red-700 hover:bg-red-50">
              {resetting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              Сбросить к стандартному
            </Button>
          )}
        </div>
      </CardContent>

      {/* Test email dialog */}
      {showTestDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Отправить тестовое письмо</h3>
            <p className="text-sm text-gray-500 mb-3">
              Письмо будет отправлено с темой «[ТЕСТ] …» и подставленными примерами данных.
            </p>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTestDialog(false)} disabled={testSending}>Отмена</Button>
              <Button onClick={sendTest} disabled={testSending || !testEmail}>
                {testSending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Отправить
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
