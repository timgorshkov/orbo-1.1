import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/payment-methods?orgId=xxx
 * 
 * Fetch payment methods for organization
 */
export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'payment-methods' });
  
  try {
    const supabase = createAdminServer();
    const url = new URL(req.url);
    const orgId = url.searchParams.get('orgId');
    
    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 });
    }
    
    // Check authentication via unified auth
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    logger.info({ orgId }, 'Fetching payment methods');
    
    // Fetch payment methods
    const { data: paymentMethods, error } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    
    if (error) {
      logger.error({ error }, 'Failed to fetch payment methods');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    logger.info({ count: paymentMethods?.length || 0 }, 'Payment methods fetched');
    
    return NextResponse.json({ paymentMethods: paymentMethods || [] });
  } catch (error) {
    logger.error({ error }, 'Unexpected error fetching payment methods');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * POST /api/payment-methods
 * 
 * Create new payment method
 * 
 * Body: {
 *   orgId, methodType, displayName, instructions?, isActive?
 * }
 */
export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'payment-methods' });
  
  try {
    const supabase = createAdminServer();
    const body = await req.json();
    
    const {
      orgId,
      methodType,
      displayName,
      instructions,
      isActive = true
    } = body;
    
    // Validation
    if (!orgId || !methodType || !displayName) {
      return NextResponse.json({ 
        error: 'Missing required fields: orgId, methodType, displayName' 
      }, { status: 400 });
    }
    
    // Check authentication via unified auth
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Check permissions (owner/admin only)
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden: owner/admin only' }, { status: 403 });
    }
    
    logger.info({ orgId, methodType, displayName }, 'Creating payment method');
    
    // Create payment method
    const { data: paymentMethod, error } = await supabase
      .from('payment_methods')
      .insert({
        org_id: orgId,
        method_type: methodType,
        display_name: displayName,
        instructions: instructions || null,
        is_active: isActive
      })
      .select()
      .single();
    
    if (error) {
      logger.error({ error }, 'Failed to create payment method');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Log admin action
    await logAdminAction({
      orgId,
      userId: user.id,
      action: 'create_payment_method', // TODO: Add to AdminActions
      resourceType: ResourceTypes.ORGANIZATION, // TODO: Add PAYMENT_METHOD
      resourceId: paymentMethod.id,
      metadata: {
        method_type: methodType,
        display_name: displayName
      },
      requestId: req.headers.get('x-vercel-id') || undefined
    });
    
    logger.info({ paymentMethodId: paymentMethod.id }, 'Payment method created');
    
    return NextResponse.json({ paymentMethod }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Unexpected error creating payment method');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * PATCH /api/payment-methods
 * 
 * Update payment method
 * 
 * Body: {
 *   id, orgId, displayName?, instructions?, isActive?
 * }
 */
export async function PATCH(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'payment-methods' });
  
  try {
    const supabase = createAdminServer();
    const body = await req.json();
    
    const {
      id,
      orgId,
      displayName,
      instructions,
      isActive
    } = body;
    
    if (!id || !orgId) {
      return NextResponse.json({ 
        error: 'Missing required fields: id, orgId' 
      }, { status: 400 });
    }
    
    // Check authentication via unified auth
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Check permissions (owner/admin only)
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden: owner/admin only' }, { status: 403 });
    }
    
    logger.info({ paymentMethodId: id }, 'Updating payment method');
    
    // Build update object
    const updates: any = {};
    if (displayName !== undefined) updates.display_name = displayName;
    if (instructions !== undefined) updates.instructions = instructions;
    if (isActive !== undefined) updates.is_active = isActive;
    
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }
    
    // Update payment method
    const { data: paymentMethod, error } = await supabase
      .from('payment_methods')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();
    
    if (error) {
      logger.error({ error }, 'Failed to update payment method');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Log admin action
    await logAdminAction({
      orgId,
      userId: user.id,
      action: 'update_payment_method', // TODO: Add to AdminActions
      resourceType: ResourceTypes.ORGANIZATION, // TODO: Add PAYMENT_METHOD
      resourceId: id,
      metadata: {
        updated_fields: Object.keys(updates)
      },
      requestId: req.headers.get('x-vercel-id') || undefined
    });
    
    logger.info({ paymentMethodId: id }, 'Payment method updated');
    
    return NextResponse.json({ paymentMethod });
  } catch (error) {
    logger.error({ error }, 'Unexpected error updating payment method');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * DELETE /api/payment-methods?id=xxx&orgId=xxx
 * 
 * Delete payment method (owner only)
 */
export async function DELETE(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'payment-methods' });
  
  try {
    const supabase = createAdminServer();
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const orgId = url.searchParams.get('orgId');
    
    if (!id || !orgId) {
      return NextResponse.json({ 
        error: 'Missing required params: id, orgId' 
      }, { status: 400 });
    }
    
    // Check authentication via unified auth
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Check permissions (owner only)
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: owner only' }, { status: 403 });
    }
    
    logger.info({ paymentMethodId: id }, 'Deleting payment method');
    
    // Delete payment method
    const { error } = await supabase
      .from('payment_methods')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);
    
    if (error) {
      logger.error({ error }, 'Failed to delete payment method');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Log admin action
    await logAdminAction({
      orgId,
      userId: user.id,
      action: 'delete_payment_method', // TODO: Add to AdminActions
      resourceType: ResourceTypes.ORGANIZATION, // TODO: Add PAYMENT_METHOD
      resourceId: id,
      requestId: req.headers.get('x-vercel-id') || undefined
    });
    
    logger.info({ paymentMethodId: id }, 'Payment method deleted');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Unexpected error deleting payment method');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
