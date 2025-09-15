import AppShell from '@/components/app-shell'
import { requireOrgAccess } from '@/lib/orgGuard'
import { createClientServer } from '@/lib/server/supabaseServer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { notFound } from 'next/navigation'
import Link from 'next/link'

type MaterialFolder = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

type MaterialItem = {
  id: string;
  title: string;
  kind: 'doc' | 'file' | 'link';
  content: string | null;
  file_path: string | null;
  url: string | null;
  folder_id: string | null;
  created_at: string;
};

// Server Action для создания документа
async function createDoc(formData: FormData) {
  'use server'
  
  const org = String(formData.get('org'))
  try {
    const { supabase, user } = await requireOrgAccess(org)
    
    // Создаем новый документ
    await supabase.from('material_items').insert({
      org_id: org, 
      kind: 'doc', 
      title: 'Новый документ', 
      content: 'Черновик...', 
      created_by: user.id
    })
    
  } catch (error) {
    console.error('Error creating document:', error)
  }
}

export default async function MaterialsPage({ params }: { params: { org: string } }) {
  try {
    const { supabase } = await requireOrgAccess(params.org)
    
    // Получаем папки
    const { data: folders, error: foldersError } = await supabase
      .from('material_folders')
      .select('*')
      .eq('org_id', params.org)
      .order('name') as { data: MaterialFolder[] | null, error: any }
    
    if (foldersError) {
      console.error('Error fetching folders:', foldersError)
    }
    
    // Получаем элементы
    const { data: items, error: itemsError } = await supabase
      .from('material_items')
      .select('*')
      .eq('org_id', params.org)
      .order('created_at', { ascending: false })
      .limit(50) as { data: MaterialItem[] | null, error: any }
    
    if (itemsError) {
      console.error('Error fetching items:', itemsError)
    }
    
    // Группируем элементы по папкам
    const folderMap = new Map<string | null, MaterialItem[]>();
    
    // Добавляем элементы без папки
    folderMap.set(null, []);
    
    // Создаем записи для каждой папки
    folders?.forEach(folder => {
      folderMap.set(folder.id, []);
    });
    
    // Распределяем элементы по папкам
    items?.forEach(item => {
      const folderId = item.folder_id || null;
      if (folderMap.has(folderId)) {
        folderMap.get(folderId)!.push(item);
      } else {
        // На случай, если есть ссылка на несуществующую папку
        folderMap.get(null)!.push(item);
      }
    });
    
    // Получаем список групп
    const { data: telegramGroups } = await supabase
      .from('telegram_groups')
      .select('id, title, tg_chat_id')
      .eq('org_id', params.org)
      .order('title')

    return (
      <AppShell orgId={params.org} currentPath={`/app/${params.org}/materials`} telegramGroups={telegramGroups || []}>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Материалы</h1>
          <div className="flex gap-2">
            <Button variant="outline">+ Новая папка</Button>
            <form action={createDoc}>
              <input type="hidden" name="org" value={params.org} />
              <Button type="submit">+ Документ</Button>
            </form>
          </div>
        </div>
        
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="max-w-md">
              <Input placeholder="🔍 Поиск в материалах..." />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-2">
            {/* Элементы без папок */}
            {folderMap.get(null)?.length ? (
              <div className="mb-4">
                <div className="px-3 py-2 text-sm font-medium text-neutral-500">
                  Без папки
                </div>
                <div className="ml-4 space-y-1">
                  {folderMap.get(null)?.map(item => (
                    <MaterialItemComponent key={item.id} item={item} orgId={params.org} />
                  ))}
                </div>
              </div>
            ) : null}
            
            {/* Папки с элементами */}
            {folders?.map(folder => (
              <div key={folder.id} className="mb-4">
                <div className="flex items-center px-3 py-2 hover:bg-neutral-50 rounded-lg cursor-pointer">
                  <span className="mr-2">📂</span>
                  <span className="font-medium">{folder.name}</span>
                </div>
                
                <div className="ml-8 space-y-1">
                  {folderMap.get(folder.id)?.map(item => (
                    <MaterialItemComponent key={item.id} item={item} orgId={params.org} />
                  ))}
                </div>
              </div>
            ))}
            
            {(!folders?.length && !items?.length) && (
              <div className="text-center py-12">
                <p className="text-neutral-500">Нет материалов</p>
                <p className="text-sm text-neutral-400 mt-1">
                  Создайте документ или загрузите файл
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </AppShell>
    )
  } catch (error) {
    console.error('Materials page error:', error)
    return notFound()
  }
}

function MaterialItemComponent({ item, orgId }: { item: MaterialItem; orgId: string }) {
  const icon = item.kind === 'doc' ? '📄' : 
               item.kind === 'file' ? '📎' : 
               '🔗';
  
  return (
    <Link 
      href={`/app/${orgId}/materials/${item.id}`}
      className="flex items-center px-3 py-2 hover:bg-neutral-50 rounded-lg cursor-pointer"
    >
      <span className="mr-2">{icon}</span>
      <div>
        <span>{item.title}</span>
        <div className="text-xs text-neutral-500">
          {new Date(item.created_at).toLocaleDateString()}
        </div>
      </div>
    </Link>
  )
}
