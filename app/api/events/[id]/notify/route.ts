import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { telegramMarkdownToHtml } from '@/lib/utils/telegramMarkdownToHtml'
import { logErrorToDatabase } from '@/lib/logErrorToDatabase'
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

// POST /api/events/[id]/notify - Send Telegram notification for event
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/notify' });
  try {
    const { id: eventId } = await params
    const body = await request.json()
    const { groupIds, notificationType = 'manual' } = body

    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
      return NextResponse.json(
        { error: 'No groups specified' },
        { status: 400 }
      )
    }

    const adminSupabase = createAdminServer()

    // Check authentication and admin rights via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event using admin client to bypass RLS
    const { data: event, error: eventError } = await adminSupabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      logger.error({ error: eventError?.message, event_id: eventId }, 'Event fetch error');
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check admin rights
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', event.org_id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can send notifications' },
        { status: 403 }
      )
    }

    // Get telegram groups using admin client and org_telegram_groups
    // First, get tg_chat_ids from org_telegram_groups for this org
    const { data: orgGroupLinks, error: linksError } = await adminSupabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', event.org_id)

    if (linksError) {
      logger.error({ error: linksError.message, org_id: event.org_id }, 'Error fetching org group links');
      return NextResponse.json(
        { error: 'Failed to fetch organization groups' },
        { status: 500 }
      )
    }

    const orgChatIds = (orgGroupLinks || []).map(link => String(link.tg_chat_id))
    
    logger.debug({ 
      org_chat_ids: orgChatIds,
      requested_group_ids: groupIds
    }, 'Organization chat IDs and requested group IDs');
    
    if (orgChatIds.length === 0) {
      return NextResponse.json(
        { error: 'No groups found for this organization' },
        { status: 404 }
      )
    }

    // Get full group info for requested groups that belong to this org
    // Convert tg_chat_id to string for comparison
    const { data: allGroups, error: allGroupsError } = await adminSupabase
      .from('telegram_groups')
      .select('*')
      .in('id', groupIds)
    
    if (allGroupsError) {
      logger.error({ error: allGroupsError.message, group_ids: groupIds }, 'Error fetching all groups');
      return NextResponse.json(
        { error: 'Failed to fetch groups' },
        { status: 500 }
      )
    }
    
    // Filter groups that belong to this org
    const groups = (allGroups || []).filter(group => 
      orgChatIds.includes(String(group.tg_chat_id))
    )
    
    logger.debug({ 
      filtered_count: groups.length,
      total_count: allGroups?.length || 0
    }, 'Filtered groups');

    if (!groups || groups.length === 0) {
      logger.error({ 
        requested_group_ids: groupIds,
        org_chat_ids: orgChatIds,
        all_groups_tg_chat_ids: (allGroups || []).map(g => String(g.tg_chat_id))
      }, 'No valid groups found after filtering');
      return NextResponse.json(
        { error: 'No valid groups found for this organization' },
        { status: 404 }
      )
    }
    
    logger.info({ 
      groups_count: groups.length,
      groups: groups.map(g => ({ id: g.id, title: g.title }))
    }, 'Found valid groups for event notification');

    // Format date and time
    const eventDate = new Date(event.event_date)
    const dateStr = eventDate.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    const timeStr = `${event.start_time.substring(0, 5)} - ${event.end_time.substring(0, 5)}`

    // Construct public link
    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://orbo.app'}/p/${event.org_id}/events/${event.id}`

    // Construct message
    let message = `📅 <b>${event.title}</b>\n\n`
    
    if (event.description) {
      const shortDescription = event.description.length > 200 
        ? event.description.substring(0, 200) + '...'
        : event.description
      // ✅ Конвертируем Telegram Markdown в HTML для Telegram API
      // Функция сохраняет уже существующие HTML теги (например, <b>, <a>)
      const descriptionHtml = telegramMarkdownToHtml(shortDescription)
      message += `${descriptionHtml}\n\n`
      
      // Логируем для отладки (первые 200 символов)
      logger.debug({ 
        description_preview: descriptionHtml.substring(0, 200)
      }, '[Events] Message description after conversion');
    }

    message += `🗓 ${dateStr}\n`
    message += `🕐 ${timeStr}\n`

    if (event.event_type === 'online') {
      message += `🌐 Онлайн\n`
    } else if (event.location_info) {
      message += `📍 ${event.location_info}\n`
      if (event.map_link) {
        message += `🗺 <a href="${event.map_link}">Место на карте</a>\n`
      }
    }

    if (event.is_paid && event.price_info) {
      message += `💰 Платное\n`
    }

    if (event.capacity) {
      const availableSpots = Math.max(0, event.capacity - (event.registered_count || 0))
      if (availableSpots > 0) {
        message += `\n👥 Осталось мест: ${availableSpots}\n`
      }
    }

    message += `\n🔗 <a href="${publicUrl}">Подробнее и регистрация</a>`

    // Get bot token from environment
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return NextResponse.json(
        { error: 'Telegram bot token not configured' },
        { status: 500 }
      )
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

    // Send notifications to each group
    const results = []
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
          // Save notification record using admin client
          await adminSupabase
            .from('event_telegram_notifications')
            .insert({
              event_id: eventId,
              tg_group_id: group.id,
              notification_type: notificationType,
              sent_at: new Date().toISOString(),
              message_id: telegramData.result.message_id,
              status: 'sent'
            })

          results.push({
            group_id: group.id,
            group_title: group.title,
            success: true
          })
        } else {
          // Log error details for debugging
          logger.error({ 
            group_id: group.id,
            group_title: group.title,
            chat_id: group.tg_chat_id,
            error_code: telegramData.error_code,
            description: telegramData.description,
            message_preview: message.substring(0, 100)
          }, '[Events] Failed to send Telegram notification');

          // Log to error database
          await logErrorToDatabase({
            level: 'error',
            message: `Failed to publish event to Telegram: ${telegramData.description || 'Unknown error'}`,
            errorCode: 'EVENT_PUBLISH_TG_ERROR',
            context: {
              endpoint: '/api/events/[id]/notify',
              eventId,
              groupId: group.id,
              groupTitle: group.title,
              chatId: group.tg_chat_id,
              telegramErrorCode: telegramData.error_code
            },
            orgId: event.org_id
          })

          // Save failed notification using admin client
          await adminSupabase
            .from('event_telegram_notifications')
            .insert({
              event_id: eventId,
              tg_group_id: group.id,
              notification_type: notificationType,
              status: 'failed',
              error_message: telegramData.description || 'Unknown error'
            })

          results.push({
            group_id: group.id,
            group_title: group.title,
            success: false,
            error: telegramData.description
          })
        }
      } catch (error: any) {
        logger.error({ 
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          group_id: group.id,
          group_title: group.title,
          chat_id: group.tg_chat_id
        }, `[Events] Error sending notification to group ${group.id}`);

        await logErrorToDatabase({
          level: 'error',
          message: `Exception while publishing event to Telegram: ${error instanceof Error ? error.message : 'Unknown error'}`,
          errorCode: 'EVENT_PUBLISH_TG_ERROR',
          context: {
            endpoint: '/api/events/[id]/notify',
            eventId,
            groupId: group.id,
            chatId: group.tg_chat_id,
            errorType: error.constructor?.name || typeof error
          },
          stackTrace: error instanceof Error ? error.stack : undefined,
          orgId: event.org_id
        })

        results.push({
          group_id: group.id,
          group_title: group.title,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    // Log admin action for successful notifications
    const successfulNotifications = results.filter(r => r.success)
    if (successfulNotifications.length > 0) {
      await logAdminAction({
        orgId: event.org_id,
        userId: user.id,
        action: AdminActions.PUBLISH_EVENT_TG,
        resourceType: ResourceTypes.EVENT,
        resourceId: eventId,
        metadata: {
          event_title: event.title,
          groups_count: successfulNotifications.length,
          groups: successfulNotifications.map(r => r.group_title).slice(0, 5)
        }
      })
    }

    return NextResponse.json({
      success: true,
      results
    })
  } catch (error: any) {
    await logErrorToDatabase({
      level: 'error',
      message: error.message || 'Unknown error in event notification',
      errorCode: 'EVENT_NOTIFY_ERROR',
      context: {
        endpoint: '/api/events/[id]/notify',
        errorType: error.constructor?.name || typeof error
      },
      stackTrace: error.stack
    })
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

