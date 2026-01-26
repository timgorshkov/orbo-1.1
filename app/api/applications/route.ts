/**
 * Applications List API
 * 
 * GET /api/applications?org_id=xxx - List applications with filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

// GET - List applications with filters
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request);
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');
    const pipelineId = searchParams.get('pipeline_id');
    const stageId = searchParams.get('stage_id');
    const formId = searchParams.get('form_id');
    const status = searchParams.get('status'); // 'pending', 'approved', 'rejected'
    const minSpamScore = searchParams.get('min_spam_score');
    const maxSpamScore = searchParams.get('max_spam_score');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    if (!orgId) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
    }
    
    const supabase = createAdminServer();
    
    // Check membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Build query
    let query = supabase
      .from('applications')
      .select(`
        id,
        form_id,
        stage_id,
        participant_id,
        tg_user_id,
        tg_user_data,
        form_data,
        form_filled_at,
        spam_score,
        spam_reasons,
        utm_data,
        notes,
        created_at,
        updated_at,
        form:application_forms!inner (
          id,
          name,
          pipeline_id,
          pipeline:application_pipelines!inner (
            id,
            name,
            pipeline_type
          )
        ),
        stage:pipeline_stages (
          id,
          name,
          slug,
          color,
          is_terminal,
          terminal_type
        ),
        participant:participants (
          id,
          username,
          full_name,
          photo_url
        ),
        source:application_sources (
          utm_source,
          utm_campaign
        )
      `, { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    
    // Apply filters
    if (pipelineId) {
      query = query.eq('form.pipeline_id', pipelineId);
    }
    
    if (stageId) {
      query = query.eq('stage_id', stageId);
    }
    
    if (formId) {
      query = query.eq('form_id', formId);
    }
    
    // Status filter (terminal vs non-terminal)
    if (status === 'pending') {
      query = query.eq('stage.is_terminal', false);
    } else if (status === 'approved') {
      query = query.eq('stage.terminal_type', 'success');
    } else if (status === 'rejected') {
      query = query.eq('stage.terminal_type', 'failure');
    }
    
    // Spam score filters
    if (minSpamScore) {
      query = query.gte('spam_score', parseInt(minSpamScore));
    }
    if (maxSpamScore) {
      query = query.lte('spam_score', parseInt(maxSpamScore));
    }
    
    // Search in user data
    if (search) {
      query = query.or(`tg_user_data->>username.ilike.%${search}%,tg_user_data->>first_name.ilike.%${search}%`);
    }
    
    // Pagination
    query = query.range(offset, offset + limit - 1);
    
    const { data: applications, count, error } = await query;
    
    if (error) {
      logger.error({ error, org_id: orgId }, 'Failed to get applications');
      return NextResponse.json({ error: 'Failed to get applications' }, { status: 500 });
    }
    
    logger.info({ 
      org_id: orgId, 
      count: applications?.length,
      total: count 
    }, 'Applications fetched');
    
    return NextResponse.json({
      applications: applications || [],
      total: count || 0,
      limit,
      offset
    });
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/applications');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
