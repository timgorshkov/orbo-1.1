import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { logErrorToDatabase } from '@/lib/logErrorToDatabase'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

// POST /api/events/[id]/register - Register for event
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/register' });
  try {
    const adminSupabase = createAdminServer()

    // Check authentication via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event details (простой запрос без JOIN)
    const { data: event, error: eventError } = await adminSupabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check if event is published
    if (event.status !== 'published') {
      return NextResponse.json(
        { error: 'This event is not open for registration' },
        { status: 400 }
      )
    }

    // For recurring child instances: registration links to the parent series event
    const registrationEventId: string = event.parent_event_id ?? eventId

    // Parse request body for registration_data and quantity
    const body = await request.json().catch(() => ({}))
    const registrationData = body.registration_data || {}
    const quantity = Math.min(Math.max(parseInt(body.quantity) || 1, 1), 5) // Clamp between 1 and 5
    const pdConsent = body.pd_consent === true
    const announcementsConsent = body.announcements_consent === true

    // Check capacity (always against the registration event — parent for recurring)
    if (event.capacity) {
      const countByPaid = event.capacity_count_by_paid || false

      // Получаем регистрации отдельно для подсчёта
      const { data: eventRegistrations } = await adminSupabase
        .from('event_registrations')
        .select('id, status, payment_status, quantity')
        .eq('event_id', registrationEventId)
      
      let registeredCount = 0
      if (countByPaid) {
        registeredCount = eventRegistrations?.filter(
          (reg: any) => reg.status === 'registered' && reg.payment_status === 'paid'
        ).reduce((sum: number, reg: any) => sum + (reg.quantity || 1), 0) || 0
      } else {
        registeredCount = eventRegistrations?.filter(
          (reg: any) => reg.status === 'registered'
        ).reduce((sum: number, reg: any) => sum + (reg.quantity || 1), 0) || 0
      }
      
      if (registeredCount + quantity > event.capacity) {
        return NextResponse.json(
          { error: 'Event is full' },
          { status: 400 }
        )
      }
    }

    // Find existing participant via user_telegram_accounts
    // First, get telegram account linked to this user
    const { data: telegramAccount } = await adminSupabase
      .from('user_telegram_accounts')
      .select('telegram_user_id, telegram_username')
      .eq('user_id', user.id)
      .eq('org_id', event.org_id)
      .maybeSingle()

    let participant: Record<string, any> | null = null

    // Try to find participant by telegram_user_id (only canonical, not merged)
    if (telegramAccount?.telegram_user_id) {
      const { data: foundParticipant } = await adminSupabase
        .from('participants')
        .select('id')
        .eq('org_id', event.org_id)
        .eq('tg_user_id', telegramAccount.telegram_user_id)
        .is('merged_into', null)
        .maybeSingle()

      participant = foundParticipant
    }

    // NEW: If not found by telegram_user_id, try finding by email
    // This prevents creating duplicate participants for users without confirmed Telegram
    if (!participant && user.email) {
      logger.debug({ email: user.email, event_id: eventId }, 'Searching participant by email');

      const { data: foundByEmail } = await adminSupabase
        .from('participants')
        .select('id, tg_user_id')
        .eq('org_id', event.org_id)
        .eq('email', user.email)
        .is('merged_into', null)
        .maybeSingle()

      if (foundByEmail) {
        logger.debug({ participant_id: foundByEmail.id, email: user.email }, 'Found existing participant by email');
        participant = foundByEmail

        // If we found participant by email AND user now has confirmed Telegram,
        // update the participant with telegram_user_id
        if (telegramAccount?.telegram_user_id && !foundByEmail.tg_user_id) {
          logger.debug({ 
            participant_id: foundByEmail.id,
            telegram_user_id: telegramAccount.telegram_user_id
          }, 'Linking telegram_user_id to participant');
          
          await adminSupabase
            .from('participants')
            .update({ 
              tg_user_id: telegramAccount.telegram_user_id,
              username: telegramAccount.telegram_username
            })
            .eq('id', foundByEmail.id)
        }
      }
    }

    // If participant still not found, create a new one
    // This should only happen for first-time event registration
    if (!participant) {
      logger.info({ user_id: user.id, org_id: event.org_id, event_id: eventId }, 'Creating new participant');
      
      const { data: newParticipant, error: createError } = await adminSupabase
        .from('participants')
        .insert({
          org_id: event.org_id,
          tg_user_id: telegramAccount?.telegram_user_id || null,
          username: telegramAccount?.telegram_username || null,
          full_name: user.email || 'Unknown',
          email: user.email,
          source: 'event',
          participant_status: 'event_attendee'
        })
        .select('id')
        .single()

      if (createError) {
        logger.error({ error: createError.message, user_id: user.id, org_id: event.org_id }, 'Error creating participant');
        
        // Handle duplicate email case (race condition or unique constraint)
        if (createError.code === '23505') {
          // Try to find the participant that was just created
          const { data: existingByEmail } = await adminSupabase
            .from('participants')
            .select('id')
            .eq('org_id', event.org_id)
            .eq('email', user.email)
            .is('merged_into', null)
            .maybeSingle()
          
          if (existingByEmail) {
            logger.debug({ participant_id: existingByEmail.id }, 'Using participant created in race condition');
            participant = existingByEmail
          } else {
            return NextResponse.json(
              { error: 'Error creating participant' },
              { status: 500 }
            )
          }
        } else {
          return NextResponse.json(
            { error: 'Error creating participant' },
            { status: 500 }
          )
        }
      } else {
        participant = newParticipant
      }
    }

    // Guard: participant should be resolved by this point
    if (!participant) {
      return NextResponse.json({ error: 'Failed to resolve participant' }, { status: 500 })
    }

    // Re-opt-in: if this is a child instance and the participant previously opted out,
    // delete the per-instance cancellation record and return success (parent reg still active)
    if (event.parent_event_id) {
      const { data: instanceOptOut } = await adminSupabase
        .from('event_registrations')
        .select('id')
        .eq('event_id', eventId)
        .eq('participant_id', participant.id)
        .eq('status', 'cancelled')
        .maybeSingle()

      if (instanceOptOut) {
        // Check that parent registration is still active
        const { data: parentReg } = await adminSupabase
          .from('event_registrations')
          .select('id, status')
          .eq('event_id', registrationEventId)
          .eq('participant_id', participant.id)
          .eq('status', 'registered')
          .maybeSingle()

        if (parentReg) {
          // Delete the instance opt-out → participant is back
          await adminSupabase
            .from('event_registrations')
            .update({ status: 'registered' })
            .eq('id', instanceOptOut.id)
          return NextResponse.json({ success: true, reactivated: true }, { status: 200 })
        }
      }
    }

    // Check if already registered (use admin client to bypass RLS)
    const { data: existingRegistration } = await adminSupabase
      .from('event_registrations')
      .select('id, status')
      .eq('event_id', registrationEventId)
      .eq('participant_id', participant.id)
      .maybeSingle()

    if (existingRegistration) {
      if (existingRegistration.status === 'registered') {
        return NextResponse.json(
          { error: 'Already registered for this event' },
          { status: 400 }
        )
      }
      
      // Reactivate cancelled registration using admin client
      // Don't use .select() to avoid RLS policy checks
      const reactivateData: Record<string, unknown> = {
        status: 'registered',
        registered_at: new Date().toISOString(),
        registration_data: registrationData,
        quantity: quantity,
      }
      if (pdConsent) reactivateData.pd_consent_at = new Date().toISOString()

      const { error: updateError } = await adminSupabase
        .from('event_registrations')
        .update(reactivateData)
        .eq('id', existingRegistration.id)

      if (updateError) {
        logger.error({ error: updateError.message, registration_id: existingRegistration.id }, 'Error updating registration');
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      // Update announcements consent on participant
      if (announcementsConsent && participant?.id) {
        try {
          await adminSupabase
            .from('participants')
            .update({ announcements_consent_granted_at: new Date().toISOString(), announcements_consent_revoked_at: null })
            .eq('id', participant.id)
        } catch { /* non-critical */ }
      }

      // Fetch updated registration separately
      const { data: registration } = await adminSupabase
        .from('event_registrations')
        .select('*')
        .eq('id', existingRegistration.id)
        .single()

      return NextResponse.json({ registration }, { status: 200 })
    }

    // Use RPC function to register (completely bypasses RLS via SECURITY DEFINER)
    logger.debug({ 
      event_id: eventId,
      participant_id: participant.id,
      quantity,
      registration_data_keys: Object.keys(registrationData)
    }, '[API] About to call register_for_event RPC');
    
    const { data: registrationResult, error: rpcError } = await adminSupabase
      .rpc('register_for_event', {
        p_event_id: registrationEventId,  // parent event for recurring series
        p_participant_id: participant.id,
        p_registration_data: registrationData,
        p_quantity: quantity
      })

    logger.debug({ 
      has_data: !!registrationResult,
      has_error: !!rpcError,
      error_code: rpcError?.code,
      error_message: rpcError?.message
    }, '[API] RPC call returned');

    if (rpcError) {
      logger.error({ 
        error: rpcError.message,
        error_code: rpcError.code,
        event_id: eventId,
        participant_id: participant.id
      }, 'Error creating registration via RPC');
      
      // Handle duplicate key error gracefully
      if (rpcError.code === '23505' || rpcError.message?.includes('duplicate')) {
        // User is already registered (race condition) - this is expected, not an error
        await logErrorToDatabase({
          level: 'info',
          message: 'Duplicate event registration attempt (race condition)',
          errorCode: 'EVENT_REGISTER_DUPLICATE',
          context: {
            endpoint: '/api/events/[id]/register',
            eventId,
            participantId: participant.id
          }
        })
        
        const { data: existingReg } = await adminSupabase
          .from('event_registrations')
          .select('*')
          .eq('event_id', eventId)
          .eq('participant_id', participant.id)
          .single()
        
        return NextResponse.json(
          { 
            registration: existingReg,
            message: 'Already registered' 
          },
          { status: 200 }
        )
      }
      
      await logErrorToDatabase({
        level: 'error',
        message: `Failed to register for event: ${rpcError.message}`,
        errorCode: 'EVENT_REGISTER_ERROR',
        context: {
          endpoint: '/api/events/[id]/register',
          eventId,
          participantId: participant.id,
          rpcErrorCode: rpcError.code,
          rpcErrorMessage: rpcError.message
        }
      })
      
      return NextResponse.json(
        { error: rpcError.message || 'Failed to register for event' },
        { status: 500 }
      )
    }

    // RPC function returns array, get first result
    const registrationRow = Array.isArray(registrationResult) && registrationResult.length > 0
      ? registrationResult[0]
      : registrationResult

    if (!registrationRow) {
      logger.error({ event_id: eventId, participant_id: participant.id }, 'RPC function returned no registration data');
      return NextResponse.json(
        { error: 'Registration failed - no data returned' },
        { status: 500 }
      )
    }

    // Set price from event default_price (RPC doesn't set it)
    if (registrationRow.registration_id && event.default_price) {
      try {
        await adminSupabase
          .from('event_registrations')
          .update({ price: event.default_price })
          .eq('id', registrationRow.registration_id)
      } catch { /* non-critical */ }
    }
    // Save consent timestamps
    if (registrationRow.registration_id && pdConsent) {
      try {
        await adminSupabase
          .from('event_registrations')
          .update({ pd_consent_at: new Date().toISOString() })
          .eq('id', registrationRow.registration_id)
      } catch { /* non-critical */ }
    }
    if (announcementsConsent && participant?.id) {
      try {
        await adminSupabase
          .from('participants')
          .update({ announcements_consent_granted_at: new Date().toISOString(), announcements_consent_revoked_at: null })
          .eq('id', participant.id)
      } catch { /* non-critical */ }
    }

    // Map RPC function column names to expected format
    const registration = {
      id: registrationRow.registration_id,
      event_id: registrationRow.registration_event_id,
      participant_id: registrationRow.registration_participant_id,
      status: registrationRow.registration_status,
      registration_source: registrationRow.registration_source,
      registration_data: registrationRow.registration_data,
      quantity: registrationRow.registration_quantity,
      registered_at: registrationRow.registration_registered_at,
      qr_token: registrationRow.registration_qr_token || null
    }

    // Send confirmation (fire-and-forget) — only for free events.
    // For paid events, confirmation is sent after payment via paymentService.
    // Errors are logged so silent module-load failures don't go unnoticed.
    if (!event.requires_payment && !event.default_price) {
      import('@/lib/services/registrationConfirmationService')
        .then(({ sendRegistrationConfirmation }) =>
          sendRegistrationConfirmation({
            registrationId: registration.id,
            eventId: registration.event_id,
            orgId: event.org_id,
            participantId: registration.participant_id,
            qrToken: registration.qr_token,
          }).catch((err: any) =>
            logger.error(
              { error: err?.message, registration_id: registration.id },
              'sendRegistrationConfirmation runtime error'
            )
          )
        )
        .catch((err: any) =>
          logger.error(
            { error: err?.message, stack: err?.stack, registration_id: registration.id },
            'sendRegistrationConfirmation module load failed'
          )
        )
    }

    return NextResponse.json({ registration }, { status: 201 })
  } catch (error: any) {
    await logErrorToDatabase({
      level: 'error',
      message: error.message || 'Unknown error in event registration',
      errorCode: 'EVENT_REGISTER_ERROR',
      context: {
        endpoint: '/api/events/[id]/register',
        errorType: error.constructor?.name || typeof error
      },
      stackTrace: error.stack
    })
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/events/[id]/register - Unregister from event
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/register' });
  try {
    const adminSupabase = createAdminServer()

    // Check authentication via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get scope: 'this' = cancel only this instance, 'all' = cancel full series (default)
    const { searchParams } = new URL(request.url)
    const scope = searchParams.get('scope') || 'all'

    // Get event details
    const { data: event, error: eventError } = await adminSupabase
      .from('events')
      .select('org_id, parent_event_id')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Find participant via user_telegram_accounts
    const { data: telegramAccount } = await adminSupabase
      .from('user_telegram_accounts')
      .select('telegram_user_id, telegram_username')
      .eq('user_id', user.id)
      .eq('org_id', event.org_id)
      .maybeSingle()

    let participant: { id: string } | null = null

    // Try to find participant by telegram_user_id
    if (telegramAccount?.telegram_user_id) {
      const { data: foundParticipant } = await adminSupabase
        .from('participants')
        .select('id')
        .eq('org_id', event.org_id)
        .eq('tg_user_id', telegramAccount.telegram_user_id)
        .is('merged_into', null)
        .maybeSingle()

      participant = foundParticipant as { id: string } | null
    }

    // Also try to find by email if not found by telegram
    if (!participant && user.email) {
      const { data: foundByEmail } = await adminSupabase
        .from('participants')
        .select('id')
        .eq('org_id', event.org_id)
        .eq('email', user.email)
        .is('merged_into', null)
        .maybeSingle()

      participant = foundByEmail as { id: string } | null
    }

    if (!participant) {
      return NextResponse.json(
        { error: 'Participant not found' },
        { status: 404 }
      )
    }

    if (scope === 'this' && event.parent_event_id) {
      // Cancel only this specific instance — insert/update a per-instance opt-out record
      const { data: existingInstanceReg } = await adminSupabase
        .from('event_registrations')
        .select('id')
        .eq('event_id', eventId)
        .eq('participant_id', participant.id)
        .maybeSingle()

      if (existingInstanceReg) {
        const { error: updateErr } = await adminSupabase
          .from('event_registrations')
          .update({ status: 'cancelled' })
          .eq('id', existingInstanceReg.id)
        if (updateErr) {
          return NextResponse.json({ error: updateErr.message }, { status: 500 })
        }
      } else {
        // Insert a new "opt-out" record for this instance
        const { error: insertErr } = await adminSupabase
          .from('event_registrations')
          .insert({
            event_id: eventId,
            participant_id: participant.id,
            status: 'cancelled',
            registration_source: 'instance_opt_out',
            registered_at: new Date().toISOString()
          })
        if (insertErr) {
          logger.error({ error: insertErr.message }, 'Error inserting instance opt-out')
          return NextResponse.json({ error: insertErr.message }, { status: 500 })
        }
      }
    } else {
      // Cancel the series (parent) registration or standalone
      const regEventId = (event as any).parent_event_id || eventId

      // Сначала найдём регистрацию — нужен id для отмены payment_session
      const { data: regToCancel } = await adminSupabase
        .from('event_registrations')
        .select('id')
        .eq('event_id', regEventId)
        .eq('participant_id', participant.id)
        .eq('status', 'registered')
        .maybeSingle()

      const { error: cancelError } = await adminSupabase
        .from('event_registrations')
        .update({ status: 'cancelled' })
        .eq('event_id', regEventId)
        .eq('participant_id', participant.id)
        .eq('status', 'registered')

      if (cancelError) {
        logger.error({ error: cancelError.message, event_id: eventId }, 'Error cancelling registration');
        return NextResponse.json({ error: cancelError.message }, { status: 500 })
      }

      // Отменить pending payment_session для этой регистрации, чтобы при
      // повторной регистрации создалась свежая сессия (а не переиспользовался
      // старый URL платёжного шлюза, который уже «протух»).
      if (regToCancel?.id) {
        await adminSupabase.raw(
          `UPDATE payment_sessions
              SET status = 'cancelled',
                  idempotency_key = NULL
            WHERE event_registration_id = $1
              AND status IN ('pending', 'processing')`,
          [regToCancel.id]
        ).catch(() => { /* non-critical */ })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      event_id: eventId
    }, 'Error in DELETE /api/events/[id]/register');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

