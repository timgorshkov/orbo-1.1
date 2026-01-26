/**
 * Single Form API
 * 
 * PATCH  /api/applications/forms/[formId] - Update form
 * DELETE /api/applications/forms/[formId] - Delete form
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

interface RouteParams {
  params: Promise<{ formId: string }>;
}

// PATCH - Update form
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const logger = createAPILogger(request);
  const { formId } = await params;
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    
    const supabase = createAdminServer();
    
    // Get form
    const { data: form, error: formError } = await supabase
      .from('application_forms')
      .select('org_id')
      .eq('id', formId)
      .single();
    
    if (formError || !form) {
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
    
    // Update form
    const updates: any = { updated_at: new Date().toISOString() };
    const allowedFields = ['name', 'slug', 'landing', 'form_schema', 'success_page', 'settings', 'is_active'];
    
    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    });
    
    const { error: updateError } = await supabase
      .from('application_forms')
      .update(updates)
      .eq('id', formId);
    
    if (updateError) {
      logger.error({ error: updateError, form_id: formId }, 'Failed to update form');
      return NextResponse.json({ error: 'Failed to update form' }, { status: 500 });
    }
    
    logger.info({ form_id: formId }, 'Form updated');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error in PATCH /api/applications/forms/[formId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete form
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const logger = createAPILogger(request);
  const { formId } = await params;
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const supabase = createAdminServer();
    
    // Get form
    const { data: form, error: formError } = await supabase
      .from('application_forms')
      .select('org_id')
      .eq('id', formId)
      .single();
    
    if (formError || !form) {
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
    
    // Check if form has applications
    const { count: appsCount } = await supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('form_id', formId);
    
    if (appsCount && appsCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete form with ${appsCount} applications` },
        { status: 400 }
      );
    }
    
    // Delete form
    const { error: deleteError } = await supabase
      .from('application_forms')
      .delete()
      .eq('id', formId);
    
    if (deleteError) {
      logger.error({ error: deleteError, form_id: formId }, 'Failed to delete form');
      return NextResponse.json({ error: 'Failed to delete form' }, { status: 500 });
    }
    
    logger.info({ form_id: formId }, 'Form deleted');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error in DELETE /api/applications/forms/[formId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
