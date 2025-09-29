import { notFound } from 'next/navigation';
import AppShell from '@/components/app-shell';
import { getParticipantDetail } from '@/lib/server/getParticipantDetail';
import { getOrgTelegramGroups } from '@/lib/server/getOrgTelegramGroups';
import ParticipantDetailTabs from '@/components/members/participant-detail-tabs';

export const dynamic = 'force-dynamic';

export default async function ParticipantPage({ params }: { params: { org: string; participantId: string } }) {
  const orgId = params.org;
  const participantId = params.participantId;

  const [detail, telegramGroups] = await Promise.all([
    getParticipantDetail(orgId, participantId),
    getOrgTelegramGroups(orgId)
  ]);

  if (!detail) {
    return notFound();
  }

  return (
    <AppShell
      orgId={orgId}
      currentPath={`/app/${orgId}/members/${participantId}`}
      telegramGroups={telegramGroups || []}
    >
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">
            {detail.participant.full_name || detail.participant.username || 'Участник без имени'}
          </h1>
          {detail.participant.username && (
            <p className="text-sm text-neutral-500">@{detail.participant.username}</p>
          )}
        </div>
      </div>

      <ParticipantDetailTabs orgId={orgId} initialDetail={detail} />
    </AppShell>
  );
}
