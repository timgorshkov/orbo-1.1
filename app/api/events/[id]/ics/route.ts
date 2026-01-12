import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'

// Helper to format date for ICS
function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

// Helper to escape ICS text
function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

// Helper to fold long lines (ICS spec requires max 75 characters per line)
function foldLine(line: string): string {
  const maxLength = 75
  if (line.length <= maxLength) return line
  
  const lines: string[] = []
  let currentLine = line.substring(0, maxLength)
  let remaining = line.substring(maxLength)
  
  lines.push(currentLine)
  
  while (remaining.length > 0) {
    const chunk = remaining.substring(0, maxLength - 1)
    lines.push(' ' + chunk)
    remaining = remaining.substring(maxLength - 1)
  }
  
  return lines.join('\r\n')
}

// GET /api/events/[id]/ics - Generate ICS file for event
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/ics' });
  let eventId: string | undefined;
  try {
    const { id } = await params;
    eventId = id;
    const supabase = await createClientServer()

    // Fetch event
    const { data: event, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (error || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    
    // Fetch organization name separately
    let orgName = 'Organization'
    if (event.org_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', event.org_id)
        .single()
      
      if (org?.name) {
        orgName = org.name
      }
    }

    // Combine date and time - ensure we're working with valid dates
    const eventDate = new Date(event.event_date + 'T00:00:00Z')
    const [startHour, startMin] = event.start_time.split(':').map(Number)
    const [endHour, endMin] = event.end_time.split(':').map(Number)

    const startDateTime = new Date(eventDate)
    startDateTime.setUTCHours(startHour, startMin, 0, 0)

    const endDateTime = new Date(eventDate)
    endDateTime.setUTCHours(endHour, endMin, 0, 0)

    // Generate unique ID for the event
    const uid = `${eventId}@orbo.app`

    // Construct location
    let location = ''
    if (event.event_type === 'online') {
      location = event.location_info || 'Online'
    } else {
      location = event.location_info || 'TBD'
    }

    // Construct description (using proper newline escaping for ICS)
    let description = event.description || ''
    if (event.location_info && event.event_type === 'online') {
      description += `\n\nСсылка на подключение: ${event.location_info}`
    }
    if (event.event_type === 'offline' && event.map_link) {
      description += `\n\nМесто на карте: ${event.map_link}`
    }
    if (event.is_paid && event.price_info) {
      description += `\n\nСтоимость:\n${event.price_info}`
    }

    // Generate ICS content
    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Orbo//Events//RU',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:' + escapeICSText(event.title),
      'X-WR-TIMEZONE:Europe/Moscow',
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + formatICSDate(new Date()),
      'DTSTART:' + formatICSDate(startDateTime),
      'DTEND:' + formatICSDate(endDateTime),
      foldLine('SUMMARY:' + escapeICSText(event.title)),
      foldLine('DESCRIPTION:' + escapeICSText(description)),
      foldLine('LOCATION:' + escapeICSText(location)),
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      foldLine('ORGANIZER;CN=' + escapeICSText(orgName) + ':MAILTO:noreply@orbo.app'),
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + escapeICSText(event.title + ' начнется через 1 час'),
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + escapeICSText(event.title + ' завтра'),
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ]

    const icsContent = icsLines.join('\r\n')

    // Generate safe filename
    const safeTitle = event.title
      .replace(/[^a-zA-Z0-9а-яА-Я ]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50)

    // Create safe filename with ASCII-only characters
    const safeFilename = `event_${eventId.substring(0, 8)}.ics`

    // Convert to UTF-8 using TextEncoder (Web API, works in Edge Runtime)
    const encoder = new TextEncoder()
    const icsBuffer = encoder.encode(icsContent)

    // Return ICS file with proper headers
    return new NextResponse(icsBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Length': icsBuffer.length.toString(),
        'Cache-Control': 'no-cache'
      }
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      event_id: eventId || 'unknown'
    }, 'Error generating ICS file');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

