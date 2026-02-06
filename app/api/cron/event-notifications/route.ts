import { NextRequest, NextResponse } from 'next/server'
import { createCronLogger } from '@/lib/logger'

// Force dynamic rendering for cron endpoints
export const dynamic = 'force-dynamic'

// DEPRECATED: This cron endpoint is replaced by the announcements system.
// Group notifications for events are now handled through:
// 1. Auto-created announcements (createEventReminders in announcementService.ts)
// 2. The send-announcements cron job (/api/cron/send-announcements)
//
// This endpoint is kept for backward compatibility but does nothing.
// Personal DM reminders remain in /api/cron/send-event-reminders
export async function GET(request: NextRequest) {
  const logger = createCronLogger('event-notifications');
  
  logger.info({}, '⚠️ [DEPRECATED] event-notifications cron called — now handled by announcements system');
  
  return NextResponse.json({ 
    success: true, 
    deprecated: true,
    message: 'This endpoint is deprecated. Group event notifications are now managed through the announcements system (/api/cron/send-announcements). Personal DM reminders use /api/cron/send-event-reminders.',
    sent: 0
  });

  /* ORIGINAL CODE — KEPT FOR REFERENCE
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
      .select('*, organizations(name)')
      .eq('status', 'published')
      .gte('event_date', now.toISOString().split('T')[0])

    if (eventsError) {
      logger.error({ error: eventsError.message }, 'Error fetching events');
      return NextResponse.json({ error: eventsError.message }, { status: 500 })
    }

    if (!events || events.length === 0) {
      logger.info({}, 'No events to process');
      return NextResponse.json({ message: 'No events to process' })
    }
    
    logger.info({ events_count: events.length }, 'Found events to process');

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

      const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://orbo.app'}/p/${event.org_id}/events/${event.id}`

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
        // ✅ Конвертируем Telegram Markdown в HTML для Telegram API
        const descriptionHtml = telegramMarkdownToHtml(shortDescription)
        message += `${descriptionHtml}\n\n`
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
        logger.error({ event_id: event.id }, 'Telegram bot token not configured');
        continue
      }

      // Helper function to validate image URL for Telegram
      const isValidTelegramImageUrl = (url: string): boolean => {
        try {
          const parsed = new URL(url)
          // Telegram requires HTTPS and standard port (443 or no port specified)
          if (parsed.protocol !== 'https:') return false
          if (parsed.port && parsed.port !== '443') return false
          // Reject localhost or internal URLs
          if (parsed.hostname === 'localhost' || parsed.hostname.includes('127.0.0.1')) return false
          return true
        } catch {
          return false
        }
      }

      // Send to all groups
      for (const group of groups) {
        try {
          // Determine API endpoint and payload based on whether event has valid cover image
          let telegramResponse
          const hasValidCoverImage = event.cover_image_url && isValidTelegramImageUrl(event.cover_image_url)
          
          if (hasValidCoverImage) {
            // Send photo with caption if cover image exists and is valid
            telegramResponse = await fetch(
              `https://api.telegram.org/bot${botToken}/sendPhoto`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: group.tg_chat_id,
                  photo: event.cover_image_url,
                  caption: message,
                  parse_mode: 'HTML',
                  disable_web_page_preview: false
                })
              }
            )
          } else {
            // Send text message if no cover image
            telegramResponse = await fetch(
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
          }

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
            logger.warn({ 
              event_id: event.id,
              group_id: group.id,
              error: telegramData.description || 'Unknown error'
            }, 'Failed to send notification');
            
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
          logger.error({ 
            event_id: event.id,
            group_id: group.id,
            error: error.message || String(error),
            stack: error.stack
          }, 'Error sending to group');
          
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

    logger.info({ processed: results.length }, 'Event notifications cron completed');

    return NextResponse.json({
      success: true,
      processed: results.length,
      results
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in event notifications cron');
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
END OF DEPRECATED CODE */
