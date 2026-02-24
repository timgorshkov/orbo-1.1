'use client'

import { useBotStatus } from '@/lib/hooks/useBotStatus'

const ASSIST_BOT_USERNAME = 'orbo_assist_bot'

interface AssistBotBannerProps {
  orgId: string
  compact?: boolean
}

/**
 * Shows a banner prompting users to start @orbo_assist_bot
 * when their Telegram is linked but the notifications bot hasn't been started.
 */
export default function AssistBotBanner({ orgId, compact = false }: AssistBotBannerProps) {
  const { telegramLinked, assistBotStarted, loading } = useBotStatus(orgId)

  if (loading || assistBotStarted || !telegramLinked) return null

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
        <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span className="text-amber-800">
          Для получения уведомлений в Telegram{' '}
          <a
            href={`https://t.me/${ASSIST_BOT_USERNAME}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline hover:text-amber-900"
          >
            запустите @{ASSIST_BOT_USERNAME}
          </a>
        </span>
      </div>
    )
  }

  return (
    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-amber-900">
            Запустите бота уведомлений
          </h3>
          <p className="text-sm text-amber-700 mt-1">
            Для получения уведомлений о событиях в сообществе через Telegram запустите бота @{ASSIST_BOT_USERNAME}. 
            Без этого уведомления не смогут быть доставлены вам в личные сообщения.
          </p>
          <a
            href={`https://t.me/${ASSIST_BOT_USERNAME}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            Открыть @{ASSIST_BOT_USERNAME}
          </a>
        </div>
      </div>
    </div>
  )
}
