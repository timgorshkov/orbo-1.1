'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

type Organization = {
  id: string
  name: string
  created_at: string
  has_telegram: boolean
  telegram_verified: boolean
  telegram_username: string | null
  groups_count: number
  groups_with_bot: number
  participants_count: number
  materials_count: number
  events_count: number
}

export default function OrganizationsTable({ organizations }: { organizations: Organization[] }) {
  const [search, setSearch] = useState('')
  
  const filtered = organizations.filter(org => 
    org.name.toLowerCase().includes(search.toLowerCase())
  )
  
  return (
    <div className="space-y-4">
      <Input
        placeholder="Поиск по названию..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Название</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Telegram</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Групп</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">С ботом</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Участников</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Материалов</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">События</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Создана</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((org) => (
                <tr key={org.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm font-medium">{org.name}</td>
                  <td className="px-4 py-3 text-sm">
                    {org.has_telegram ? (
                      org.telegram_verified ? (
                        <span>✅ {org.telegram_username || 'Верифицирован'}</span>
                      ) : '⚠️ Добавлен'
                    ) : '❌ Нет'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">{org.groups_count}</td>
                  <td className="px-4 py-3 text-sm text-right">{org.groups_with_bot}</td>
                  <td className="px-4 py-3 text-sm text-right">{org.participants_count}</td>
                  <td className="px-4 py-3 text-sm text-right">{org.materials_count}</td>
                  <td className="px-4 py-3 text-sm text-right">{org.events_count}</td>
                  <td className="px-4 py-3 text-sm">
                    {new Date(org.created_at).toLocaleDateString('ru-RU')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      
      <p className="text-sm text-gray-500">
        Всего: {filtered.length} из {organizations.length}
      </p>
    </div>
  )
}
