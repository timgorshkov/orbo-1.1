import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

// PATCH /api/events/[id]/participants/[registrationId] - Update event registration (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; registrationId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/participants/[registrationId]' });
  let eventId: string | undefined;
  let registrationId: string | undefined;
  try {
    const paramsData = await params;
    eventId = paramsData.id;
    registrationId = paramsData.registrationId;
    const adminSupabase = createAdminServer()

    // Check authentication via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event details
    const { data: event, error: eventError } = await adminSupabase
      .from('events')
      .select('org_id, status')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check admin permissions
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', event.org_id)
      .maybeSingle()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Get registration details
    const { data: registration, error: regError } = await adminSupabase
      .from('event_registrations')
      .select('id, event_id, participant_id, registration_data, payment_status')
      .eq('id', registrationId)
      .eq('event_id', eventId)
      .single()

    if (regError || !registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json()
    const { org_id, full_name, email, phone, bio, payment_status } = body

    if (org_id !== event.org_id) {
      return NextResponse.json({ error: 'Organization mismatch' }, { status: 400 })
    }

    if (!full_name || !full_name.trim()) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
    }

    // Update registration_data
    const updatedRegistrationData = {
      full_name: full_name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      phone_number: phone?.trim() || null, // Support both field names
      bio: bio?.trim() || null
    }

    // Prepare update payload
    const updatePayload: any = {
      registration_data: updatedRegistrationData
    }

    // Update payment_status if provided and event has payment
    if (payment_status !== undefined) {
      updatePayload.payment_status = payment_status
    }

    // Update registration
    const { error: updateError } = await adminSupabase
      .from('event_registrations')
      .update(updatePayload)
      .eq('id', registrationId)

    if (updateError) {
      logger.error({ error: updateError.message, event_id: eventId, registration_id: registrationId }, '[Edit Registration] Error updating registration');
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Optionally update participant profile if participant exists
    if (registration.participant_id) {
      const participantUpdates: any = {}
      
      // Only update if fields are provided and different
      if (full_name) {
        participantUpdates.full_name = full_name.trim()
      }
      if (email !== undefined) {
        participantUpdates.email = email?.trim() || null
      }
      if (phone !== undefined) {
        participantUpdates.phone = phone?.trim() || null
      }
      if (bio !== undefined) {
        participantUpdates.bio = bio?.trim() || null
      }

      if (Object.keys(participantUpdates).length > 0) {
        await adminSupabase
          .from('participants')
          .update(participantUpdates)
          .eq('id', registration.participant_id)
          .eq('org_id', event.org_id)
      }
    }

    // Log admin action
    await logAdminAction({
      orgId: event.org_id,
      userId: user.id,
      action: AdminActions.UPDATE_REGISTRATION,
      resourceType: ResourceTypes.EVENT_REGISTRATION,
      resourceId: registrationId,
      metadata: {
        event_id: eventId,
        participant_name: full_name?.trim(),
        payment_status_changed: payment_status !== undefined
      }
    })

    return NextResponse.json({ 
      success: true,
      message: 'Registration updated successfully'
    }, { status: 200 })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      event_id: eventId,
      registration_id: registrationId
    }, 'Error in PATCH /api/events/[id]/participants/[registrationId]');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

