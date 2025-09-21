'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

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
  
  // Сохраняем текущее название организации для использования в переключателе
  const [initialOrgName] = useState(currentOrgName)
  
  useEffect(() => {
    async function fetchOrganizations() {
      try {
        setLoading(true)
        
        // Используем API вместо прямого доступа к базе данных
        const response = await fetch('/api/debug/auth')
        const data = await response.json()
        
        // Подробное логирование структуры данных
        console.log('API response data structure:', JSON.stringify({
          hasOrganizations: !!data?.organizations,
          hasServiceRole: !!data?.organizations?.serviceRole,
          hasServiceRoleData: !!data?.organizations?.serviceRole?.data,
          serviceRoleCount: data?.organizations?.serviceRole?.data?.length,
          hasAllOrgs: !!data?.organizations?.allOrgs,
          hasAllOrgsData: !!data?.organizations?.allOrgs?.data,
          allOrgsCount: data?.organizations?.allOrgs?.data?.length
        }))
        
        if (data?.organizations?.serviceRole?.data?.[0]) {
          console.log('First membership data:', JSON.stringify(data.organizations.serviceRole.data[0]))
        }
        
        if (data?.organizations?.allOrgs?.data?.[0]) {
          console.log('First org data:', JSON.stringify(data.organizations.allOrgs.data[0]))
        }
        
        let newOrgs: Organization[] = []
        
        // Сначала добавляем текущую организацию, чтобы она точно была в списке
        if (currentOrgId && currentOrgName) {
          newOrgs.push({
            id: currentOrgId,
            name: currentOrgName,
            role: 'current'
          })
        }
        
        if (data && data.organizations && data.organizations.serviceRole && data.organizations.serviceRole.data) {
          const memberships = data.organizations.serviceRole.data
          const serviceRoleOrgs = memberships.map((item: any) => ({
            id: item.org_id,
            name: item.organizations?.[0]?.name || 'Неизвестная организация',
            role: item.role
          }))
          
          // Добавляем организации, которых ещё нет в списке
          serviceRoleOrgs.forEach((org: Organization) => {
            if (!newOrgs.some(o => o.id === org.id)) {
              newOrgs.push(org)
            }
          })
        } else if (data && data.organizations && data.organizations.allOrgs && data.organizations.allOrgs.data) {
          // Запасной вариант: используем список всех организаций
          const allOrgs = data.organizations.allOrgs.data
          const allOrgsData = allOrgs.map((org: any) => ({
            id: org.id,
            name: org.name || 'Неизвестная организация',
            role: 'Участник'
          }))
          
          // Добавляем организации, которых ещё нет в списке
          allOrgsData.forEach((org: Organization) => {
            if (!newOrgs.some(o => o.id === org.id)) {
              newOrgs.push(org)
            }
          })
        }
        
        // Дополнительная проверка, если вдруг текущей организации нет в списке
        if (currentOrgId && !newOrgs.some(org => org.id === currentOrgId)) {
          newOrgs.push({
            id: currentOrgId,
            name: currentOrgName || initialOrgName || 'Текущая организация',
            role: 'owner'
          })
        }
        
        console.log('Final organizations list:', newOrgs)
        
        setOrganizations(newOrgs)
      } catch (err: any) {
        console.error('Error fetching organizations:', err)
        setError(err.message || 'Ошибка при загрузке организаций')
      } finally {
        setLoading(false)
      }
    }
    
    fetchOrganizations()
  }, [])
  
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
  const currentOrg = {
    id: currentOrgId,
    name: currentOrgName || initialOrgName || 'Текущая организация'
  }
  
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="flex items-center space-x-2 text-sm font-medium focus:outline-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-semibold">Orbo</span>
        <span className="text-neutral-500 mx-1">|</span>
        <span className="text-neutral-600 truncate max-w-[120px]">{currentOrg.name}</span>
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
                  href={`/app/${org.id}/dashboard`}
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
