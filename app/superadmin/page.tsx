import { redirect } from 'next/navigation'
import { requireSuperadmin, updateSuperadminLastLogin } from '@/lib/server/superadminGuard'

/**
 * Главная страница суперадминки
 * Редиректит на раздел "Организации"
 */
export default async function SuperadminPage() {
  await requireSuperadmin()
  await updateSuperadminLastLogin()
  
  redirect('/superadmin/organizations')
}

