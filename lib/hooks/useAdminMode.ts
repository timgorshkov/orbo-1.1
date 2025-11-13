'use client'

import { useState, useEffect } from 'react'

/**
 * Хук для управления режимом админа
 * 
 * @returns {boolean} adminMode - true = режим админа, false = режим участника
 * @returns {function} setAdminMode - функция для изменения режима
 * @returns {boolean} isAdmin - является ли пользователь админом/владельцем
 */
export function useAdminMode(userRole: 'owner' | 'admin' | 'member' | 'guest') {
  const isAdmin = userRole === 'owner' || userRole === 'admin'
  
  // Для не-админов всегда false
  const [adminMode, setAdminModeState] = useState<boolean>(() => {
    if (!isAdmin) return false
    if (typeof window === 'undefined') return true // SSR default
    
    const stored = localStorage.getItem('orbo_admin_mode')
    return stored === null ? true : stored === 'true'
  })
  
  // Синхронизация с localStorage
  useEffect(() => {
    if (!isAdmin) return
    localStorage.setItem('orbo_admin_mode', String(adminMode))
  }, [adminMode, isAdmin])
  
  const setAdminMode = (value: boolean) => {
    if (!isAdmin) return // Не-админы не могут менять режим
    setAdminModeState(value)
  }
  
  const toggleAdminMode = () => {
    setAdminMode(!adminMode)
  }
  
  return {
    adminMode: isAdmin ? adminMode : false,
    setAdminMode,
    toggleAdminMode,
    isAdmin
  }
}

