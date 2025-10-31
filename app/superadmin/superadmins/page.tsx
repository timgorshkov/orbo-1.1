import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createClientServer } from '@/lib/server/supabaseServer'
import SuperadminsTable from '@/components/superadmin/superadmins-table'

export default async function SuperadminsSuperadminsPage() {
  await requireSuperadmin()
  
  const supabase = await createClientServer()
  
  // Получаем всех суперадминов
  const { data: superadmins } = await supabase
    .from('superadmins')
    .select('*')
    .order('created_at', { ascending: false })
  
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Суперадмины</h2>
        <p className="text-gray-600 mt-1">
          Управление доступом к технической админке
        </p>
      </div>
      
      <SuperadminsTable superadmins={superadmins || []} />
    </div>
  )
}

