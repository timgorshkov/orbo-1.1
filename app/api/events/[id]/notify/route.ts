import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { telegramMarkdownToHtml } from '@/lib/utils/telegramMarkdownToHtml'

// POST /api/events/[id]/notify - Send Telegram notification for event
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const supabase = await createClientServer()
    const adminSupabase = createAdminServer()

    // Check authentication and admin rights
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event using admin client to bypass RLS
    const { data: event, error: eventError } = await adminSupabase
      .from('events')
      .select('*, organizations(name)')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      console.error('Event fetch error:', eventError)
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check admin rights
    const { data: membership } = await supabase
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
      console.error('Error fetching org group links:', linksError)
      return NextResponse.json(
        { error: 'Failed to fetch organization groups' },
        { status: 500 }
      )
    }

    const orgChatIds = (orgGroupLinks || []).map(link => String(link.tg_chat_id))
    
    console.log('Organization chat IDs:', orgChatIds)
    console.log('Requested group IDs:', groupIds)
    
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
      console.error('Error fetching all groups:', allGroupsError)
      return NextResponse.json(
        { error: 'Failed to fetch groups' },
        { status: 500 }
      )
    }
    
    // Filter groups that belong to this org
    const groups = (allGroups || []).filter(group => 
      orgChatIds.includes(String(group.tg_chat_id))
    )
    
    console.log(`Filtered ${groups.length} groups from ${allGroups?.length || 0} total`)

    if (!groups || groups.length === 0) {
      console.error('No valid groups found after filtering')
      console.log('Requested groupIds:', groupIds)
      console.log('Org chat IDs:', orgChatIds)
      console.log('All groups tg_chat_ids:', (allGroups || []).map(g => String(g.tg_chat_id)))
      return NextResponse.json(
        { error: 'No valid groups found for this organization' },
        { status: 404 }
      )
    }
    
    console.log(`Found ${groups.length} valid groups for event notification:`, groups.map(g => ({ id: g.id, title: g.title })))

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
      console.log('[Events] Message description after conversion:', descriptionHtml.substring(0, 200))
    }

    message += `🗓 ${dateStr}\n`
    message += `🕐 ${timeStr}\n`

    if (event.location_info) {
      if (event.event_type === 'online') {
        message += `🌐 Онлайн\n`
      } else {
        message += `📍 ${event.location_info}\n`
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

    // Send notifications to each group
    const results = []
    for (const group of groups) {
      try {
        // Send message via Telegram API
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
          console.error('[Events] Failed to send Telegram notification:', {
            group_id: group.id,
            group_title: group.title,
            chat_id: group.tg_chat_id,
            error_code: telegramData.error_code,
            description: telegramData.description,
            message_preview: message.substring(0, 100)
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
        console.error(`[Events] Error sending notification to group ${group.id}:`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          group_id: group.id,
          group_title: group.title,
          chat_id: group.tg_chat_id
        })
        results.push({
          group_id: group.id,
          group_title: group.title,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return NextResponse.json({
      success: true,
      results
    })
  } catch (error: any) {
    console.error('Error in POST /api/events/[id]/notify:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

