import { NextRequest, NextResponse } from 'next/server';
import { createClientServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';

export const dynamic = 'force-dynamic';

/**
 * GET /api/subscriptions?orgId=xxx
 * 
 * Fetch subscriptions for organization
 */
export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'subscriptions' });
  
  try {
    const supabase = await createClientServer();
    const url = new URL(req.url);
    const orgId = url.searchParams.get('orgId');
    
    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 });
    }
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    logger.info({ orgId, userId: user.id }, 'Fetching subscriptions');
    
    // Fetch subscriptions with participant info
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select(`
        *,
        participant:participants(id, full_name, tg_username, avatar_url)
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    
    if (error) {
      logger.error({ error }, 'Failed to fetch subscriptions');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    logger.info({ count: subscriptions?.length || 0 }, 'Subscriptions fetched');
    
    return NextResponse.json({ subscriptions: subscriptions || [] });
  } catch (error) {
    logger.error({ error }, 'Unexpected error fetching subscriptions');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * POST /api/subscriptions
 * 
 * Create new subscription
 * 
 * Body: {
 *   orgId, participantId, planName, amount, currency, billingPeriod,
 *   startDate, endDate?, notes?
 * }
 */
export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'subscriptions' });
  
  try {
    const supabase = await createClientServer();
    const body = await req.json();
    
    const {
      orgId,
      participantId,
      planName,
      amount,
      currency = 'RUB',
      billingPeriod,
      startDate,
      endDate,
      notes
    } = body;
    
    // Validation
    if (!orgId || !participantId || !planName || !amount || !billingPeriod || !startDate) {
      return NextResponse.json({ 
        error: 'Missing required fields: orgId, participantId, planName, amount, billingPeriod, startDate' 
      }, { status: 400 });
    }
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
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
    
    logger.info({ orgId, participantId, planName, amount }, 'Creating subscription');
    
    // Calculate next_billing_date based on billingPeriod
    let nextBillingDate = null;
    if (billingPeriod !== 'one-time') {
      const start = new Date(startDate);
      switch (billingPeriod) {
        case 'monthly':
          start.setMonth(start.getMonth() + 1);
          break;
        case 'quarterly':
          start.setMonth(start.getMonth() + 3);
          break;
        case 'annual':
          start.setFullYear(start.getFullYear() + 1);
          break;
      }
      nextBillingDate = start.toISOString().split('T')[0];
    }
    
    // Create subscription
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .insert({
        org_id: orgId,
        participant_id: participantId,
        plan_name: planName,
        amount,
        currency,
        billing_period: billingPeriod,
        start_date: startDate,
        end_date: endDate || null,
        next_billing_date: nextBillingDate,
        notes: notes || null,
        status: 'active',
        created_by: user.id
      })
      .select()
      .single();
    
    if (error) {
      logger.error({ error }, 'Failed to create subscription');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Log admin action
    await logAdminAction({
      orgId,
      userId: user.id,
      action: AdminActions.CREATE_EVENT, // TODO: Add CREATE_SUBSCRIPTION to AdminActions
      resourceType: ResourceTypes.ORGANIZATION, // TODO: Add SUBSCRIPTION to ResourceTypes
      resourceId: subscription.id,
      metadata: {
        participant_id: participantId,
        plan_name: planName,
        amount,
        billing_period: billingPeriod
      },
      requestId: req.headers.get('x-vercel-id') || undefined
    });
    
    logger.info({ subscriptionId: subscription.id }, 'Subscription created');
    
    return NextResponse.json({ subscription }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Unexpected error creating subscription');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * PATCH /api/subscriptions
 * 
 * Update subscription (status, dates, notes)
 * 
 * Body: {
 *   id, orgId, status?, endDate?, nextBillingDate?, notes?
 * }
 */
export async function PATCH(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'subscriptions' });
  
  try {
    const supabase = await createClientServer();
    const body = await req.json();
    
    const {
      id,
      orgId,
      status,
      endDate,
      nextBillingDate,
      notes
    } = body;
    
    if (!id || !orgId) {
      return NextResponse.json({ 
        error: 'Missing required fields: id, orgId' 
      }, { status: 400 });
    }
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
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
    
    logger.info({ subscriptionId: id, status }, 'Updating subscription');
    
    // Build update object
    const updates: any = {};
    if (status !== undefined) updates.status = status;
    if (endDate !== undefined) updates.end_date = endDate;
    if (nextBillingDate !== undefined) updates.next_billing_date = nextBillingDate;
    if (notes !== undefined) updates.notes = notes;
    
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }
    
    // Update subscription
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();
    
    if (error) {
      logger.error({ error }, 'Failed to update subscription');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Log admin action
    await logAdminAction({
      orgId,
      userId: user.id,
      action: AdminActions.UPDATE_EVENT, // TODO: Add UPDATE_SUBSCRIPTION
      resourceType: ResourceTypes.ORGANIZATION, // TODO: Add SUBSCRIPTION
      resourceId: id,
      metadata: {
        updated_fields: Object.keys(updates),
        new_status: status
      },
      requestId: req.headers.get('x-vercel-id') || undefined
    });
    
    logger.info({ subscriptionId: id }, 'Subscription updated');
    
    return NextResponse.json({ subscription });
  } catch (error) {
    logger.error({ error }, 'Unexpected error updating subscription');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * DELETE /api/subscriptions?id=xxx&orgId=xxx
 * 
 * Delete subscription (owner only)
 */
export async function DELETE(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'subscriptions' });
  
  try {
    const supabase = await createClientServer();
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const orgId = url.searchParams.get('orgId');
    
    if (!id || !orgId) {
      return NextResponse.json({ 
        error: 'Missing required params: id, orgId' 
      }, { status: 400 });
    }
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
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
    
    logger.info({ subscriptionId: id }, 'Deleting subscription');
    
    // Delete subscription
    const { error } = await supabase
      .from('subscriptions')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);
    
    if (error) {
      logger.error({ error }, 'Failed to delete subscription');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Log admin action
    await logAdminAction({
      orgId,
      userId: user.id,
      action: AdminActions.DELETE_EVENT, // TODO: Add DELETE_SUBSCRIPTION
      resourceType: ResourceTypes.ORGANIZATION, // TODO: Add SUBSCRIPTION
      resourceId: id,
      requestId: req.headers.get('x-vercel-id') || undefined
    });
    
    logger.info({ subscriptionId: id }, 'Subscription deleted');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Unexpected error deleting subscription');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

