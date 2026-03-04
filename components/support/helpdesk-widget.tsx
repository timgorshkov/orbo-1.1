'use client'

import Script from 'next/script'
import { useEffect } from 'react'

interface HelpDeskWidgetProps {
  /**
   * Показывать виджет только для определённых ролей
   * Если не указано - показывать всем
   */
  allowedRoles?: ('owner' | 'admin' | 'member' | 'guest')[]
  /**
   * Текущая роль пользователя (для app)
   */
  userRole?: string
}

/**
 * HelpDeskEddy виджет онлайн-поддержки
 *
 * Использование:
 * - На сайте orbo.ru: <HelpDeskWidget /> (без ограничений)
 * - В приложении: <HelpDeskWidget allowedRoles={['owner', 'admin']} userRole={role} />
 *
 * На мобильных устройствах виджет намеренно скрыт (≤1023px) —
 * поддержка на мобильных доступна через пункт «Поддержка» в выдвижном меню
 * (components/navigation/mobile-bottom-nav.tsx), который открывает @orbo_support_bot.
 */
export function HelpDeskWidget({ allowedRoles, userRole }: HelpDeskWidgetProps) {
  // Если указаны allowedRoles, проверяем роль пользователя
  if (allowedRoles && userRole) {
    if (!allowedRoles.includes(userRole as any)) {
      return null
    }
  }

  useEffect(() => {
    // Скрываем виджет на мобильных — там используется пункт «Поддержка» в меню.
    // Брейкпоинт 1023px = Tailwind `lg` (MobileBottomNav скрыт при ≥1024px).
    // Не удалять: без этого CSS виджет перекрывает кнопку «Меню» на мобильных.
    const style = document.createElement('style')
    style.id = 'helpdesk-mobile-hide'
    style.textContent = `
      @media (max-width: 1023px) {
        #hde-contact-widget-button,
        .hde-contact-widget-button {
          display: none !important;
        }
      }
    `
    document.head.appendChild(style)

    return () => {
      document.getElementById('helpdesk-mobile-hide')?.remove()
    }
  }, [])

  return (
    <Script
      id="hde-contact-widget"
      src="//cdn5.helpdeskeddy.com//js/contact-widget.js"
      data-assets-host="//cdn5.helpdeskeddy.com/"
      data-host="orbo.helpdeskeddy.com"
      data-lang="ru"
      strategy="lazyOnload"
    />
  )
}
