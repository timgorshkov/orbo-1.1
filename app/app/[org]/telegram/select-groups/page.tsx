import { requireOrgAccess } from '@/lib/orgGuard'
import AppShell from '@/components/app-shell'
import { GroupSelectionCard } from '../components/group-selection-card'
import { redirect } from 'next/navigation'
import { createClientServer } from '@/lib/server/supabaseServer'

export default async function SelectGroupsPage({ params }: { params: { org: string } }) {
  const { supabase, user } = await requireOrgAccess(params.org)
  
  // Получаем группы, где пользователь админ, но которые еще не добавлены в эту организацию
  const { data: availableGroups } = await supabase
    .from('user_group_admin_status')
    .select(`
      tg_chat_id,
      telegram_groups!left(id, org_id, title)
    `)
    .eq('user_id', user.id)
    .eq('is_admin', true)
    
  // Фильтруем и оставляем только те, которые не добавлены в текущую организацию
  const filteredGroups = availableGroups?.filter(group => 
    !group.telegram_groups || 
    !group.telegram_groups.length || 
    group.telegram_groups[0]?.org_id !== params.org
  )
  
  if (!filteredGroups?.length) {
    // Если нет доступных групп, перенаправляем на основную страницу
    return redirect(`/app/${params.org}/telegram`)
  }
    
  // Получаем список групп
  const { data: telegramGroups } = await supabase
    .from('telegram_groups')
    .select('id, title, tg_chat_id')
    .eq('org_id', params.org)
    .order('title')
  

  return (
    <AppShell orgId={params.org} currentPath={`/app/${params.org}/telegram`} telegramGroups={telegramGroups || []}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Выберите группы для добавления</h1>
        <p className="text-neutral-600">Выберите группы, которые хотите добавить в эту организацию</p>
      </div>
      
      <div className="space-y-4">
        {filteredGroups.map(group => (
          <GroupSelectionCard 
            key={group.tg_chat_id} 
            chatId={group.tg_chat_id} 
            title={group.telegram_groups?.[0]?.title || `Группа ${group.tg_chat_id}`}
            orgId={params.org} 
          />
        ))}
      </div>
    </AppShell>
  )
}
