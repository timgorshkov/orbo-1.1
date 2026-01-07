import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/payments?orgId=xxx&subscriptionId=xxx (optional)
 * 
 * Fetch payments for organization (optionally filtered by subscription)
 */
export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'payments' });
  
  try {
    const adminSupabase = createAdminServer();
    const url = new URL(req.url);
    const orgId = url.searchParams.get('orgId');
    const subscriptionId = url.searchParams.get('subscriptionId');
    const eventId = url.searchParams.get('eventId');
    
    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 });
    }
    
    // Check authentication via unified auth
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Check permissions (user must be member of org)
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden: not a member of this organization' }, { status: 403 });
    }
    
    logger.info({ orgId, subscriptionId, eventId }, 'Fetching payments');
    
    // Build query
    let query = adminSupabase
      .from('payments')
      .select(`
        id,
        org_id,
        subscription_id,
        event_id,
        participant_id,
        payment_type,
        amount,
        currency,
        payment_method,
        payment_method_details,
        status,
        due_date,
        paid_at,
        notes,
        receipt_url,
        created_at,
        participant:participants(id, full_name, username, photo_url),
        subscription:subscriptions(id, plan_name, billing_period),
        event:events(id, title, event_date)
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    
    // Apply filters
    if (subscriptionId) {
      query = query.eq('subscription_id', subscriptionId);
    }
    
    if (eventId) {
      query = query.eq('event_id', eventId);
    }
    
    const { data: payments, error } = await query;
    
    if (error) {
      logger.error({ error }, 'Failed to fetch payments');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    logger.info({ count: payments?.length || 0 }, 'Payments fetched');
    
    return NextResponse.json({ payments: payments || [] });
  } catch (error) {
    logger.error({ error }, 'Unexpected error fetching payments');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * POST /api/payments
 * 
 * Create new payment record
 * 
 * Body: {
 *   orgId, subscriptionId?, eventId?, participantId?,
 *   paymentType ('subscription' | 'event' | 'other'),
 *   amount, currency?, paymentMethod, paymentMethodDetails?,
 *   dueDate?, paidAt?, status?, notes?, receiptUrl?
 * }
 */
export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'payments' });
  
  try {
    const supabase = createAdminServer();
    const body = await req.json();
    
    const {
      orgId,
      subscriptionId,
      eventId,
      participantId,
      paymentType = 'subscription',
      amount,
      currency = 'RUB',
      paymentMethod,
      paymentMethodDetails,
      dueDate,
      paidAt,
      status = 'pending',
      notes,
      receiptUrl
    } = body;
    
    // Validation
    if (!orgId || !amount || !paymentMethod || !paymentType) {
      return NextResponse.json({ 
        error: 'Missing required fields: orgId, amount, paymentMethod, paymentType' 
      }, { status: 400 });
    }
    
    // Validate paymentType and corresponding IDs
    if (paymentType === 'subscription' && !subscriptionId) {
      return NextResponse.json({ 
        error: 'subscriptionId required for subscription payment' 
      }, { status: 400 });
    }
    
    if (paymentType === 'event' && !eventId) {
      return NextResponse.json({ 
        error: 'eventId required for event payment' 
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
    
    logger.info({ orgId, subscriptionId, eventId, amount, paymentType }, 'Creating payment');
    
    // Create payment
    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        org_id: orgId,
        subscription_id: subscriptionId || null,
        event_id: eventId || null,
        participant_id: participantId || null,
        payment_type: paymentType,
        amount,
        currency,
        payment_method: paymentMethod,
        payment_method_details: paymentMethodDetails || null,
        due_date: dueDate || null,
        paid_at: paidAt || null,
        status,
        notes: notes || null,
        receipt_url: receiptUrl || null,
        created_by: user.id
      })
      .select()
      .single();
    
    if (error) {
      logger.error({ error }, 'Failed to create payment');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Log admin action
    await logAdminAction({
      orgId,
      userId: user.id,
      action: 'record_payment', // TODO: Add to AdminActions
      resourceType: ResourceTypes.ORGANIZATION, // TODO: Add PAYMENT
      resourceId: payment.id,
      metadata: {
        payment_type: paymentType,
        amount,
        status,
        subscription_id: subscriptionId,
        event_id: eventId
      },
      requestId: req.headers.get('x-vercel-id') || undefined
    });
    
    logger.info({ paymentId: payment.id }, 'Payment created');
    
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Unexpected error creating payment');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * PATCH /api/payments
 * 
 * Update payment (typically to mark as confirmed/paid)
 * 
 * Body: {
 *   id, orgId, status?, paidAt?, notes?, receiptUrl?
 * }
 */
export async function PATCH(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'payments' });
  
  try {
    const supabase = createAdminServer();
    const body = await req.json();
    
    const {
      id,
      orgId,
      status,
      paidAt,
      notes,
      receiptUrl
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
    
    logger.info({ paymentId: id, status }, 'Updating payment');
    
    // Build update object
    const updates: any = {};
    if (status !== undefined) {
      updates.status = status;
      // If marking as confirmed and no paidAt, set it to now
      if (status === 'confirmed' && !paidAt && !updates.paid_at) {
        updates.paid_at = new Date().toISOString();
      }
    }
    if (paidAt !== undefined) updates.paid_at = paidAt;
    if (notes !== undefined) updates.notes = notes;
    if (receiptUrl !== undefined) updates.receipt_url = receiptUrl;
    
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }
    
    // Update payment
    const { data: payment, error } = await supabase
      .from('payments')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();
    
    if (error) {
      logger.error({ error }, 'Failed to update payment');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Log admin action
    await logAdminAction({
      orgId,
      userId: user.id,
      action: 'update_payment', // TODO: Add to AdminActions
      resourceType: ResourceTypes.ORGANIZATION, // TODO: Add PAYMENT
      resourceId: id,
      metadata: {
        updated_fields: Object.keys(updates),
        new_status: status
      },
      requestId: req.headers.get('x-vercel-id') || undefined
    });
    
    logger.info({ paymentId: id }, 'Payment updated');
    
    return NextResponse.json({ payment });
  } catch (error) {
    logger.error({ error }, 'Unexpected error updating payment');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

