'use client'

import { useEffect, useRef } from 'react'

/**
 * Данные пользователя от Telegram Login Widget
 */
export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export interface TelegramLoginProps {
  /** Username бота (без @), например: 'your_bot' */
  botUsername: string
  /** Callback при успешной авторизации */
  onAuth: (user: TelegramUser) => void | Promise<void>
  /** Размер кнопки */
  buttonSize?: 'large' | 'medium' | 'small'
  /** Радиус закругления углов */
  cornerRadius?: number
  /** Запрашивать доступ к отправке сообщений */
  requestAccess?: boolean
  /** Язык кнопки */
  lang?: string
}

/**
 * Компонент авторизации через Telegram Login Widget
 * 
 * @see https://core.telegram.org/widgets/login
 * 
 * @example
 * ```tsx
 * <TelegramLogin
 *   botUsername="your_bot"
 *   onAuth={async (user) => {
 *     const res = await fetch('/api/auth/telegram', {
 *       method: 'POST',
 *       body: JSON.stringify({ telegramData: user })
 *     })
 *     // handle response
 *   }}
 * />
 * ```
 */
export default function TelegramLogin({
  botUsername,
  onAuth,
  buttonSize = 'large',
  cornerRadius = 10,
  requestAccess = true,
  lang = 'ru'
}: TelegramLoginProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbackName = useRef(`telegramCallback_${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    // Создаём глобальную callback функцию с уникальным именем
    ;(window as any)[callbackName.current] = (user: TelegramUser) => {
      onAuth(user)
    }

    // Загружаем скрипт Telegram Widget, если ещё не загружен
    if (!document.querySelector('script[src*="telegram-widget"]')) {
      const widgetScript = document.createElement('script')
      widgetScript.src = 'https://telegram.org/js/telegram-widget.js?22'
      widgetScript.async = true
      document.body.appendChild(widgetScript)
    }

    // Создаём скрипт для конкретного виджета
    if (containerRef.current && !containerRef.current.hasChildNodes()) {
      const script = document.createElement('script')
      script.src = 'https://telegram.org/js/telegram-widget.js?22'
      script.setAttribute('data-telegram-login', botUsername)
      script.setAttribute('data-size', buttonSize)
      script.setAttribute('data-radius', cornerRadius.toString())
      script.setAttribute('data-onauth', `${callbackName.current}(user)`)
      script.setAttribute('data-request-access', requestAccess ? 'write' : '')
      script.setAttribute('data-lang', lang)
      script.async = true

      containerRef.current.appendChild(script)
    }

    return () => {
      // Очищаем глобальную функцию
      delete (window as any)[callbackName.current]
    }
  }, [botUsername, buttonSize, cornerRadius, requestAccess, lang, onAuth])

  return (
    <div ref={containerRef} className="telegram-login-widget" />
  )
}

