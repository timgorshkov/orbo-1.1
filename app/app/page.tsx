import { createClientServer } from '@/lib/supabaseClient'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function AppRoot() {
  const supabase = createClientServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/signin')
  }

  const { data: orgs } = await supabase
    .from('memberships')
    .select('org_id, role, organizations(name)')
    .eq('user_id', user.id)

  if (!orgs?.length) {
    // Если у пользователя нет организаций, перенаправляем на страницу создания
    return (
      <div className="p-6 max-w-lg mx-auto mt-12">
        <h1 className="text-xl font-semibold mb-4">Добро пожаловать в Orbo!</h1>
        <p className="text-neutral-600 mb-6">
          У вас пока нет рабочих пространств. Создайте первое пространство для управления вашим сообществом.
        </p>
        <Link 
          href="/app/create-organization" 
          className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium bg-black text-white hover:bg-black/85"
        >
          Создать организацию
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-lg mx-auto mt-12">
      <h1 className="text-xl font-semibold mb-4">Ваши рабочие пространства</h1>
      <ul className="space-y-2 mt-6">
        {orgs.map((m: any) => (
          <li key={m.org_id} className="bg-white rounded-xl border p-4 hover:shadow-sm transition">
            <Link 
              className="flex items-center justify-between text-black" 
              href={`/app/${m.org_id}/dashboard`}
            >
              <div>
                <div className="font-medium">{m.organizations?.name ?? m.org_id}</div>
                <div className="text-xs text-neutral-500">{m.role}</div>
              </div>
              <div className="text-neutral-400">→</div>
            </Link>
          </li>
        ))}
      </ul>
      
      <div className="mt-8 border-t pt-6">
        <Link 
          href="/app/create-organization" 
          className="text-sm text-neutral-600 hover:text-black flex items-center"
        >
          + Создать новую организацию
        </Link>
      </div>
    </div>
  )
}
