'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { useMemo } from 'react'

type Organization = {
  id: string
  name: string
  role?: string
}

export default function OrganizationSwitcher({ 
  currentOrgId,
  currentOrgName = ''
}: { 
  currentOrgId: string
  currentOrgName?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [initialOrgName, setInitialOrgName] = useState(currentOrgName)

  useEffect(() => {
    if (!initialOrgName && currentOrgName) {
      setInitialOrgName(currentOrgName)
    }
  }, [currentOrgName, initialOrgName])

  useEffect(() => {
    let isMounted = true

    async function fetchOrganizations() {
      try {
        setLoading(true)

        const response = await fetch('/api/organizations/list')
        const data = await response.json()

        if (!isMounted) return

        if (data.error) {
          throw new Error(data.error)
        }

        const list: Organization[] = data.organizations || []

        // Убедимся, что текущая организация присутствует и в списке, и помечена
        const currentExists = list.some(org => org.id === currentOrgId)
        const enriched = currentExists
          ? list
          : [{ id: currentOrgId, name: currentOrgName || initialOrgName || 'Текущая организация', role: 'current' }, ...list]

        setOrganizations(enriched.sort((a, b) => a.name.localeCompare(b.name)))
      } catch (err: any) {
        console.error('Error fetching organizations:', err)
        if (isMounted) {
          setError(err.message || 'Ошибка при загрузке организаций')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchOrganizations()

    return () => {
      isMounted = false
    }
  }, [currentOrgId, currentOrgName, initialOrgName])
  
  // Закрываем дропдаун при клике вне его
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])
  
  // Находим текущую организацию
  const currentOrg = useMemo(() => ({
    id: currentOrgId,
    name: currentOrgName || initialOrgName || 'Текущая организация'
  }), [currentOrgId, currentOrgName, initialOrgName])
  
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="flex items-center space-x-2 text-sm font-medium focus:outline-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-semibold">Orbo</span>
        <span className="text-neutral-500 mx-1">|</span>
        <span className="text-neutral-600 truncate max-w-[140px]" title={currentOrg.name}>{currentOrg.name}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50">
          {loading ? (
            <div className="px-4 py-2 text-sm text-neutral-500">Загрузка...</div>
          ) : error ? (
            <div className="px-4 py-2 text-sm text-red-500">{error}</div>
          ) : (
            <>
              <div className="px-4 py-2 text-xs font-medium text-neutral-500 border-b">
                ВАШИ ОРГАНИЗАЦИИ
              </div>
              {organizations.map(org => (
                <Link
                  key={org.id}
                  href={`/p/${org.id}/dashboard`}
                  className={`block px-4 py-2 text-sm hover:bg-neutral-50 ${
                    org.id === currentOrgId ? 'bg-neutral-100 font-medium' : ''
                  }`}
                  onClick={() => setIsOpen(false)}
                >
                  <div className="flex justify-between items-center">
                    <span className="truncate">{org.name}</span>
                    {org.role && (
                      <span className="text-xs text-neutral-500">{org.role}</span>
                    )}
                  </div>
                </Link>
              ))}
              <div className="border-t mt-1 pt-1">
                <Link
                  href="/app"
                  className="block px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
                  onClick={() => setIsOpen(false)}
                >
                  Все организации
                </Link>
                <Link
                  href="/app/create-organization"
                  className="block px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
                  onClick={() => setIsOpen(false)}
                >
                  + Создать организацию
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
