/**
 * Page: Digest Settings
 * Configure weekly digest settings
 */

import { requireOrgAccess } from '@/lib/orgGuard';
import { redirect } from 'next/navigation';
import DigestSettingsForm from '@/components/settings/digest-settings-form';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createServiceLogger } from '@/lib/logger';

const supabaseAdmin = createAdminServer();

export default async function DigestSettingsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const logger = createServiceLogger('DigestSettingsPage');
  const { org: orgId } = await params
  
  try {
    // Verify access
    const { supabase, user } = await requireOrgAccess(orgId);

    // Check if user is owner/admin
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      redirect(`/p/${orgId}/dashboard`);
    }

    // Fetch current settings
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name, digest_enabled, digest_day, digest_time, last_digest_sent_at, timezone')
      .eq('id', orgId)
      .single();

    if (!org) {
      redirect(`/p/${orgId}/dashboard`);
    }

    const initialSettings = {
      enabled: org.digest_enabled ?? true,
      day: org.digest_day ?? 1,
      time: org.digest_time ?? '09:00:00',
      lastSentAt: org.last_digest_sent_at,
    };

    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Еженедельный дайджест</h1>
          <p className="text-gray-600 mt-1">
            Настройте автоматическую отправку дайджеста активности сообщества
          </p>
        </div>

        <DigestSettingsForm
          orgId={orgId}
          initialSettings={initialSettings}
        />

        {/* Info block */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-2">Что включает дайджест?</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>📊 Метрики активности (сообщения, участники, реакции)</li>
            <li>🌟 Топ-3 самых активных участников</li>
            <li>⚠️ Зоны внимания (неактивные новички, молчащие участники)</li>
            <li>📅 Ближайшие события</li>
            <li>💡 AI-рекомендации по улучшению вовлечённости</li>
          </ul>
          <p className="text-sm text-blue-700 mt-3">
            <strong>Стоимость генерации:</strong> ~$0.002-0.003 за дайджест (~0.19-0.29 ₽)
          </p>
        </div>

        {/* Bot requirements */}
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="font-medium text-yellow-900 mb-2">Требования</h3>
          <p className="text-sm text-yellow-800">
            Для получения дайджестов в Telegram необходимо:
          </p>
          <ol className="text-sm text-yellow-800 space-y-1 mt-2 ml-4 list-decimal">
            <li>Запустить бота уведомлений Orbo в Telegram (отправьте /start)</li>
            <li>Связать Telegram аккаунт в вашем профиле Orbo</li>
          </ol>
        </div>
      </div>
    );
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org_id: orgId
    }, 'Digest settings page error');
    redirect(`/p/${orgId}/dashboard`);
  }
}

