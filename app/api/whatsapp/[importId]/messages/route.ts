import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/whatsapp/[importId]/messages
 * 
 * Fetch messages for a WhatsApp import
 * Query params:
 * - limit: number of messages (default 50, max 200)
 * - offset: pagination offset
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ importId: string }> }
) {
  const logger = createAPILogger(req, { endpoint: '/api/whatsapp/[importId]/messages' });
  
  try {
    const { importId } = await params;
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    // Check authentication
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const adminSupabase = createAdminServer();
    
    // Get import details and verify access
    const { data: importData, error: importError } = await adminSupabase
      .from('whatsapp_imports')
      .select('id, org_id, group_name, date_range_start, date_range_end, messages_imported')
      .eq('id', importId)
      .single();
    
    if (importError || !importData) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 });
    }
    
    // Check org membership
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', importData.org_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    logger.info({ 
      importId, 
      orgId: importData.org_id, 
      limit, 
      offset,
      dateRangeStart: importData.date_range_start,
      dateRangeEnd: importData.date_range_end
    }, 'Fetching WhatsApp messages');
    
    // WhatsApp messages are stored in activity_events with tg_chat_id = 0 and meta.source = 'whatsapp'
    // We filter by date range of the import
    let query = adminSupabase
      .from('activity_events')
      .select('id, meta, chars_count, created_at')
      .eq('org_id', importData.org_id)
      .eq('tg_chat_id', 0)
      .eq('event_type', 'message')
      .contains('meta', { source: 'whatsapp' });
    
    // Filter by import date range
    if (importData.date_range_start) {
      query = query.gte('created_at', importData.date_range_start);
    }
    if (importData.date_range_end) {
      // Add a day buffer to include messages on the end date
      const endDate = new Date(importData.date_range_end);
      endDate.setDate(endDate.getDate() + 1);
      query = query.lt('created_at', endDate.toISOString());
    }
    
    // Filter by group name if available
    if (importData.group_name) {
      query = query.contains('meta', { group_name: importData.group_name });
    }
    
    // Order and paginate
    const { data: events, error: eventsError } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (eventsError) {
      logger.error({ error: eventsError.message }, 'Error fetching messages');
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }
    
    // Get participant IDs from events to fetch names
    const participantIds = Array.from(new Set(
      (events || [])
        .map(e => e.meta?.participant_id)
        .filter(Boolean)
    ));
    
    // Fetch participants
    let participantsMap: Record<string, any> = {};
    if (participantIds.length > 0) {
      const { data: participants } = await adminSupabase
        .from('participants')
        .select('id, full_name, phone, photo_url')
        .in('id', participantIds);
      
      if (participants) {
        participantsMap = Object.fromEntries(
          participants.map(p => [p.id, p])
        );
      }
    }
    
    // Transform to cleaner format
    const formattedMessages = (events || []).map(event => {
      const meta = event.meta || {};
      const participant = participantsMap[meta.participant_id];
      
      return {
        id: event.id,
        text: meta.text || null,
        sentAt: event.created_at,
        hasMedia: false, // WhatsApp imports don't include media
        mediaType: null,
        sender: {
          id: meta.participant_id || null,
          name: participant?.full_name || meta.original_sender || 'Неизвестный',
          phone: participant?.phone || null,
          photoUrl: participant?.photo_url || null,
        }
      };
    });
    
    return NextResponse.json({
      messages: formattedMessages,
      total: importData.messages_imported,
      hasMore: offset + limit < (importData.messages_imported || 0),
      import: {
        id: importData.id,
        groupName: importData.group_name,
        dateRangeStart: importData.date_range_start,
        dateRangeEnd: importData.date_range_end,
      }
    });
  } catch (error) {
    logger.error({ error }, 'Unexpected error in WhatsApp messages endpoint');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

