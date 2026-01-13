'use client'

import Script from 'next/script'

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
 */
export function HelpDeskWidget({ allowedRoles, userRole }: HelpDeskWidgetProps) {
  // Если указаны allowedRoles, проверяем роль пользователя
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
