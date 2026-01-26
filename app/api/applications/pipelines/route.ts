/**
 * Application Pipelines API
 * 
 * GET  /api/applications/pipelines?org_id=xxx - List pipelines for organization
 * POST /api/applications/pipelines - Create new pipeline
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

// GET - List pipelines for organization
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request);
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');
    
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
    
    // Get pipelines with stats
    const { data: pipelines, error } = await supabase
      .from('application_pipelines')
      .select(`
        id,
        name,
        description,
        pipeline_type,
        telegram_group_id,
        is_default,
        is_active,
        created_at,
        pipeline_stages (
          id,
          name,
          slug,
          color,
          position,
          is_initial,
          is_terminal,
          terminal_type
        )
      `)
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) {
      logger.error({ error, org_id: orgId }, 'Failed to get pipelines');
      return NextResponse.json({ error: 'Failed to get pipelines' }, { status: 500 });
    }
    
    // Get application counts per pipeline
    const pipelinesWithCounts = await Promise.all(
      (pipelines || []).map(async (pipeline) => {
        const { data: stats } = await supabase
          .rpc('get_pipeline_stats', { p_pipeline_id: pipeline.id });
        
        const totalCount = stats?.reduce((sum: number, s: any) => sum + parseInt(s.applications_count || 0), 0) || 0;
        const pendingCount = stats
          ?.filter((s: any) => !s.is_terminal)
          .reduce((sum: number, s: any) => sum + parseInt(s.applications_count || 0), 0) || 0;
        
        return {
          ...pipeline,
          stages: pipeline.pipeline_stages,
          total_applications: totalCount,
          pending_applications: pendingCount,
          stage_stats: stats
        };
      })
    );
    
    logger.info({ org_id: orgId, count: pipelines?.length }, 'Pipelines fetched');
    
    return NextResponse.json({ pipelines: pipelinesWithCounts });
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/applications/pipelines');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create new pipeline
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request);
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { org_id, name, pipeline_type, telegram_group_id, description } = body;
    
    if (!org_id || !name || !pipeline_type) {
      return NextResponse.json(
        { error: 'org_id, name, and pipeline_type are required' },
        { status: 400 }
      );
    }
    
    if (!['join_request', 'service', 'custom'].includes(pipeline_type)) {
      return NextResponse.json(
        { error: 'Invalid pipeline_type' },
        { status: 400 }
      );
    }
    
    const supabase = createAdminServer();
    
    // Check admin/owner role
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Create pipeline with default stages
    const { data: pipelineId, error } = await supabase
      .rpc('create_pipeline_with_default_stages', {
        p_org_id: org_id,
        p_name: name,
        p_pipeline_type: pipeline_type,
        p_telegram_group_id: telegram_group_id || null,
        p_created_by: user.id
      });
    
    if (error) {
      logger.error({ error, org_id }, 'Failed to create pipeline');
      return NextResponse.json({ error: 'Failed to create pipeline' }, { status: 500 });
    }
    
    // Update description if provided
    if (description) {
      await supabase
        .from('application_pipelines')
        .update({ description })
        .eq('id', pipelineId);
    }
    
    // Get created pipeline with stages
    const { data: pipeline } = await supabase
      .from('application_pipelines')
      .select(`
        *,
        pipeline_stages (*)
      `)
      .eq('id', pipelineId)
      .single();
    
    logger.info({ org_id, pipeline_id: pipelineId, type: pipeline_type }, 'Pipeline created');
    
    return NextResponse.json({ pipeline }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Error in POST /api/applications/pipelines');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
