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
      offset 
    }, 'Fetching WhatsApp messages');
    
    // WhatsApp messages have tg_chat_id = 0 and are linked via org_id
    // We filter by date range of the import
    let query = adminSupabase
      .from('participant_messages')
      .select(`
        id,
        message_text,
        sent_at,
        participant_id,
        tg_user_id,
        has_media,
        media_type,
        participants!participant_messages_participant_id_fkey (
          id,
          full_name,
          username,
          phone,
          photo_url
        )
      `)
      .eq('org_id', importData.org_id)
      .eq('tg_chat_id', 0); // WhatsApp messages have tg_chat_id = 0
    
    // Filter by import date range
    if (importData.date_range_start) {
      query = query.gte('sent_at', importData.date_range_start);
    }
    if (importData.date_range_end) {
      query = query.lte('sent_at', importData.date_range_end);
    }
    
    // Order and paginate
    const { data: messages, error: messagesError, count } = await query
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (messagesError) {
      logger.error({ error: messagesError.message }, 'Error fetching messages');
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }
    
    // Transform to cleaner format
    const formattedMessages = (messages || []).map(msg => ({
      id: msg.id,
      text: msg.message_text,
      sentAt: msg.sent_at,
      hasMedia: msg.has_media,
      mediaType: msg.media_type,
      sender: msg.participants ? {
        id: (msg.participants as any).id,
        name: (msg.participants as any).full_name || (msg.participants as any).phone || 'Неизвестный',
        phone: (msg.participants as any).phone,
        photoUrl: (msg.participants as any).photo_url,
      } : {
        id: null,
        name: 'Неизвестный',
        phone: null,
        photoUrl: null,
      }
    }));
    
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

