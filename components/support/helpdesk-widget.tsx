'use client'

import Script from 'next/script'

interface HelpDeskWidgetProps {
  /**
   * Показывать виджет только для определённых ролей.
   * Если не указано — показывать всем.
   */
  allowedRoles?: ('owner' | 'admin' | 'member' | 'guest')[]
  /**
   * Текущая роль пользователя (для app).
   */
  userRole?: string
}

/**
 * HelpDeskEddy виджет онлайн-поддержки.
 *
 * Использование:
 * - На сайте orbo.ru: <HelpDeskWidget /> (без ограничений)
 * - В приложении: <HelpDeskWidget allowedRoles={['owner', 'admin']} userRole={role} />
 *
 * МОБИЛЬНЫЕ (< 1024px): виджет намеренно скрыт через app/globals.css.
 * НЕ добавлять скрытие через useEffect — только глобальный CSS надёжен до гидратации.
 * На мобильных поддержка доступна через пункт «Поддержка» в меню навигации
 * (components/navigation/mobile-bottom-nav.tsx), который открывает @orbo_support_bot.
 */
export function HelpDeskWidget({ allowedRoles, userRole }: HelpDeskWidgetProps) {
  if (allowedRoles && userRole) {
    if (!allowedRoles.includes(userRole as any)) {
      return null
    }
  }

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
