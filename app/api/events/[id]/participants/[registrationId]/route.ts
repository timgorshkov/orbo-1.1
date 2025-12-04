import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'

// PATCH /api/events/[id]/participants/[registrationId] - Update event registration (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; registrationId: string }> }
) {
  try {
    const { id: eventId, registrationId } = await params
    const supabase = await createClientServer()
    const adminSupabase = createAdminServer()

    // Check authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
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
      console.error('[Edit Registration] Error updating registration:', updateError)
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

    return NextResponse.json({ 
      success: true,
      message: 'Registration updated successfully'
    }, { status: 200 })
  } catch (error: any) {
    console.error('Error in PATCH /api/events/[id]/participants/[registrationId]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

