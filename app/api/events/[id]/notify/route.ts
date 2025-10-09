import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'

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
      .select('*, organizations(name, slug)')
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

    // Get telegram groups using admin client
    const { data: groups, error: groupsError } = await adminSupabase
      .from('telegram_groups')
      .select('*')
      .in('id', groupIds)
      .eq('org_id', event.org_id)

    if (groupsError || !groups || groups.length === 0) {
      return NextResponse.json(
        { error: 'No valid groups found' },
        { status: 404 }
      )
    }

    // Format date and time
    const eventDate = new Date(event.event_date)
    const dateStr = eventDate.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    const timeStr = `${event.start_time.substring(0, 5)} - ${event.end_time.substring(0, 5)}`

    // Construct public link
    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://orbo.app'}/p/${event.organizations.slug}/events/${event.id}`

    // Construct message
    let message = `📅 <b>${event.title}</b>\n\n`
    
    if (event.description) {
      const shortDescription = event.description.length > 200 
        ? event.description.substring(0, 200) + '...'
        : event.description
      message += `${shortDescription}\n\n`
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
        console.error(`Error sending to group ${group.id}:`, error)
        results.push({
          group_id: group.id,
          group_title: group.title,
          success: false,
          error: error.message
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

