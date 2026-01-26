/**
 * Application Forms API
 * 
 * GET  /api/applications/forms?org_id=xxx - List forms
 * POST /api/applications/forms - Create new form
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

// GET - List forms for organization
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
      .from('application_forms')
      .select(`
        id,
        name,
        slug,
        landing,
        form_schema,
        success_page,
        settings,
        is_active,
        created_at,
        pipeline:application_pipelines (
          id,
          name,
          pipeline_type
        )
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    
    if (pipelineId) {
      query = query.eq('pipeline_id', pipelineId);
    }
    
    const { data: forms, error } = await query;
    
    if (error) {
      logger.error({ error, org_id: orgId }, 'Failed to get forms');
      return NextResponse.json({ error: 'Failed to get forms' }, { status: 500 });
    }
    
    // Get application counts per form
    const formsWithCounts = await Promise.all(
      (forms || []).map(async (form) => {
        const { count } = await supabase
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .eq('form_id', form.id);
        
        return {
          ...form,
          applications_count: count || 0
        };
      })
    );
    
    logger.info({ org_id: orgId, count: forms?.length }, 'Forms fetched');
    
    return NextResponse.json({ forms: formsWithCounts });
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/applications/forms');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create new form
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request);
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { 
      org_id, 
      pipeline_id, 
      name, 
      slug,
      landing,
      form_schema,
      success_page,
      settings 
    } = body;
    
    if (!org_id || !pipeline_id || !name) {
      return NextResponse.json(
        { error: 'org_id, pipeline_id, and name are required' },
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
    
    // Verify pipeline belongs to org
    const { data: pipeline } = await supabase
      .from('application_pipelines')
      .select('id')
      .eq('id', pipeline_id)
      .eq('org_id', org_id)
      .single();
    
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }
    
    // Create form
    const { data: form, error } = await supabase
      .from('application_forms')
      .insert({
        org_id,
        pipeline_id,
        name,
        slug: slug || null,
        landing: landing || {},
        form_schema: form_schema || [],
        success_page: success_page || {},
        settings: settings || {},
        created_by: user.id
      })
      .select()
      .single();
    
    if (error) {
      logger.error({ error, org_id }, 'Failed to create form');
      return NextResponse.json({ error: 'Failed to create form' }, { status: 500 });
    }
    
    logger.info({ org_id, form_id: form.id }, 'Form created');
    
    return NextResponse.json({ form }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Error in POST /api/applications/forms');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
