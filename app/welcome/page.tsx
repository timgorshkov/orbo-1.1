import { redirect } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getUnifiedSession } from '@/lib/auth/unified-auth'

export default async function WelcomePage() {
  // Проверяем авторизацию через unified auth (Supabase или NextAuth)
  const session = await getUnifiedSession();

  if (!session) {
    redirect('/signin')
  }

  const user = { id: session.user.id, email: session.user.email };

  // Проверяем количество организаций пользователя
  const adminSupabase = createAdminServer()
  const { data: memberships } = await adminSupabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)

  const orgCount = memberships?.length || 0

  // Если у пользователя уже есть организации, редиректим на список организаций
  if (orgCount > 0) {
    redirect('/orgs')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl mb-2">Добро пожаловать в Orbo!</CardTitle>
          <CardDescription className="text-lg">
            Платформа для управления сообществами через Telegram
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-600 font-bold">1</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Подключите Telegram-группы</h3>
                <p className="text-sm text-gray-600">
                  Привяжите свои Telegram-группы к пространству и начните управлять участниками
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-600 font-bold">2</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Создавайте события</h3>
                <p className="text-sm text-gray-600">
                  Организуйте мероприятия, регистрируйте участников и отслеживайте активность
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-600 font-bold">3</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Анализируйте активность</h3>
                <p className="text-sm text-gray-600">
                  Получайте аналитику по сообщениям, участникам и событиям в вашем сообществе
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <p className="text-sm text-gray-600 mb-4 text-center">
              Готовы начать? Создайте своё первое пространство
            </p>
            <div className="flex gap-3">
              <Button
                asChild
                className="flex-1"
                size="lg"
              >
                <Link href="/orgs/new">
                  Создать пространство
                </Link>
              </Button>
            </div>
            <p className="text-xs text-gray-500 text-center mt-3">
              После создания пространства вы сможете добавить Telegram-группы и начать работу
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

