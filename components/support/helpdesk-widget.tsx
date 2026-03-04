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
    // ⚠️  ВАЖНО: НЕ УДАЛЯТЬ И НЕ МЕНЯТЬ БРЕЙКПОИНТ БЕЗ ПРОВЕРКИ МОБИЛЬНОГО МЕНЮ!
    //
    // Виджет helpdeskeddy перекрывает кнопку «Меню» в мобильном нижнем меню.
    // Решение: скрываем виджет на мобильных по умолчанию; показываем только когда
    // открыто выдвижное меню (MobileBottomNav добавляет класс `mobile-menu-open` на <body>).
    //
    // Брейкпоинт 1023px = `lg` в Tailwind (MobileBottomNav скрыт при ≥1024px),
    // поэтому не меняй его, не проверив компонент MobileBottomNav.
    //
    // Связанный код: components/navigation/mobile-bottom-nav.tsx
    //   — useEffect с document.body.classList.add/remove('mobile-menu-open')
    const style = document.createElement('style')
    style.id = 'helpdesk-mobile-hide'
    style.textContent = `
      /* Скрываем виджет HelpDesk на мобильных, чтобы не перекрывал кнопку «Меню» */
      @media (max-width: 1023px) {
        #hde-contact-widget-button,
        .hde-contact-widget-button {
          display: none !important;
        }

        /* Показываем виджет только когда открыто выдвижное мобильное меню */
        body.mobile-menu-open #hde-contact-widget-button,
        body.mobile-menu-open .hde-contact-widget-button {
          display: block !important;
          /* Поднимаем выше нижнего бара навигации */
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
