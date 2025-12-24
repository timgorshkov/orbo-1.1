import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/whatsapp/[importId]/add-tag
 * 
 * Add a tag to all participants from this WhatsApp import
 * Body: { tagId: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ importId: string }> }
) {
  const logger = createAPILogger(req, { endpoint: '/api/whatsapp/[importId]/add-tag' });
  
  try {
    const { importId } = await params;
    const body = await req.json();
    const { tagId } = body;
    
    if (!tagId) {
      return NextResponse.json({ error: 'tagId is required' }, { status: 400 });
    }
    
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const adminSupabase = createAdminServer();
    
    // Get import details (including created_at/completed_at for participant linking)
    const { data: importData, error: importError } = await adminSupabase
      .from('whatsapp_imports')
      .select('id, org_id, group_name, date_range_start, date_range_end, created_at, completed_at')
      .eq('id', importId)
      .single();
    
    if (importError || !importData) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 });
    }
    
    // Check admin role
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', importData.org_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    // Verify tag belongs to this org
    const { data: tag, error: tagError } = await adminSupabase
      .from('participant_tags')
      .select('id, name')
      .eq('id', tagId)
      .eq('org_id', importData.org_id)
      .single();
    
    if (tagError || !tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }
    
    logger.info({ 
      importId, 
      tagId, 
      tagName: tag.name,
      orgId: importData.org_id,
      groupName: importData.group_name,
      dateRangeStart: importData.date_range_start,
      dateRangeEnd: importData.date_range_end
    }, 'Adding tag to WhatsApp import participants');
    
    // We use multiple strategies to find ALL participants from this import
    // and COMBINE results (not fallback) to ensure complete coverage
    const participantIdSet = new Set<string>();
    
    // Strategy 1: Find participants via activity_events (for message senders)
    // WhatsApp messages are stored in activity_events with meta.source='whatsapp'
    let eventsQuery = adminSupabase
      .from('activity_events')
      .select('meta')
      .eq('org_id', importData.org_id)
      .eq('tg_chat_id', 0)
      .eq('event_type', 'message')
      .contains('meta', { source: 'whatsapp' });
    
    // Filter by date range
    if (importData.date_range_start) {
      eventsQuery = eventsQuery.gte('created_at', importData.date_range_start);
    }
    if (importData.date_range_end) {
      const endDate = new Date(importData.date_range_end);
      endDate.setDate(endDate.getDate() + 1);
      eventsQuery = eventsQuery.lt('created_at', endDate.toISOString());
    }
    
    // Filter by group name if available
    if (importData.group_name) {
      eventsQuery = eventsQuery.contains('meta', { group_name: importData.group_name });
    }
    
    const { data: events, error: eventsError } = await eventsQuery;
    
    if (eventsError) {
      logger.error({ error: eventsError.message }, 'Error fetching events for participant IDs');
    } else if (events && events.length > 0) {
      // Extract unique participant IDs from events
      events.forEach(e => {
        if (e.meta?.participant_id) {
          participantIdSet.add(e.meta.participant_id);
        }
      });
      
      logger.info({ 
        eventsCount: events.length,
        uniqueFromEvents: participantIdSet.size
      }, 'Found participant IDs from events');
    }
    
    // Strategy 2: ALSO find participants by source (for participants without messages)
    // Some participants may have been imported but never sent messages
    // Use import's created_at/completed_at to filter (NOT date_range which is message dates!)
    const importTime = importData.completed_at || importData.created_at;
    
    logger.info({ importTime }, 'Also checking source-based participants');
    
    let sourceQuery = adminSupabase
      .from('participants')
      .select('id, source, created_at, custom_attributes')
      .eq('org_id', importData.org_id)
      .or('source.eq.whatsapp_import,source.eq.whatsapp');
    
    // Filter by import time to avoid picking up participants from OTHER imports
    // Participants are created at the moment of import, within a few minutes window
    if (importTime) {
      const importDate = new Date(importTime);
      // Window: 1 hour before import completed to 1 hour after
      const windowStart = new Date(importDate.getTime() - 60 * 60 * 1000); // 1 hour before
      const windowEnd = new Date(importDate.getTime() + 60 * 60 * 1000); // 1 hour after
      sourceQuery = sourceQuery
        .gte('created_at', windowStart.toISOString())
        .lte('created_at', windowEnd.toISOString());
      
      logger.debug({ 
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString()
      }, 'Source query time window');
    }
    
    const { data: sourceParticipants, error: sourceError } = await sourceQuery;
    
    if (sourceError) {
      logger.error({ error: sourceError.message }, 'Error fetching participants by source');
    } else if (sourceParticipants) {
      const beforeCount = participantIdSet.size;
      
      // Filter participants whose import_date matches our import window
      let matchingParticipants = sourceParticipants;
      if (importTime) {
        const importDate = new Date(importTime);
        const windowStart = new Date(importDate.getTime() - 60 * 60 * 1000);
        const windowEnd = new Date(importDate.getTime() + 60 * 60 * 1000);
        
        matchingParticipants = sourceParticipants.filter(p => {
          // Check custom_attributes.import_date if available
          const importDateAttr = p.custom_attributes?.import_date;
          if (importDateAttr) {
            const attrDate = new Date(importDateAttr);
            return attrDate >= windowStart && attrDate <= windowEnd;
          }
          // Fallback to created_at
          const createdAt = new Date(p.created_at);
          return createdAt >= windowStart && createdAt <= windowEnd;
        });
      }
      
      matchingParticipants.forEach(p => participantIdSet.add(p.id));
      const addedFromSource = participantIdSet.size - beforeCount;
      
      logger.info({ 
        sourceParticipantsFound: sourceParticipants.length,
        matchingToImportWindow: matchingParticipants.length,
        newParticipantsAdded: addedFromSource,
        totalNow: participantIdSet.size
      }, 'Found additional participants by source');
    }
    
    // Strategy 3: Check if there's a whatsapp_import_participants linking table
    // (in case this import tracks participants directly)
    const { data: importParticipants, error: importParticipantsError } = await adminSupabase
      .from('whatsapp_import_participants')
      .select('participant_id')
      .eq('import_id', importId);
    
    if (!importParticipantsError && importParticipants && importParticipants.length > 0) {
      const beforeCount = participantIdSet.size;
      importParticipants.forEach(p => participantIdSet.add(p.participant_id));
      const addedFromImport = participantIdSet.size - beforeCount;
      
      logger.info({ 
        importParticipantsFound: importParticipants.length,
        newParticipantsAdded: addedFromImport,
        totalNow: participantIdSet.size
      }, 'Found additional participants from import link table');
    }
    
    const participantIds = Array.from(participantIdSet);
    
    logger.info({ 
      totalParticipantsFound: participantIds.length,
      fromEvents: events?.length || 0,
      fromSource: sourceParticipants?.length || 0,
      fromImportLink: importParticipants?.length || 0
    }, 'Combined participants from all strategies');
    
    if (participantIds.length === 0) {
      logger.warn({ 
        importId,
        orgId: importData.org_id,
        groupName: importData.group_name
      }, 'No participants found for this import');
      
      return NextResponse.json({ 
        success: false, 
        added: 0,
        tagName: tag.name,
        error: 'Не найдено участников для этого импорта'
      });
    }
    
    // Get full participant data for logging
    const { data: participants } = await adminSupabase
      .from('participants')
      .select('id, full_name')
      .in('id', participantIds.slice(0, 100)); // Limit for logging
    
    logger.info({ 
      sampleParticipants: participants?.slice(0, 5).map(p => ({ id: p.id, name: p.full_name })),
      totalCount: participantIds.length 
    }, 'Found participants to tag');
    
    // Add tag to each participant (upsert to avoid duplicates)
    // Table is participant_tag_assignments (not participant_tags_mapping!)
    const tagAssignments = participantIds.map(id => ({
      participant_id: id,
      tag_id: tagId,
      assigned_by: user.id,
    }));
    
    // Process in batches of 100 to avoid payload limits
    let totalAdded = 0;
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < tagAssignments.length; i += BATCH_SIZE) {
      const batch = tagAssignments.slice(i, i + BATCH_SIZE);
      
      const { data: upsertResult, error: upsertError } = await adminSupabase
        .from('participant_tag_assignments')
        .upsert(batch, { 
          onConflict: 'participant_id,tag_id',
          ignoreDuplicates: true 
        })
        .select();
      
      if (upsertError) {
        logger.error({ 
          error: upsertError.message,
          errorCode: upsertError.code,
          errorDetails: upsertError.details,
          tagId,
          batchNumber: Math.floor(i / BATCH_SIZE) + 1,
          batchSize: batch.length
        }, 'Error adding tags batch');
        // Continue with other batches
      } else {
        totalAdded += upsertResult?.length || batch.length;
        logger.debug({ 
          batchNumber: Math.floor(i / BATCH_SIZE) + 1,
          batchAdded: upsertResult?.length || batch.length 
        }, 'Tag batch processed');
      }
    }
    
    // Update the import's default tag
    const { error: updateImportError } = await adminSupabase
      .from('whatsapp_imports')
      .update({ default_tag_id: tagId })
      .eq('id', importId);
    
    if (updateImportError) {
      logger.warn({ error: updateImportError.message }, 'Failed to update import default_tag_id');
    }
    
    logger.info({ 
      importId, 
      tagId, 
      tagName: tag.name,
      participantsRequested: participantIds.length,
      participantsAdded: totalAdded
    }, 'Successfully added tag to participants');
    
    return NextResponse.json({ 
      success: true, 
      added: totalAdded,
      tagName: tag.name
    });
  } catch (error) {
    logger.error({ error }, 'Error adding tag to WhatsApp participants');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

