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
    
    // Get import details
    const { data: importData, error: importError } = await adminSupabase
      .from('whatsapp_imports')
      .select('id, org_id, date_range_start, date_range_end')
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
    
    logger.info({ importId, tagId, orgId: importData.org_id }, 'Adding tag to WhatsApp import participants');
    
    // Get participants from this import (WhatsApp source, within date range)
    let query = adminSupabase
      .from('participants')
      .select('id')
      .eq('org_id', importData.org_id)
      .eq('source', 'whatsapp');
    
    // Filter by creation time if we have date range
    if (importData.date_range_start) {
      query = query.gte('created_at', importData.date_range_start);
    }
    if (importData.date_range_end) {
      // Add a day to include participants created on the end date
      const endDate = new Date(importData.date_range_end);
      endDate.setDate(endDate.getDate() + 1);
      query = query.lte('created_at', endDate.toISOString());
    }
    
    const { data: participants, error: participantsError } = await query;
    
    if (participantsError) {
      logger.error({ error: participantsError.message }, 'Error fetching participants');
      return NextResponse.json({ error: 'Failed to fetch participants' }, { status: 500 });
    }
    
    if (!participants || participants.length === 0) {
      return NextResponse.json({ 
        success: true, 
        added: 0,
        message: 'No participants found for this import'
      });
    }
    
    // Add tag to each participant (upsert to avoid duplicates)
    const tagMappings = participants.map(p => ({
      participant_id: p.id,
      tag_id: tagId,
    }));
    
    const { error: upsertError } = await adminSupabase
      .from('participant_tags_mapping')
      .upsert(tagMappings, { 
        onConflict: 'participant_id,tag_id',
        ignoreDuplicates: true 
      });
    
    if (upsertError) {
      logger.error({ error: upsertError.message }, 'Error adding tags');
      return NextResponse.json({ error: 'Failed to add tags' }, { status: 500 });
    }
    
    // Update the import's default tag
    await adminSupabase
      .from('whatsapp_imports')
      .update({ default_tag_id: tagId })
      .eq('id', importId);
    
    logger.info({ 
      importId, 
      tagId, 
      participantsCount: participants.length 
    }, 'Successfully added tag to participants');
    
    return NextResponse.json({ 
      success: true, 
      added: participants.length,
      tagName: tag.name
    });
  } catch (error) {
    logger.error({ error }, 'Error adding tag to WhatsApp participants');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

