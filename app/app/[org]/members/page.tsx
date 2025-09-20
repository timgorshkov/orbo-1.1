import { requireOrgAccess } from '@/lib/orgGuard'
import AppShell from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic';

type Participant = {
  id: string;
  full_name: string;
  username: string | null;
  tg_user_id: number | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_activity_at: string | null;
  activity_score: number;
  risk_score: number;
  group_count?: number;
};

export default async function MembersPage({ params }: { params: { org: string } }) {
  try {
    const { supabase: userSupabase, user } = await requireOrgAccess(params.org)
    
    // Создаем клиент Supabase с сервисной ролью для обхода RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false
        }
      }
    )
    
    // Получаем список участников организации
    let participants: Participant[] | null = null;
    let error: any = null;
    
    try {
      // Сначала пробуем использовать RPC функцию
      const rpcResult = await supabase.rpc('get_participants_with_group_count', {
        org_id_param: params.org
      });
      
      if (rpcResult.error) {
        // Если RPC не работает, используем прямой запрос
        console.log('RPC function error, using fallback query:', rpcResult.error.message);
        
        // Получаем список участников
        const { data: basicParticipants, error: basicError } = await supabase
          .from('participants')
          .select('*')
          .eq('org_id', params.org)
          .order('last_activity_at', { ascending: false })
          .limit(50) as { data: Participant[] | null, error: any };
        
        // Получаем количество групп для каждого участника
        if (basicParticipants && basicParticipants.length > 0) {
          for (const participant of basicParticipants) {
            try {
              const { count } = await supabase
                .from('participant_groups')
                .select('*', { count: 'exact', head: true })
                .eq('participant_id', participant.id)
                .eq('is_active', true);
              
              participant.group_count = count || 0;
            } catch (e) {
              console.error('Error counting groups for participant:', e);
              participant.group_count = 0;
            }
          }
          
          participants = basicParticipants;
        } else {
          error = basicError;
        }
      } else {
        participants = rpcResult.data;
      }
    } catch (e) {
      console.error('Error in participants query:', e);
      error = e;
    }
    
    // Получаем список групп организации
    const { data: groups } = await supabase
      .from('telegram_groups')
      .select('id, tg_chat_id, title, bot_status')
      .eq('org_id', params.org)
      .order('title')
    
    const { data: telegramGroups } = await supabase
      .from('telegram_groups')
      .select('id, title, tg_chat_id')
      .eq('org_id', params.org)
      .order('title')
      
    // Создаем RPC функцию для получения участников с количеством групп, если она не существует
    try {
      await supabase.rpc('create_get_participants_function', { org_id_param: params.org })
    } catch (e: any) {
      console.log('Function creation attempt:', e.message)
    }


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
                        {p.activity_score > 0 && (
                          <div className="text-xs mt-1">
                            <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                              p.activity_score > 10 ? 'bg-green-500' : 
                              p.activity_score > 5 ? 'bg-amber-500' : 'bg-neutral-300'
                            }`}></span>
                            <span className="text-neutral-500">
                              Активность: {p.activity_score}
                            </span>
                          </div>
                        )}
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
                        <div className="text-xs mt-1 text-neutral-500">
                          Групп: {p.group_count || 0}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {p.email && <div className="text-sm">{p.email}</div>}
                        {p.phone && <div className="text-sm">{p.phone}</div>}
                        {!p.email && !p.phone && <span className="text-sm text-neutral-500">—</span>}
                        {p.last_activity_at && (
                          <div className="text-xs mt-1 text-neutral-500">
                            Активность: {new Date(p.last_activity_at).toLocaleDateString('ru')}
                          </div>
                        )}
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
