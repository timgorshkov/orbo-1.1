/**
 * Application Sources (UTM) API
 * 
 * GET  /api/applications/sources?form_id=xxx - List sources for form
 * POST /api/applications/sources - Create/get source with UTM params
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

// GET - List sources for form
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request);
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const formId = searchParams.get('form_id');
    
    if (!formId) {
      return NextResponse.json({ error: 'form_id is required' }, { status: 400 });
    }
    
    const supabase = createAdminServer();
    
    // Get form to check org access
    const { data: form } = await supabase
      .from('application_forms')
      .select('org_id')
      .eq('id', formId)
      .single();
    
    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }
    
    // Check membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', form.org_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Get sources
    const { data: sources, error } = await supabase
      .from('application_sources')
      .select(`
        id,
        code,
        name,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        ref_code,
        applications_count,
        approved_count,
        is_active,
        created_at
      `)
      .eq('form_id', formId)
      .order('created_at', { ascending: false });
    
    if (error) {
      logger.error({ error, form_id: formId }, 'Failed to get sources');
      return NextResponse.json({ error: 'Failed to get sources' }, { status: 500 });
    }
    
    logger.info({ form_id: formId, count: sources?.length }, 'Sources fetched');
    
    return NextResponse.json({ sources: sources || [] });
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/applications/sources');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create/get source with UTM params
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request);
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const {
      form_id,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      ref_code,
      name
    } = body;
    
    if (!form_id) {
      return NextResponse.json({ error: 'form_id is required' }, { status: 400 });
    }
    
    const supabase = createAdminServer();
    
    // Get form to check org access
    const { data: form } = await supabase
      .from('application_forms')
      .select('org_id')
      .eq('id', form_id)
      .single();
    
    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }
    
    // Check admin/owner role
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', form.org_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Create or get source
    const { data: code, error } = await supabase
      .rpc('upsert_application_source', {
        p_form_id: form_id,
        p_utm_source: utm_source || null,
        p_utm_medium: utm_medium || null,
        p_utm_campaign: utm_campaign || null,
        p_utm_term: utm_term || null,
        p_utm_content: utm_content || null,
        p_ref_code: ref_code || null,
        p_name: name || null
      });
    
    if (error) {
      logger.error({ error, form_id }, 'Failed to create source');
      return NextResponse.json({ error: 'Failed to create source' }, { status: 500 });
    }
    
    // Get the created/existing source
    const { data: source } = await supabase
      .from('application_sources')
      .select('*')
      .eq('code', code)
      .single();
    
    logger.info({ form_id, source_code: code }, 'Source created/fetched');
    
    return NextResponse.json({ 
      source,
      code,
      deep_link: `apply-${form_id}-${code}`
    }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Error in POST /api/applications/sources');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
