'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type Superadmin = {
  id: string
  user_id: string
  email: string
  created_at: string
  last_login_at: string | null
  is_active: boolean
}

export default function SuperadminsTable({ superadmins }: { superadmins: Superadmin[] }) {
  const [email, setEmail] = useState('')
  const [isPending, startTransition] = useTransition()
  
  const handleAdd = async () => {
    if (!email || !email.includes('@')) return
    
    startTransition(async () => {
      const res = await fetch('/api/superadmin/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      
      if (res.ok) {
        setEmail('')
        window.location.reload()
      } else {
        const data = await res.json()
        alert(data.error || 'Ошибка при добавлении')
      }
    })
  }
  
  const handleDeactivate = async (id: string) => {
    if (!confirm('Деактивировать этого суперадмина?')) return
    
    startTransition(async () => {
      const res = await fetch(`/api/superadmin/${id}/deactivate`, {
        method: 'POST'
      })
      
      if (res.ok) {
        window.location.reload()
      } else {
        const data = await res.json()
        alert(data.error || 'Ошибка при деактивации')
      }
    })
  }
  
  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-3">Добавить суперадмина</h3>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleAdd} disabled={isPending || !email}>
            {isPending ? 'Добавление...' : 'Добавить'}
          </Button>
        </div>
      </Card>
      
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Статус</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Добавлен</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Последний вход</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {superadmins.map((admin) => (
                <tr key={admin.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm">{admin.email}</td>
                  <td className="px-4 py-3 text-sm">
                    {admin.is_active ? (
                      <span className="text-green-600">✅ Активен</span>
                    ) : (
                      <span className="text-gray-400">❌ Деактивирован</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {new Date(admin.created_at).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {admin.last_login_at 
                      ? new Date(admin.last_login_at).toLocaleDateString('ru-RU')
                      : 'Никогда'
                    }
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {admin.is_active && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeactivate(admin.id)}
                        disabled={isPending}
                      >
                        Деактивировать
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      
      <p className="text-sm text-gray-500">
        Всего суперадминов: {superadmins.length}
      </p>
    </div>
  )
}
