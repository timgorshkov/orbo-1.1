'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Settings, LayoutGrid, AlertTriangle, Plus, Share2, Copy, Check, ExternalLink, MessageCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PipelineHeaderProps {
  orgId: string
  pipelineId: string
  pipelineName: string
  pipelineType: string
  telegramGroupName?: string | null
  hasForm: boolean
  /** Передаётся только если у воронки ровно одна форма */
  formId?: string | null
  /** MAX mini-app ссылка — только если у воронки одна форма и MAX подключён */
  maxFormLink?: string | null
}

export default function PipelineHeader({
  orgId,
  pipelineId,
  pipelineName,
  pipelineType,
  telegramGroupName,
  hasForm,
  formId,
  maxFormLink,
}: PipelineHeaderProps) {
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedMax, setCopiedMax] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'orbo_community_bot'
  const telegramLink = formId ? `https://t.me/${botUsername}?startapp=apply-${formId}` : null

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setShareOpen(false)
      }
    }
    if (shareOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [shareOpen])

  const copyLink = async (text: string, type: 'tg' | 'max') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'tg') {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } else {
        setCopiedMax(true)
        setTimeout(() => setCopiedMax(false), 2000)
      }
    } catch {}
  }

  return (
    <div className="flex-shrink-0 border-b bg-white">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/p/${orgId}/applications`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                {pipelineName}
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  pipelineType === 'join_request' 
                    ? 'bg-green-100 text-green-700'
                    : pipelineType === 'service'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-neutral-100 text-neutral-700'
                }`}>
                  {pipelineType === 'join_request' ? 'Вступление' 
                    : pipelineType === 'service' ? 'Услуги' 
                    : 'Кастомная'}
                </span>
              </h1>
              {telegramGroupName && (
                <p className="text-sm text-neutral-500">Группа: {telegramGroupName}</p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Share button — only when exactly one form exists */}
            {formId && telegramLink && (
              <div className="relative">
                <button
                  ref={triggerRef}
                  onClick={() => setShareOpen(!shareOpen)}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3"
                >
                  <Share2 className="h-4 w-4" />
                  Поделиться
                </button>
                {shareOpen && (
                  <div
                    ref={popoverRef}
                    className="absolute right-0 top-full mt-2 w-72 bg-white rounded-lg border border-gray-200 shadow-lg z-50"
                  >
                    <div className="p-2">
                      <p className="px-2 py-1.5 text-xs text-gray-500">
                        Поделиться ссылкой на форму
                      </p>
                      <div className="h-px bg-gray-100 my-1" />

                      {/* Copy Telegram link */}
                      <button
                        onClick={() => copyLink(telegramLink!, 'tg')}
                        className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 transition-colors text-left"
                      >
                        <div className="flex-shrink-0 w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center">
                          <MessageCircle className="h-4 w-4 text-sky-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">Telegram MiniApp</p>
                          <p className="text-xs text-gray-500 truncate">{telegramLink}</p>
                        </div>
                        <div className="flex-shrink-0">
                          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-400" />}
                        </div>
                      </button>

                      {/* Copy MAX link */}
                      {maxFormLink && (
                        <button
                          onClick={() => copyLink(maxFormLink!, 'max')}
                          className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 transition-colors text-left"
                        >
                          <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                            <Send className="h-4 w-4 text-indigo-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">MAX MiniApp</p>
                            <p className="text-xs text-gray-500 truncate">{maxFormLink}</p>
                          </div>
                          <div className="flex-shrink-0">
                            {copiedMax ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-400" />}
                          </div>
                        </button>
                      )}

                      <div className="h-px bg-gray-100 my-1" />

                      {/* Open in Telegram */}
                      <a
                        href={telegramLink!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4 text-gray-400" />
                        <span className="text-sm">Открыть в Telegram</span>
                      </a>

                      {/* Open in MAX */}
                      {maxFormLink && (
                        <a
                          href={maxFormLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 transition-colors"
                        >
                          <ExternalLink className="h-4 w-4 text-gray-400" />
                          <span className="text-sm">Открыть в MAX</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Manage Forms */}
            <Link href={hasForm
              ? `/p/${orgId}/applications/pipelines/${pipelineId}/forms`
              : `/p/${orgId}/applications/pipelines/${pipelineId}/forms/new`
            }>
              <Button variant="outline" size="sm">
                {hasForm ? (
                  <>
                    <LayoutGrid className="w-4 h-4 mr-1" />
                    Управление формами
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-1" />
                    Создать форму
                  </>
                )}
              </Button>
            </Link>
            
            {/* Settings */}
            <Link href={`/p/${orgId}/applications/pipelines/${pipelineId}/settings`}>
              <Button variant="ghost" size="icon">
                <Settings className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
      
      {/* No forms warning banner */}
      {!hasForm && !bannerDismissed && (
        <div className="px-6 pb-4">
          <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                У этой воронки нет формы заявки
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Без формы пользователи не смогут подавать заявки. Создайте форму, чтобы воронка начала работать.
              </p>
            </div>
            <Link href={`/p/${orgId}/applications/pipelines/${pipelineId}/forms/new`}>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                <Plus className="w-4 h-4 mr-1" />
                Создать форму
              </Button>
            </Link>
            <button 
              onClick={() => setBannerDismissed(true)}
              className="text-amber-600 hover:text-amber-800 text-sm px-2"
              title="Скрыть"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
