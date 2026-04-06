'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Plus, Download, Edit, Link2 } from 'lucide-react'

interface Partner {
  id: string
  name: string
  email: string | null
  contact: string | null
  code: string
  notes: string | null
  is_active: boolean
  created_at: string
  user_count: number
}

function generateCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20) || 'partner'
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://orbo.ru'
const SITE_URL = APP_URL.replace('my.', '').replace('app.', '')

export default function PartnersClient({ initialPartners }: { initialPartners: Partner[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const [form, setForm] = useState({ name: '', email: '', contact: '', code: '', notes: '' })

  const openCreate = () => {
    setEditingPartner(null)
    setForm({ name: '', email: '', contact: '', code: '', notes: '' })
    setIsDialogOpen(true)
  }

  const openEdit = (p: Partner) => {
    setEditingPartner(p)
    setForm({ name: p.name, email: p.email ?? '', contact: p.contact ?? '', code: p.code, notes: p.notes ?? '' })
    setIsDialogOpen(true)
  }

  const handleNameChange = (val: string) => {
    setForm(f => ({
      ...f,
      name: val,
      // Auto-generate code only for new partners when code hasn't been manually edited
      code: editingPartner ? f.code : generateCode(val),
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      alert('Заполните название и код')
      return
    }
    setIsSaving(true)
    try {
      const url = editingPartner
        ? `/api/superadmin/partners/${editingPartner.id}`
        : '/api/superadmin/partners'
      const method = editingPartner ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setIsDialogOpen(false)
        startTransition(() => router.refresh())
      } else {
        const err = await res.json()
        alert(err.error || 'Ошибка при сохранении')
      }
    } catch {
      alert('Ошибка при сохранении')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleActive = async (partner: Partner) => {
    await fetch(`/api/superadmin/partners/${partner.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !partner.is_active }),
    })
    startTransition(() => router.refresh())
  }

  const handleCsvDownload = (partner: Partner) => {
    window.open(`/api/superadmin/partners/${partner.id}/csv`, '_blank')
  }

  const copyLink = (code: string) => {
    const link = `${SITE_URL}/pricing?via=${code}`
    navigator.clipboard.writeText(link)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const partners = initialPartners

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Добавить партнёра
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Название</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Код</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Контакт</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Зарегистрировалось</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Реферальная ссылка</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Статус</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {partners.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">
                    Партнёры ещё не добавлены
                  </td>
                </tr>
              )}
              {partners.map(partner => (
                <tr key={partner.id} className={`hover:bg-neutral-50 ${!partner.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-sm font-medium">
                    {partner.name}
                    {partner.notes && (
                      <p className="text-xs text-gray-400 mt-0.5">{partner.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono">
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{partner.code}</code>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {partner.email || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {partner.contact || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <span className={`font-medium ${partner.user_count > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                      {partner.user_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => copyLink(partner.code)}
                      className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 transition-colors text-xs"
                      title={`${SITE_URL}/pricing?via=${partner.code}`}
                    >
                      <Link2 className="w-3 h-3" />
                      {copiedCode === partner.code ? 'Скопировано!' : `/pricing?via=${partner.code}`}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <button
                      onClick={() => handleToggleActive(partner)}
                      className="cursor-pointer"
                      title={partner.is_active ? 'Деактивировать' : 'Активировать'}
                    >
                      <Badge
                        variant="outline"
                        className={partner.is_active
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200'
                        }
                      >
                        {partner.is_active ? 'Активен' : 'Неактивен'}
                      </Badge>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCsvDownload(partner)}
                        title="Скачать отчёт CSV"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(partner)}
                        title="Редактировать"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPartner ? 'Редактировать партнёра' : 'Добавить партнёра'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="p-name">Название *</Label>
              <Input
                id="p-name"
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="Например: RevRoute"
              />
            </div>
            <div>
              <Label htmlFor="p-code">Реферальный код *</Label>
              <Input
                id="p-code"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="revroute"
                className="font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">
                Латиница, цифры, дефисы, подчёркивания (2–32 символа).
                Ссылка: <code className="bg-gray-100 px-1 rounded">{SITE_URL}/pricing?via={form.code || 'КОД'}</code>
              </p>
            </div>
            <div>
              <Label htmlFor="p-email">Email (для доступа в кабинет)</Label>
              <Input
                id="p-email"
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="partner@example.com"
              />
              <p className="text-xs text-gray-400 mt-1">
                Пользователь с этим email получит доступ к партнёрскому кабинету
              </p>
            </div>
            <div>
              <Label htmlFor="p-contact">Контакт</Label>
              <Input
                id="p-contact"
                value={form.contact}
                onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
                placeholder="@telegram или email"
              />
            </div>
            <div>
              <Label htmlFor="p-notes">Заметки</Label>
              <Input
                id="p-notes"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Дополнительная информация"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Сохранение...' : (editingPartner ? 'Сохранить' : 'Добавить')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
