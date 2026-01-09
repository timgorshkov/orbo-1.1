'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

type Group = {
  id: number
  title: string
  tg_chat_id: string
  bot_status: string
  // verification_status removed in migration 080
  created_at: string
  has_bot: boolean
  has_admin_rights: boolean
  participants_count: number
  organizations_count: number
  organization_names: string[]
  last_activity_at: string | null
}

export default function GroupsTable({ groups }: { groups: Group[] }) {
  const [search, setSearch] = useState('')
  
  const filtered = groups.filter(g => 
    g.title.toLowerCase().includes(search.toLowerCase())
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
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Организации</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Бот</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Права админа</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Участников</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Последняя активность</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Last Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((group) => (
                <tr key={group.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm font-medium">{group.title}</td>
                  <td className="px-4 py-3 text-sm">
                    {group.organization_names.length > 0 ? (
                      <span title={group.organization_names.join(', ')}>
                        {group.organization_names.length === 1 
                          ? group.organization_names[0]
                          : `${group.organization_names[0]} +${group.organization_names.length - 1}`
                        }
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {group.has_bot ? '✅' : '❌'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {group.has_admin_rights ? '✅' : '❌'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">{group.participants_count}</td>
                  <td className="px-4 py-3 text-sm">
                    {group.last_activity_at 
                      ? new Date(group.last_activity_at).toLocaleDateString('ru-RU')
                      : 'Нет активности'
                    }
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {group.created_at ? (() => {
                      const date = new Date(group.created_at)
                      const today = new Date()
                      const isToday = date.toDateString() === today.toDateString()
                      
                      if (isToday) {
                        return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                      } else {
                        return date.toLocaleDateString('ru-RU')
                      }
                    })() : 'Нет данных'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      
      <p className="text-sm text-gray-500">
        Всего: {filtered.length} из {groups.length}
      </p>
    </div>
  )
}
