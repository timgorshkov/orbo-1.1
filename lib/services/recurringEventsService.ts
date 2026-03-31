import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import { createEventReminders, deleteEventReminders } from '@/lib/services/announcementService'

const logger = createServiceLogger('RecurringEventsService')

export interface RecurrenceRule {
  frequency: 'weekly' | 'biweekly' | 'monthly'
  day_of_week?: number    // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
  day_of_month?: number   // 1-31, for monthly
  end_date?: string | null // 'YYYY-MM-DD' or null = indefinite
}

/**
 * Computes the next occurrence date strictly after `afterDate`.
 * For sequential generation (pass previous occurrence as afterDate).
 * For weekly/biweekly: finds the next matching day_of_week.
 * For monthly: same day_of_month in the next applicable month.
 */
export function getNextOccurrenceDate(rule: RecurrenceRule, afterDate: Date): Date {
  const d = new Date(afterDate)
  d.setHours(0, 0, 0, 0)
  // Move one day forward so we never return the same date
  d.setDate(d.getDate() + 1)

  if (rule.frequency === 'weekly' || rule.frequency === 'biweekly') {
    const step = rule.frequency === 'biweekly' ? 14 : 7
    // JS getDay(): 0=Sun,1=Mon,...,6=Sat → convert our 1=Mon..7=Sun
    const targetDayJS = rule.day_of_week === 7 ? 0 : (rule.day_of_week ?? 1)

    // Walk forward until we hit the target day of week
    while (d.getDay() !== targetDayJS) {
      d.setDate(d.getDate() + 1)
    }

    // For biweekly: after finding the first target day, we need to check parity.
    // We use occurrence parity based on ISO week number from the afterDate's last occurrence.
    // Simpler approach: caller uses this sequentially, passing last occurrence each time.
    // For biweekly the step is 14 days — after finding the matching weekday,
    // if step=14 and we landed on the very next weekday occurrence but it's only +7 from
    // a biweekly series, we need to skip one more week.
    // Since callers always pass the PREVIOUS occurrence, just add the step directly:
    if (rule.frequency === 'biweekly') {
      // Reset to afterDate+1 and add step from afterDate
      const base = new Date(afterDate)
      base.setHours(0, 0, 0, 0)
      base.setDate(base.getDate() + step)
      // Snap to target day of week from base (handles any drift)
      while (base.getDay() !== targetDayJS) {
        base.setDate(base.getDate() + 1)
      }
      return base
    }
  } else if (rule.frequency === 'monthly') {
    const targetDay = rule.day_of_month ?? 1
    // If current month's target day is still ahead, use it; otherwise next month
    const candidate = new Date(d.getFullYear(), d.getMonth(), targetDay)
    if (candidate > afterDate) {
      return candidate
    }
    return new Date(d.getFullYear(), d.getMonth() + 1, targetDay)
  }

  return d
}

/**
 * Generates an array of {date, index} for occurrences in [afterDate, toDate].
 * startIndex is the occurrence_index of the last already-existing child (0 if none).
 */
export function computeOccurrenceDates(
  rule: RecurrenceRule,
  afterDate: Date,
  toDate: Date,
  startIndex: number = 0
): Array<{ date: Date; index: number }> {
  const results: Array<{ date: Date; index: number }> = []
  let current = new Date(afterDate)
  current.setHours(0, 0, 0, 0)
  let index = startIndex

  const endDate = rule.end_date ? new Date(rule.end_date) : null

  for (let i = 0; i < 200; i++) { // safety cap
    const next = getNextOccurrenceDate(rule, current)

    if (next > toDate) break
    if (endDate && next > endDate) break

    index++
    results.push({ date: next, index })
    current = next
  }

  return results
}

/**
 * Human-readable recurrence label.
 * e.g. "Каждую среду", "Каждые 2 недели по четвергам", "Ежемесячно 15-го числа"
 */
export function formatRecurrenceLabel(rule: RecurrenceRule): string {
  const days = ['', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье']
  const daysGen = ['', 'понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям']

  if (rule.frequency === 'weekly' && rule.day_of_week) {
    return `Каждую ${days[rule.day_of_week]}`
  }
  if (rule.frequency === 'biweekly' && rule.day_of_week) {
    return `Каждые 2 недели по ${daysGen[rule.day_of_week]}`
  }
  if (rule.frequency === 'monthly' && rule.day_of_month) {
    return `Ежемесячно ${rule.day_of_month}-го числа`
  }
  return 'Регулярное мероприятие'
}

/**
 * Short day-of-week label for display in event cards.
 * e.g. "Ср", "Чт"
 */
export function getShortDayLabel(dayOfWeek: number): string {
  const labels = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
  return labels[dayOfWeek] ?? ''
}

/**
 * Inserts child event records for [fromDate, toDate] and creates announcements.
 * Fetches existing children to determine startIndex and last date.
 */
export async function generateAndScheduleInstances(
  parentEvent: {
    id: string
    org_id: string
    title: string
    description: string | null
    event_type: string
    location_info: string | null
    start_time: string
    end_time: string
    status: string
    is_public: boolean
    created_by: string
    recurrence_rule: RecurrenceRule
    cover_image_url?: string | null
    telegram_group_link?: string | null
    capacity?: number | null
    requires_payment?: boolean
    default_price?: number | null
    currency?: string | null
    payment_deadline_days?: number | null
    payment_instructions?: string | null
    payment_link?: string | null
    registration_fields_config?: any
    enable_qr_checkin?: boolean
    show_participants_list?: boolean
  },
  fromDate: Date,
  toDate: Date,
  targetGroups: string[],
  useMiniAppLink: boolean = true
): Promise<number> {
  const db = createAdminServer()
  const rule = parentEvent.recurrence_rule

  // Find the last existing child to get startIndex and last date
  const { data: lastChild } = await db
    .from('events')
    .select('event_date, occurrence_index')
    .eq('parent_event_id', parentEvent.id)
    .order('occurrence_index', { ascending: false })
    .limit(1)
    .maybeSingle()

  const startIndex = lastChild?.occurrence_index ?? 0
  const lastDate = lastChild?.event_date
    ? new Date(lastChild.event_date)
    : new Date(fromDate.getTime() - 24 * 60 * 60 * 1000) // one day before fromDate

  const occurrences = computeOccurrenceDates(rule, lastDate, toDate, startIndex)

  if (occurrences.length === 0) return 0

  // Build child event records
  const childEvents = occurrences.map(({ date, index }) => {
    const dateStr = date.toISOString().split('T')[0]
    return {
      org_id: parentEvent.org_id,
      title: parentEvent.title,
      description: parentEvent.description,
      cover_image_url: parentEvent.cover_image_url ?? null,
      event_type: parentEvent.event_type,
      location_info: parentEvent.location_info,
      start_time: parentEvent.start_time,
      end_time: parentEvent.end_time,
      event_date: dateStr,
      status: parentEvent.status,
      is_public: parentEvent.is_public,
      created_by: parentEvent.created_by,
      parent_event_id: parentEvent.id,
      occurrence_index: index,
      is_recurring: false, // children are not themselves recurring
      telegram_group_link: parentEvent.telegram_group_link ?? null,
      capacity: parentEvent.capacity ?? null,
      requires_payment: parentEvent.requires_payment ?? false,
      default_price: parentEvent.default_price ?? null,
      currency: parentEvent.currency ?? 'RUB',
      payment_deadline_days: parentEvent.payment_deadline_days ?? 3,
      payment_instructions: parentEvent.payment_instructions ?? null,
      payment_link: parentEvent.payment_link ?? null,
      registration_fields_config: parentEvent.registration_fields_config ?? null,
      enable_qr_checkin: parentEvent.enable_qr_checkin ?? true,
      show_participants_list: parentEvent.show_participants_list ?? true,
    }
  })

  const { data: inserted, error } = await db
    .from('events')
    .insert(childEvents)
    .select('id, event_date, start_time, org_id')

  if (error || !inserted) {
    logger.error({ error: error?.message, parent_id: parentEvent.id }, 'Failed to insert child events')
    return 0
  }

  logger.info({
    parent_id: parentEvent.id,
    count: inserted.length,
    from: fromDate.toISOString().split('T')[0],
    to: toDate.toISOString().split('T')[0]
  }, 'Generated recurring instances')

  // Create announcements for each new child (only for future instances)
  if (targetGroups.length > 0) {
    const now = new Date()
    for (const child of inserted) {
      const dateStr = typeof child.event_date === 'string'
        ? child.event_date.split('T')[0]
        : new Date(child.event_date).toISOString().split('T')[0]
      const timeStr = child.start_time?.substring(0, 5) ?? '10:00'
      const eventStartTime = new Date(`${dateStr}T${timeStr}:00+03:00`)

      if (eventStartTime > now) {
        try {
          await createEventReminders(
            child.id,
            child.org_id,
            parentEvent.title,
            parentEvent.description,
            eventStartTime,
            parentEvent.location_info,
            targetGroups,
            useMiniAppLink,
            parentEvent.event_type as 'online' | 'offline'
          )
        } catch (err) {
          logger.error({ error: String(err), child_id: child.id }, 'Failed to create reminders for instance')
        }
      }
    }
  }

  return inserted.length
}

/**
 * Cancels all scheduled announcements for an event, then recreates them.
 * Used when an event's time/location changes.
 */
export async function rescheduleAnnouncements(
  eventId: string,
  orgId: string,
  title: string,
  description: string | null,
  eventStartTime: Date,
  locationInfo: string | null,
  eventType: string,
  targetGroups: string[],
  targetTopics: Record<string, number> = {}
): Promise<void> {
  const db = createAdminServer()

  // Cancel pending announcements
  await db
    .from('announcements')
    .update({ status: 'cancelled' })
    .eq('event_id', eventId)
    .eq('status', 'scheduled')

  // Only recreate if event is in the future
  const now = new Date()
  if (eventStartTime <= now || targetGroups.length === 0) return

  await createEventReminders(
    eventId,
    orgId,
    title,
    description,
    eventStartTime,
    locationInfo,
    targetGroups,
    true,
    eventType as 'online' | 'offline',
    targetTopics
  )
}

/**
 * Returns the nearest future child instance for a given parent event.
 */
export async function getNextInstance(
  parentEventId: string
): Promise<{ id: string; event_date: string; start_time: string } | null> {
  const db = createAdminServer()
  const today = new Date().toISOString().split('T')[0]

  const { data } = await db
    .from('events')
    .select('id, event_date, start_time')
    .eq('parent_event_id', parentEventId)
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data ?? null
}

/**
 * Returns upcoming child instances for a parent (for the "next dates" block).
 */
export async function getFutureInstances(
  parentEventId: string,
  limit: number = 8
): Promise<Array<{ id: string; event_date: string; start_time: string; occurrence_index: number }>> {
  const db = createAdminServer()
  const today = new Date().toISOString().split('T')[0]

  const { data } = await db
    .from('events')
    .select('id, event_date, start_time, occurrence_index')
    .eq('parent_event_id', parentEventId)
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .limit(limit)

  return data ?? []
}

/**
 * Returns the previous child instance relative to a given occurrence_index.
 */
export async function getPreviousInstance(
  parentEventId: string,
  currentOccurrenceIndex: number
): Promise<{ id: string; event_date: string } | null> {
  const db = createAdminServer()

  const { data } = await db
    .from('events')
    .select('id, event_date')
    .eq('parent_event_id', parentEventId)
    .lt('occurrence_index', currentOccurrenceIndex)
    .order('occurrence_index', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data ?? null
}

/**
 * Returns the next child instance relative to a given occurrence_index.
 */
export async function getNextInstanceByIndex(
  parentEventId: string,
  currentOccurrenceIndex: number
): Promise<{ id: string; event_date: string } | null> {
  const db = createAdminServer()

  const { data } = await db
    .from('events')
    .select('id, event_date')
    .eq('parent_event_id', parentEventId)
    .gt('occurrence_index', currentOccurrenceIndex)
    .order('occurrence_index', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data ?? null
}

/**
 * Fetches announcement defaults for an org (target groups + topics).
 * If announcement_defaults is configured, uses it; otherwise falls back to all active groups.
 */
export async function getOrgAnnouncementDefaults(orgId: string): Promise<{
  targetGroups: string[];
  targetTopics: Record<string, number>;
}> {
  const db = createAdminServer()

  const { data: org } = await db
    .from('organizations')
    .select('announcement_defaults')
    .eq('id', orgId)
    .single()

  const defaults = org?.announcement_defaults as {
    target_groups?: number[];
    target_topics?: Record<string, number>;
  } | null

  if (defaults?.target_groups && defaults.target_groups.length > 0) {
    return {
      targetGroups: defaults.target_groups.map(String),
      targetTopics: defaults.target_topics ?? {},
    }
  }

  // Fallback: all active groups, no topics
  const { data: orgGroups } = await db
    .from('org_telegram_groups')
    .select('tg_chat_id')
    .eq('org_id', orgId)
    .eq('status', 'active')

  return {
    targetGroups: (orgGroups ?? []).map(g => String(g.tg_chat_id)),
    targetTopics: {},
  }
}

/**
 * Fetches org telegram groups for an org (used when creating announcements).
 * @deprecated Use getOrgAnnouncementDefaults to also get default topics.
 */
export async function getOrgTargetGroups(orgId: string): Promise<string[]> {
  const { targetGroups } = await getOrgAnnouncementDefaults(orgId)
  return targetGroups
}
