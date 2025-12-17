import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import SuperadminsTable from '@/components/superadmin/superadmins-table'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('SuperadminsPage');

export default async function SuperadminsSuperadminsPage() {
  await requireSuperadmin()
  
  // Используем admin клиент для обхода RLS
  const supabaseAdmin = createAdminServer()
  
  // Получаем всех суперадминов
  const { data: superadmins, error } = await supabaseAdmin
    .from('superadmins')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) {
    logger.error({ error: error.message }, 'Error fetching superadmins');
  }
  
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

