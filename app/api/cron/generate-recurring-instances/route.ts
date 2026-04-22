import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createCronLogger } from '@/lib/logger';
import { generateAndScheduleInstances, getOrgAnnouncementDefaults } from '@/lib/services/recurringEventsService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cron job to generate recurring event instances 4 weeks ahead
// Should run a few times per week (e.g. Mon/Wed/Fri)
export async function GET(request: NextRequest) {
  const logger = createCronLogger('generate-recurring-instances');

  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.info({}, '🔄 Starting recurring instances generation');

    const adminSupabase = createAdminServer();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 28); // 4 weeks ahead

    // Find all active recurring series parents
    const { data: parents, error: parentsError } = await adminSupabase
      .from('events')
      .select('id, org_id, title, description, event_type, location_info, start_time, end_time, is_paid, price_info, requires_payment, capacity, status, is_public, recurrence_rule, event_date')
      .eq('is_recurring', true)
      .is('parent_event_id', null)
      .eq('status', 'published');

    if (parentsError) {
      logger.error({ error: parentsError.message }, 'Error fetching recurring parents');
      return NextResponse.json({ error: parentsError.message }, { status: 500 });
    }

    if (!parents || parents.length === 0) {
      logger.info({}, 'No active recurring series found');
      return NextResponse.json({ success: true, message: 'No active recurring series', generated: 0 });
    }

    let totalGenerated = 0;
    const errors: string[] = [];

    for (const parent of parents) {
      try {
        // Skip if series has ended (end_date in recurrence_rule is in the past)
        const rule = parent.recurrence_rule as any;
        if (rule?.end_date && new Date(rule.end_date) < today) {
          logger.debug({ parent_id: parent.id }, 'Skipping ended series');
          continue;
        }

        // Find the last child's event_date (MAX), or parent's event_date if none
        const { data: lastChild } = await adminSupabase
          .from('events')
          .select('event_date, occurrence_index')
          .eq('parent_event_id', parent.id)
          .order('occurrence_index', { ascending: false })
          .limit(1);

        const lastDate = lastChild && lastChild.length > 0
          ? new Date(lastChild[0].event_date)
          : new Date(parent.event_date);
        lastDate.setHours(0, 0, 0, 0);

        const startIndex = lastChild && lastChild.length > 0
          ? (lastChild[0].occurrence_index || 0) + 1
          : 1;

        // Only generate if last occurrence is within 2 weeks of horizon
        // (i.e. we need more instances)
        if (lastDate >= horizon) {
          logger.debug({ parent_id: parent.id, last_date: lastDate.toISOString() }, 'Skipping — already generated far enough ahead');
          continue;
        }

        // Get org's announcement defaults (TG groups + MAX groups + topics)
        const { targetGroups, targetTopics, targetMaxGroups } = await getOrgAnnouncementDefaults(parent.org_id);

        // Generate instances from lastDate up to horizon
        const useMiniAppLink = true; // default
        const beforeCount = await countChildren(adminSupabase, parent.id);

        await generateAndScheduleInstances(
          { ...parent, occurrence_index: startIndex - 1 },
          lastDate,
          horizon,
          targetGroups,
          useMiniAppLink,
          targetTopics,
          targetMaxGroups
        );

        const afterCount = await countChildren(adminSupabase, parent.id);
        const newInstances = afterCount - beforeCount;

        if (newInstances > 0) {
          totalGenerated += newInstances;
          logger.info({
            parent_id: parent.id,
            parent_title: parent.title,
            org_id: parent.org_id,
            new_instances: newInstances
          }, `✅ Generated ${newInstances} new instances`);
        }

      } catch (err: any) {
        const msg = err?.message || String(err);
        logger.error({ parent_id: parent.id, error: msg }, 'Error generating instances for series');
        errors.push(`Parent ${parent.id}: ${msg}`);
      }
    }

    logger.info({
      total_generated: totalGenerated,
      series_processed: parents.length,
      errors_count: errors.length
    }, '✅ Completed recurring instances generation');

    return NextResponse.json({
      success: true,
      message: `Generated ${totalGenerated} new instances across ${parents.length} series`,
      generated: totalGenerated,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined
    });

  } catch (error: any) {
    logger.error({
      error: error.message || String(error),
      stack: error.stack
    }, '❌ Fatal error in generate-recurring-instances');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function countChildren(adminSupabase: any, parentId: string): Promise<number> {
  const { data } = await adminSupabase
    .from('events')
    .select('id')
    .eq('parent_event_id', parentId);
  return data?.length || 0;
}
