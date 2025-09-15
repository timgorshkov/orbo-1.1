import { requireOrgAccess } from '@/lib/orgGuard'
import AppShell from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { notFound } from 'next/navigation'
import Link from 'next/link'

type Participant = {
  id: string;
  full_name: string;
  username: string | null;
  tg_user_id: number | null;
  email: string | null;
  phone: string | null;
  created_at: string;
};

export default async function MembersPage({ params }: { params: { org: string } }) {
  try {
    const { supabase } = await requireOrgAccess(params.org)
    
    // Получаем список участников организации
    const { data: participants, error } = await supabase
      .from('participants')
      .select('*')
      .eq('org_id', params.org)
      .order('created_at', { ascending: false })
      .limit(50) as { data: Participant[] | null, error: any }
    
    if (error) {
      console.error('Error fetching members:', error)
    }
    
    // Получаем список групп организации
    const { data: groups } = await supabase
      .from('telegram_groups')
      .select('id, tg_chat_id, title')
      .eq('org_id', params.org)
    
    const { data: telegramGroups } = await supabase
      .from('telegram_groups')
      .select('id, title, tg_chat_id')
      .eq('org_id', params.org)
      .order('title')


    return (
      <AppShell orgId={params.org} currentPath={`/app/${params.org}/members`} telegramGroups={telegramGroups || []}>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Участники</h1>
          <div className="flex gap-2">
            <Button variant="outline">Экспорт</Button>
            <Button>+ Добавить</Button>
          </div>
        </div>
        
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="max-w-md">
              <Input placeholder="🔍 Поиск по имени, username..." />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-sm text-neutral-600 bg-neutral-50">
                  <th className="px-4 py-3 text-left">Имя</th>
                  <th className="px-4 py-3 text-left">Telegram</th>
                  <th className="px-4 py-3 text-left">Контакты</th>
                  <th className="px-4 py-3 text-left">Добавлен</th>
                  <th className="px-4 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {participants && participants.length > 0 ? (
                  participants.map(p => (
                    <tr key={p.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/app/${params.org}/members/${p.id}`}
                          className="hover:underline font-medium"
                        >
                          {p.full_name || 'Без имени'}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {p.username ? (
                          <span className="text-sm text-neutral-600">@{p.username}</span>
                        ) : (
                          <span className="text-sm text-neutral-500">—</span>
                        )}
                        {p.tg_user_id && (
                          <div className="text-xs text-neutral-400">ID: {p.tg_user_id}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.email && <div className="text-sm">{p.email}</div>}
                        {p.phone && <div className="text-sm">{p.phone}</div>}
                        {!p.email && !p.phone && <span className="text-sm text-neutral-500">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-500">
                        {new Date(p.created_at).toLocaleDateString('ru')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" className="text-neutral-500">
                          ⋯
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                      {error ? 'Ошибка загрузки участников' : 'Нет участников'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </AppShell>
    )
  } catch (error) {
    console.error('Members page error:', error)
    return notFound()
  }
}
