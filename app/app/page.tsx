import { createClientServer } from '@/lib/server/supabaseServer'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const revalidate = 0; // Отключаем кэширование страницы

export default async function AppRoot() {
  // Используем стандартный клиент для получения пользователя
  const supabase = createClientServer()
  let user: any;

  try {
    const { data, error } = await supabase.auth.getUser()
    
    if (error || !data.user) {
      console.log("No authenticated user in AppRoot:", error?.message)
      redirect('/signin')
      return null; // Важно для типизации React
    }
    user = data.user;
    console.log("Authenticated user:", user.id, user.email);
  } catch (e) {
    console.error("Error in AppRoot:", e)
    redirect('/signin')
    return null;
  }
  
  // Создаем клиент с сервисной ролью для обхода RLS
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Логирование запроса
  console.log("Fetching memberships for user ID:", user.id);

  // Используем сервисную роль для получения организаций
  const { data: orgs, error: orgsError } = await supabaseAdmin
    .from('memberships')
    .select('org_id, role, organizations(name)')
    .eq('user_id', user.id);
  
    // Логирование результата
    if (orgsError) {
      console.error("Error fetching organizations:", orgsError);
    } else {
      console.log("Organizations found:", orgs?.length || 0, orgs);
    }

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
