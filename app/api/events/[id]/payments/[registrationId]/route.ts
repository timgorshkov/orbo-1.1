import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction'

/**
 * PATCH /api/events/[id]/payments/[registrationId]
 * 
 * Update payment information for a specific registration.
 * Only accessible by admins of the organization.
 * 
 * Body:
 * - price?: number (update individual price for this participant)
 * - payment_status?: 'pending' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled' | 'refunded'
 * - payment_method?: string (bank_transfer, cash, card, online, other)
 * - paid_amount?: number (amount actually paid)
 * - payment_notes?: string (admin comments)
 * 
 * Automatically sets:
 * - paid_at: current timestamp when status changes to 'paid'
 * - payment_updated_by: current user id
 * - payment_updated_at: current timestamp
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; registrationId: string }> }
) {
  try {
    const { id: eventId, registrationId } = await params
    const body = await request.json()
    
    const {
      price,
      payment_status,
      payment_method,
      paid_amount,
      payment_notes
    } = body

    const supabase = await createClientServer()
    const supabaseAdmin = createAdminServer()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify registration exists and belongs to this event (use admin client to bypass RLS)
    const { data: existingReg, error: regError } = await supabaseAdmin
      .from('event_registrations')
      .select('id, event_id, participant_id, payment_status')
      .eq('id', registrationId)
      .eq('event_id', eventId)
      .single()

    if (regError || !existingReg) {
      return NextResponse.json(
        { error: 'Registration not found' },
        { status: 404 }
      )
    }

    // Get event to check org_id and admin rights (use admin client to bypass RLS)
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('org_id, requires_payment')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check admin rights (use admin client to bypass RLS)
    const { data: membership } = await supabaseAdmin
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', event.org_id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only admins can update payment information' },
        { status: 403 }
      )
    }

    // Prepare update data
    const updateData: any = {
      payment_updated_by: user.id,
      payment_updated_at: new Date().toISOString()
    }

    // Update individual fields if provided
    if (price !== undefined) {
      updateData.price = price
    }

    if (payment_status !== undefined) {
      // Validate payment_status
      const validStatuses = ['pending', 'paid', 'partially_paid', 'overdue', 'cancelled', 'refunded']
      if (!validStatuses.includes(payment_status)) {
        return NextResponse.json(
          { error: `Invalid payment_status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        )
      }
      
      updateData.payment_status = payment_status
      
      // Auto-set paid_at when status changes to 'paid'
      if (payment_status === 'paid' && existingReg.payment_status !== 'paid') {
        updateData.paid_at = new Date().toISOString()
      }
      
      // Clear paid_at if status is no longer 'paid'
      if (payment_status !== 'paid' && existingReg.payment_status === 'paid') {
        updateData.paid_at = null
      }
    }

    if (payment_method !== undefined) {
      updateData.payment_method = payment_method
    }

    if (paid_amount !== undefined) {
      updateData.paid_amount = paid_amount
    }

    if (payment_notes !== undefined) {
      updateData.payment_notes = payment_notes
    }

    // Update registration (use admin client to bypass RLS)
    const { data: updatedReg, error: updateError } = await supabaseAdmin
      .from('event_registrations')
      .update(updateData)
      .eq('id', registrationId)
      .select(`
        id,
        participant_id,
        status,
        registered_at,
        price,
        payment_status,
        payment_method,
        paid_at,
        paid_amount,
        payment_notes,
        payment_updated_at,
        participants!inner (
          id,
          full_name,
          username,
          tg_user_id,
          photo_url
        )
      `)
      .single()

    if (updateError) {
      console.error('Error updating payment:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Log admin action
    await logAdminAction({
      orgId: event.org_id,
      userId: user.id,
      action: AdminActions.UPDATE_PAYMENT_STATUS,
      resourceType: ResourceTypes.EVENT_PAYMENT,
      resourceId: registrationId,
      changes: {
        before: { payment_status: existingReg.payment_status },
        after: { payment_status: updateData.payment_status }
      },
      metadata: {
        event_id: eventId,
        participant_name: (updatedReg as any)?.participants?.full_name,
        paid_amount: updateData.paid_amount,
        payment_method: updateData.payment_method
      }
    })

    return NextResponse.json({
      success: true,
      registration: updatedReg
    })
  } catch (error: any) {
    console.error('Error in PATCH /api/events/[id]/payments/[registrationId]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

