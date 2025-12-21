import { NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { getParticipantDetail } from '@/lib/server/getParticipantDetail';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
// REMOVED: logParticipantAudit - audit logging removed in migration 072

async function ensureOrgAccess(orgId: string, logger?: ReturnType<typeof createAPILogger>) {
  const user = await getUnifiedUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const admin = createAdminServer();
  const { data: membership, error: membershipError } = await admin
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    if (logger) {
      logger.error({ error: membershipError.message, org_id: orgId, user_id: user.id }, 'Membership check error');
    }
    return { error: NextResponse.json({ error: 'Failed to verify membership' }, { status: 500 }) };
  }

  if (!membership) {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }

  return { admin, user };
}

function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  const digits = input.replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.substring(1)}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  if (digits.startsWith('7') && digits.length === 11) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

function normalizeEmail(email?: string | null): string | null {
  return email ? email.trim().toLowerCase() : null;
}

export async function POST(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/participants/enrich' });
  try {
    const payload = await request.json();
    const orgId = payload?.orgId as string | undefined;
    const targetParticipantId = payload?.targetParticipantId as string | undefined;

    if (!orgId || !targetParticipantId) {
      return NextResponse.json({ error: 'Missing orgId or targetParticipantId' }, { status: 400 });
    }

    const access = await ensureOrgAccess(orgId, logger);
    if ('error' in access) {
      return access.error;
    }

    const admin = access.admin;

    const { data: existingParticipant, error: participantError } = await admin
      .from('participants')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', targetParticipantId)
      .maybeSingle();

    if (participantError) {
      logger.error({ error: participantError.message, participant_id: targetParticipantId, org_id: orgId }, 'Error loading participant for enrichment');
      return NextResponse.json({ error: 'Failed to load participant' }, { status: 500 });
    }

    if (!existingParticipant) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
    }

    const email = normalizeEmail(payload?.email);
    const phone = normalizePhone(payload?.phone);
    const username = payload?.username?.trim()?.replace(/^@/, '') || null;
    const tgUserId = payload?.tg_user_id ? Number(payload.tg_user_id) : null;
    const firstName = payload?.first_name?.trim() || null;
    const lastName = payload?.last_name?.trim() || null;
    const fullName = payload?.full_name?.trim() || null;
    const notes = payload?.notes?.trim() || null;

    const updatePayload: Record<string, any> = {};

    if (!existingParticipant.email && email) {
      updatePayload.email = email;
    }
    if (!existingParticipant.phone && phone) {
      updatePayload.phone = phone;
    }
    if (!existingParticipant.username && username) {
      updatePayload.username = username;
    }
    if (!existingParticipant.tg_user_id && tgUserId) {
      updatePayload.tg_user_id = tgUserId;
    }
    if (!existingParticipant.first_name && firstName) {
      updatePayload.first_name = firstName;
    }
    if (!existingParticipant.last_name && lastName) {
      updatePayload.last_name = lastName;
    }
    if ((!existingParticipant.full_name || existingParticipant.full_name === existingParticipant.username) && fullName) {
      updatePayload.full_name = fullName;
    }
    if ((!existingParticipant.source || existingParticipant.source === 'unknown') && payload?.source) {
      updatePayload.source = payload.source;
    }
    if (!existingParticipant.status && payload?.status) {
      updatePayload.status = payload.status;
    }
    if (notes) {
      if (!existingParticipant.notes) {
        updatePayload.notes = notes;
      } else if (!existingParticipant.notes.includes(notes)) {
        updatePayload.notes = `${existingParticipant.notes}\n\n${notes}`;
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ success: true, participantId: existingParticipant.id, updatedFields: [] });
    }

    updatePayload.updated_at = new Date().toISOString();

    const { error: updateError } = await admin
      .from('participants')
      .update(updatePayload)
      .eq('org_id', orgId)
      .eq('id', existingParticipant.id);

    if (updateError) {
      logger.error({ error: updateError.message, participant_id: existingParticipant.id, org_id: orgId }, 'Error enriching participant');
      return NextResponse.json({ error: 'Failed to update participant' }, { status: 500 });
    }

    const updatedFields = Object.keys(updatePayload).filter(key => key !== 'updated_at');

    // REMOVED: Audit logging (migration 072)
    if (updatedFields.length > 0) {
      logger.info({ 
        participant_id: existingParticipant.id, 
        updated_fields: updatedFields,
        org_id: orgId
      }, '[Participant Enriched]');
    }

    const detail = await getParticipantDetail(orgId, existingParticipant.id);

    return NextResponse.json({
      success: true,
      participantId: existingParticipant.id,
      updatedFields,
      detail
    });
  } catch (error: any) {
    logger.error({ 
      error: error?.message || String(error),
      stack: error?.stack
    }, 'Error enriching participant');
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

