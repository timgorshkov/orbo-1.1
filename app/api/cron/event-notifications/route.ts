import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'

// Force dynamic rendering for cron endpoints
export const dynamic = 'force-dynamic'

// GET /api/cron/event-notifications - Send scheduled event notifications
// This endpoint should be called by a cron job (e.g., Vercel Cron, every hour)
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createAdminServer()
    const now = new Date()

    // Calculate time windows
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const twentyFiveHoursFromNow = new Date(now.getTime() + 25 * 60 * 60 * 1000)

    // Fetch published events that need notifications
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('*, organizations(name, slug)')
      .eq('status', 'published')
      .gte('event_date', now.toISOString().split('T')[0])

    if (eventsError) {
      console.error('Error fetching events:', eventsError)
      return NextResponse.json({ error: eventsError.message }, { status: 500 })
    }

    if (!events || events.length === 0) {
      return NextResponse.json({ message: 'No events to process' })
    }

    const results: any[] = []

    // Process each event
    for (const event of events) {
      // Combine date and time for comparison
      const eventDate = new Date(event.event_date)
      const [startHour, startMin] = event.start_time.split(':').map(Number)
      const eventDateTime = new Date(eventDate)
      eventDateTime.setHours(startHour, startMin, 0, 0)

      // Check if event needs day-before notification (23-25 hours before event)
      const needsDayBeforeNotification = 
        eventDateTime.getTime() >= oneDayFromNow.getTime() &&
        eventDateTime.getTime() <= twentyFiveHoursFromNow.getTime()

      // Check if event needs hour-before notification (1-2 hours before event)
      const needsHourBeforeNotification = 
        eventDateTime.getTime() >= oneHourFromNow.getTime() &&
        eventDateTime.getTime() <= twoHoursFromNow.getTime()

      if (!needsDayBeforeNotification && !needsHourBeforeNotification) {
        continue
      }

      const notificationType = needsDayBeforeNotification ? 'day_before' : 'hour_before'

      // Check if notification already sent
      const { data: existingNotifications } = await supabase
        .from('event_telegram_notifications')
        .select('id')
        .eq('event_id', event.id)
        .eq('notification_type', notificationType)
        .eq('status', 'sent')

      if (existingNotifications && existingNotifications.length > 0) {
        continue // Already sent
      }

      // Get telegram groups for this org (only connected ones)
      const { data: groups, error: groupsError } = await supabase
        .from('telegram_groups')
        .select('*')
        .eq('org_id', event.org_id)
        .eq('bot_status', 'connected')

      if (groupsError || !groups || groups.length === 0) {
        continue
      }

      // Construct notification message
      const eventDateStr = eventDate.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
      const timeStr = `${event.start_time.substring(0, 5)} - ${event.end_time.substring(0, 5)}`

      const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://orbo.app'}/p/${event.organizations.slug}/events/${event.id}`

      let message = ''
      if (notificationType === 'day_before') {
        message = `⏰ <b>Напоминание: завтра событие!</b>\n\n`
      } else {
        message = `🔔 <b>Событие начинается через час!</b>\n\n`
      }

      message += `📅 <b>${event.title}</b>\n\n`
      
      if (event.description) {
        const shortDescription = event.description.length > 150 
          ? event.description.substring(0, 150) + '...'
          : event.description
        message += `${shortDescription}\n\n`
      }

      message += `🗓 ${eventDateStr}\n`
      message += `🕐 ${timeStr}\n`

      if (event.location_info) {
        if (event.event_type === 'online') {
          message += `🌐 Онлайн\n`
        } else {
          message += `📍 ${event.location_info}\n`
        }
      }

      message += `\n🔗 <a href="${publicUrl}">Подробнее</a>`

      // Get bot token
      const botToken = process.env.TELEGRAM_BOT_TOKEN
      if (!botToken) {
        console.error('Telegram bot token not configured')
        continue
      }

      // Send to all groups
      for (const group of groups) {
        try {
          const telegramResponse = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: group.tg_chat_id,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: false
              })
            }
          )

          const telegramData = await telegramResponse.json()

          if (telegramData.ok) {
            await supabase
              .from('event_telegram_notifications')
              .insert({
                event_id: event.id,
                tg_group_id: group.id,
                notification_type: notificationType,
                scheduled_at: now.toISOString(),
                sent_at: now.toISOString(),
                message_id: telegramData.result.message_id,
                status: 'sent'
              })

            results.push({
              event_id: event.id,
              event_title: event.title,
              group_id: group.id,
              group_title: group.title,
              notification_type: notificationType,
              success: true
            })
          } else {
            await supabase
              .from('event_telegram_notifications')
              .insert({
                event_id: event.id,
                tg_group_id: group.id,
                notification_type: notificationType,
                scheduled_at: now.toISOString(),
                status: 'failed',
                error_message: telegramData.description || 'Unknown error'
              })

            results.push({
              event_id: event.id,
              event_title: event.title,
              group_id: group.id,
              group_title: group.title,
              notification_type: notificationType,
              success: false,
              error: telegramData.description
            })
          }
        } catch (error: any) {
          console.error(`Error sending to group ${group.id}:`, error)
          results.push({
            event_id: event.id,
            event_title: event.title,
            group_id: group.id,
            group_title: group.title,
            notification_type: notificationType,
            success: false,
            error: error.message
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results
    })
  } catch (error: any) {
    console.error('Error in event notifications cron:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

