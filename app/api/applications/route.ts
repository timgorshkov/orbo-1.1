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
    
    // Build base query (no Supabase-style joins - PostgresQueryBuilder doesn't support them)
    let query = supabase
      .from('applications')
      .select('id, form_id, stage_id, participant_id, source_id, tg_user_id, tg_user_data, form_data, form_filled_at, spam_score, spam_reasons, utm_data, notes, created_at, updated_at', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    
    // Apply filters
    if (stageId) {
      query = query.eq('stage_id', stageId);
    }
    
    if (formId) {
      query = query.eq('form_id', formId);
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
    
    const { data: applicationsRaw, count, error } = await query;
    
    if (error) {
      logger.error({ error, org_id: orgId }, 'Failed to get applications');
      return NextResponse.json({ error: 'Failed to get applications' }, { status: 500 });
    }
    
    // Fetch related data separately
    let applications: any[] = applicationsRaw || [];
    
    if (applications.length) {
      const formIds = Array.from(new Set(applications.map(a => a.form_id).filter(Boolean)));
      const stageIds = Array.from(new Set(applications.map(a => a.stage_id).filter(Boolean)));
      const participantIds = Array.from(new Set(applications.map(a => a.participant_id).filter(Boolean)));
      const sourceIds = Array.from(new Set(applications.map(a => a.source_id).filter(Boolean)));
      
      const [formsResult, stagesResult, participantsResult, sourcesResult] = await Promise.all([
        formIds.length ? supabase.from('application_forms').select('id, name, pipeline_id').in('id', formIds) : { data: [] },
        stageIds.length ? supabase.from('pipeline_stages').select('id, name, slug, color, is_terminal, terminal_type').in('id', stageIds) : { data: [] },
        participantIds.length ? supabase.from('participants').select('id, username, full_name, photo_url').in('id', participantIds) : { data: [] },
        sourceIds.length ? supabase.from('application_sources').select('id, utm_source, utm_campaign').in('id', sourceIds) : { data: [] }
      ]);
      
      // Get pipelines for forms
      const pipelineIds = Array.from(new Set((formsResult.data || []).map((f: any) => f.pipeline_id).filter(Boolean)));
      const { data: pipelines } = pipelineIds.length 
        ? await supabase.from('application_pipelines').select('id, name, pipeline_type').in('id', pipelineIds)
        : { data: [] };
      
      const formsMap = Object.fromEntries((formsResult.data || []).map((f: any) => [f.id, f]));
      const stagesMap = Object.fromEntries((stagesResult.data || []).map((s: any) => [s.id, s]));
      const participantsMap = Object.fromEntries((participantsResult.data || []).map((p: any) => [p.id, p]));
      const sourcesMap = Object.fromEntries((sourcesResult.data || []).map((s: any) => [s.id, s]));
      const pipelinesMap = Object.fromEntries((pipelines || []).map((p: any) => [p.id, p]));
      
      applications = applications.map(app => {
        const form = formsMap[app.form_id];
        return {
          ...app,
          form: form ? { ...form, pipeline: pipelinesMap[form.pipeline_id] || null } : null,
          stage: stagesMap[app.stage_id] || null,
          participant: participantsMap[app.participant_id] || null,
          source: sourcesMap[app.source_id] || null
        };
      });
      
      // Filter by pipeline if needed (post-query since we can't join)
      if (pipelineId) {
        applications = applications.filter(app => app.form?.pipeline_id === pipelineId);
      }
      
      // Filter by status (post-query since we need stage data)
      if (status === 'pending') {
        applications = applications.filter(app => app.stage && !app.stage.is_terminal);
      } else if (status === 'approved') {
        applications = applications.filter(app => app.stage?.terminal_type === 'success');
      } else if (status === 'rejected') {
        applications = applications.filter(app => app.stage?.terminal_type === 'failure');
      }
    }
    
    logger.info({ 
      org_id: orgId, 
      count: applications.length,
      total: count 
    }, 'Applications fetched');
    
    return NextResponse.json({
      applications,
      total: count || 0,
      limit,
      offset
    });
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/applications');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
