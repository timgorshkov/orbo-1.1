'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

type User = {
  user_id: string
  full_name: string
  email: string
  email_confirmed: boolean
  telegram_verified: boolean
  telegram_display_name: string | null
  owner_orgs_count: number
  admin_orgs_count: number
  total_orgs_count: number
  groups_with_bot_count: number
  last_sign_in_at?: string
  created_at?: string
}

export default function UsersTable({ users }: { users: User[] }) {
  const [search, setSearch] = useState('')
  
  const filtered = users.filter(u => 
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name.toLowerCase().includes(search.toLowerCase())
  )
  
  return (
    <div className="space-y-4">
      <Input
        placeholder="Поиск по имени или email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Имя</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Email подтв.</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Telegram верифицирован</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Владелец орг.</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Админ орг.</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Групп с ботом</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Последний вход</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((user) => (
                <tr key={user.user_id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm font-medium">{user.full_name}</td>
                  <td className="px-4 py-3 text-sm">{user.email}</td>
                  <td className="px-4 py-3 text-sm">
                    {user.email_confirmed ? '✅' : '❌'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {user.telegram_verified ? (
                      <span>✅ {user.telegram_display_name || ''}</span>
                    ) : '❌'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">{user.owner_orgs_count}</td>
                  <td className="px-4 py-3 text-sm text-right">{user.admin_orgs_count}</td>
                  <td className="px-4 py-3 text-sm text-right">{user.groups_with_bot_count}</td>
                  <td className="px-4 py-3 text-sm">
                    {user.last_sign_in_at 
                      ? new Date(user.last_sign_in_at).toLocaleDateString('ru-RU')
                      : 'Никогда'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      
      <p className="text-sm text-gray-500">
        Всего: {filtered.length} из {users.length}
      </p>
    </div>
  )
}
