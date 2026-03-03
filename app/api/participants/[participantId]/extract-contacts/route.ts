import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { extractContactsFromMessages, type MessageWithContext } from '@/lib/services/enrichment/openaiService';
import { mergeCustomAttributes } from '@/lib/services/enrichment/customFieldsManager';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ participantId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/participants/[participantId]/extract-contacts' });
  let participantId: string | undefined;
  try {
    const paramsData = await params;
    participantId = paramsData.participantId;
    const adminSupabase = createAdminServer();
    const body = await request.json();
    const orgId = body.orgId as string | undefined;

    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 });
    }

    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden: owner/admin only' }, { status: 403 });
    }

    const { data: participant, error: pErr } = await adminSupabase
      .from('participants')
      .select('*')
      .eq('id', participantId)
      .eq('org_id', orgId)
      .single();

    if (pErr || !participant) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
    }

    // Gather messages from all org groups
    const { data: orgGroups } = await adminSupabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', orgId);
    const chatIds = (orgGroups || []).map((g: any) => Number(g.tg_chat_id));

    let allMessages: any[] = [];

    if (chatIds.length > 0 && participant.tg_user_id) {
      const { data: actEvents } = await adminSupabase
        .from('activity_events')
        .select('id, tg_user_id, tg_chat_id, message_id, event_type, created_at, meta')
        .in('tg_chat_id', chatIds)
        .eq('tg_user_id', participant.tg_user_id)
        .eq('event_type', 'message')
        .order('created_at', { ascending: false })
        .limit(300);
      allMessages = actEvents || [];
    }

    // MAX messages
    if (participant.max_user_id) {
      const { data: orgMaxGroups } = await adminSupabase
        .from('org_max_groups')
        .select('max_chat_id')
        .eq('org_id', orgId);
      const maxChatIds = (orgMaxGroups || []).map((g: any) => Number(g.max_chat_id));

      if (maxChatIds.length > 0) {
        const { data: maxMsgs } = await adminSupabase
          .from('activity_events')
          .select('id, max_user_id, max_chat_id, event_type, created_at, meta')
          .in('max_chat_id', maxChatIds)
          .eq('max_user_id', participant.max_user_id)
          .eq('event_type', 'message')
          .eq('messenger_type', 'max')
          .order('created_at', { ascending: false })
          .limit(300);

        if (maxMsgs && maxMsgs.length > 0) {
          const normalized = maxMsgs.map((m: any) => ({
            id: m.id,
            tg_user_id: participant.tg_user_id,
            tg_chat_id: m.max_chat_id,
            message_id: null,
            event_type: m.event_type,
            created_at: m.created_at,
            meta: { ...m.meta, messenger_type: 'max', text_preview: m.meta?.text },
          }));
          allMessages = [...allMessages, ...normalized];
        }
      }
    }

    // WhatsApp messages
    const { data: waMsgs } = await adminSupabase
      .from('activity_events')
      .select('id, tg_user_id, tg_chat_id, message_id, event_type, created_at, meta')
      .eq('org_id', orgId)
      .eq('tg_chat_id', 0)
      .eq('event_type', 'message')
      .contains('meta', { participant_id: participantId })
      .order('created_at', { ascending: false })
      .limit(300);

    if (waMsgs) {
      allMessages = [...allMessages, ...waMsgs];
    }

    // Fetch full texts from participant_messages
    const messageIds = allMessages.map(m => m.message_id).filter(Boolean);
    const fullTextsMap = new Map<number, string>();

    if (messageIds.length > 0 && participant.tg_user_id) {
      const { data: fullMessages } = await adminSupabase
        .from('participant_messages')
        .select('message_id, message_text')
        .eq('tg_user_id', participant.tg_user_id)
        .in('message_id', messageIds);

      if (fullMessages) {
        fullMessages.forEach((m: any) => {
          if (m.message_text) fullTextsMap.set(m.message_id, m.message_text);
        });
      }
    }

    // Build MessageWithContext[]
    const messagesWithContext: MessageWithContext[] = [];
    for (const msg of allMessages) {
      const fullText = msg.message_id ? fullTextsMap.get(msg.message_id) : null;
      const text =
        fullText ||
        msg.meta?.message?.text_preview ||
        msg.meta?.message?.text ||
        msg.meta?.text ||
        (typeof msg.meta === 'string' ? msg.meta : '');

      if (!text || text.trim().length === 0) continue;

      messagesWithContext.push({
        id: msg.id.toString(),
        text: text.trim(),
        author_name: participant.full_name || participant.username || 'Unknown',
        created_at: msg.created_at,
        is_participant: true,
      });
    }

    if (messagesWithContext.length === 0) {
      return NextResponse.json({
        success: true,
        contacts: { confidence: 0, tokens_used: 0, cost_usd: 0 },
        message: 'No messages found',
      });
    }

    const contacts = await extractContactsFromMessages(
      messagesWithContext,
      participant.full_name || participant.username || `ID${participant.tg_user_id || participant.max_user_id}`,
      orgId,
      user.id,
      participantId,
    );

    // Save extracted contacts:
    // 1. Phone → promote to main participant.phone if currently empty (since Telegram/MAX
    //    APIs do NOT expose phone numbers — a phone found in messages was shared by the user)
    // 2. Everything else → save in custom_attributes.ai_extracted_contacts (additional block)
    const hasData = contacts.phone || contacts.email || contacts.telegram_link || contacts.company || contacts.position;
    if (hasData && contacts.confidence >= 0.5) {
      const participantUpdate: Record<string, any> = {};

      // Promote phone to main field if participant has no phone yet
      if (contacts.phone && !participant.phone) {
        participantUpdate.phone = contacts.phone;
      }

      // Save full extraction result to custom_attributes
      const currentAttrs = participant.custom_attributes || {};
      const contactsPayload: Record<string, any> = {};
      if (contacts.phone) contactsPayload.phone = contacts.phone;
      if (contacts.email) contactsPayload.email = contacts.email;
      if (contacts.telegram_link) contactsPayload.telegram_link = contacts.telegram_link;
      if (contacts.company) contactsPayload.company = contacts.company;
      if (contacts.position) contactsPayload.position = contacts.position;
      contactsPayload.confidence = contacts.confidence;
      contactsPayload.extracted_at = new Date().toISOString();

      const merged = mergeCustomAttributes(
        currentAttrs,
        { ai_extracted_contacts: contactsPayload },
        { allowSystemFields: true }
      );

      participantUpdate.custom_attributes = merged;
      participantUpdate.updated_at = new Date().toISOString();

      await adminSupabase
        .from('participants')
        .update(participantUpdate)
        .eq('id', participantId);
    }

    return NextResponse.json({
      success: true,
      contacts,
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      participant_id: participantId || 'unknown',
    }, '[API] Contact extraction error');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
