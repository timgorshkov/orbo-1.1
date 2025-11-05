import { requireOrgAccess } from '@/lib/orgGuard'
import { notFound } from 'next/navigation'
import { createClientServer } from '@/lib/server/supabaseServer'
import ActivityTimeline from '@/components/analytics/activity-timeline'
import TopContributors from '@/components/analytics/top-contributors'
import KeyMetrics from '@/components/analytics/key-metrics'
import ActivityHeatmap from '@/components/analytics/activity-heatmap'

interface PageProps {
  params: {
    org: string;
    id: string;
  };
}

export default async function GroupAnalyticsPage({ params }: PageProps) {
  try {
    await requireOrgAccess(params.org);
    const supabase = await createClientServer();

    // Fetch group info
    const { data: group, error } = await supabase
      .from('telegram_groups')
      .select('id, title, tg_chat_id')
      .eq('tg_chat_id', params.id)
      .single();

    if (error || !group) {
      console.error('Error fetching group:', error);
      return notFound();
    }

    // Check if group is assigned to this organization
    const { data: mapping } = await supabase
      .from('org_telegram_groups')
      .select('org_id')
      .eq('org_id', params.org)
      .eq('tg_chat_id', group.tg_chat_id)
      .maybeSingle();

    if (!mapping) {
      console.error('Group not assigned to this organization');
      return notFound();
    }

    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Аналитика группы</h1>
          <p className="text-neutral-600 mt-1">{group.title}</p>
        </div>

        {/* Analytics Section */}
        <div className="space-y-6">
          {/* Activity Timeline + Heatmap */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ActivityTimeline orgId={params.org} tgChatId={group.tg_chat_id.toString()} days={30} />
            <ActivityHeatmap orgId={params.org} tgChatId={group.tg_chat_id.toString()} days={30} />
          </div>

          {/* Top Contributors + Key Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopContributors orgId={params.org} tgChatId={group.tg_chat_id.toString()} limit={10} />
            <KeyMetrics orgId={params.org} tgChatId={group.tg_chat_id.toString()} periodDays={14} />
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Group analytics error:', error);
    return notFound();
  }
}

