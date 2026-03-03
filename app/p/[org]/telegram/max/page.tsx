import { requireOrgAccess } from '@/lib/orgGuard'
import { notFound } from 'next/navigation'
import TabsLayout from '../tabs-layout'
import { createServiceLogger } from '@/lib/logger'
import MaxSettingsClient from './max-settings-client'

export default async function MaxPage({ params }: { params: Promise<{ org: string }> }) {
  const logger = createServiceLogger('MaxPage');
  let orgId: string | undefined;
  try {
    const { org } = await params;
    orgId = org;
    await requireOrgAccess(orgId);

    // Notifications bot is used for verification codes and system DMs — show it in instructions
    const botUsername =
      process.env.MAX_NOTIFICATIONS_BOT_USERNAME ||
      process.env.MAX_MAIN_BOT_USERNAME ||
      null;

    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Настройки мессенджеров</h1>
        </div>

        <TabsLayout orgId={orgId}>
          <MaxSettingsClient orgId={orgId} botUsername={botUsername} />
        </TabsLayout>
      </div>
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'Unauthorized' || msg === 'Forbidden') {
      logger.debug({ org_id: orgId || 'unknown' }, 'Max page: unauthenticated/forbidden access');
    } else {
      logger.error({ error: msg, org_id: orgId || 'unknown' }, 'Max page error');
    }
    return notFound()
  }
}
