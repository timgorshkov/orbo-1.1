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
  /**
   * Показывать на мобильных только когда открыто меню
   */
  showOnMobileWhenMenuOpen?: boolean
}

/**
 * HelpDeskEddy виджет онлайн-поддержки
 * 
 * Использование:
 * - На сайте orbo.ru: <HelpDeskWidget /> (без ограничений)
 * - В приложении: <HelpDeskWidget allowedRoles={['owner', 'admin']} userRole={role} />
 */
export function HelpDeskWidget({ allowedRoles, userRole, showOnMobileWhenMenuOpen }: HelpDeskWidgetProps) {
  // Если указаны allowedRoles, проверяем роль пользователя
  if (allowedRoles && userRole) {
    if (!allowedRoles.includes(userRole as any)) {
      return null
    }
  }

  useEffect(() => {
    // Add CSS to hide widget button on mobile by default
    const style = document.createElement('style')
    style.id = 'helpdesk-mobile-hide'
    style.textContent = `
      /* Hide HelpDesk button on mobile screens to avoid overlapping with bottom nav */
      @media (max-width: 768px) {
        #hde-contact-widget-button,
        .hde-contact-widget-button {
          display: none !important;
        }
        
        /* Show when mobile menu is open (has class on body) */
        body.mobile-menu-open #hde-contact-widget-button,
        body.mobile-menu-open .hde-contact-widget-button {
          display: block !important;
          /* Adjust position to not overlap with menu button */
          bottom: 80px !important;
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
