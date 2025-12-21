import { redirect } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import JoinPageClient from './client'

export default async function JoinPage({
  params
}: {
  params: Promise<{ org: string; token: string }>
}) {
  const { org: orgId, token } = await params
  const supabase = createAdminServer()

  // Проверяем валидность приглашения
  const { data: invite, error } = await supabase
    .from('organization_invites')
    .select(`
      *,
      organizations!inner(id, name, logo_url)
    `)
    .eq('token', token)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Приглашение не найдено
          </h1>
          <p className="text-gray-600 mb-6">
            Эта ссылка недействительна или была удалена.
          </p>
          <a
            href="/signin"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Перейти к входу
          </a>
        </div>
      </div>
    )
  }

  // Проверяем срок действия
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">⏰</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Приглашение истекло
          </h1>
          <p className="text-gray-600 mb-6">
            Срок действия этого приглашения истёк. Свяжитесь с администратором организации для получения нового приглашения.
          </p>
        </div>
      </div>
    )
  }

  // Проверяем лимит использований
  if (invite.max_uses && invite.current_uses >= invite.max_uses) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Лимит исчерпан
          </h1>
          <p className="text-gray-600 mb-6">
            Это приглашение достигло максимального количества использований. Свяжитесь с администратором для получения нового приглашения.
          </p>
        </div>
      </div>
    )
  }

  const organization = (invite as any).organizations

  return (
    <JoinPageClient
      orgId={orgId}
      token={token}
      orgName={organization.name}
      orgLogoUrl={organization.logo_url}
      accessType={invite.access_type}
      description={invite.description}
    />
  )
}

