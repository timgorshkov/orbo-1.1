import { NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { getParticipantDetail } from '@/lib/server/getParticipantDetail';
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
// SupabaseClient type replaced with 'any' after Supabase removal
type SupabaseClient = any;

async function ensureOrgAccess(orgId: string, logger?: ReturnType<typeof createAPILogger>) {
  const user = await getUnifiedUser();

  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const adminClient = createAdminServer();

  const { data: membership, error: membershipError } = await adminClient
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    if (logger) {
      logger.error({ error: membershipError.message, org_id: orgId, user_id: user.id }, 'Membership check error');
    }
    return { user: null, error: NextResponse.json({ error: 'Failed to verify membership' }, { status: 500 }) };
  }

  if (!membership) {
    return { user: null, error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }

  return { user, adminClient };
}

export async function GET(request: Request, { params }: { params: Promise<{ participantId: string }> }) {
  const logger = createAPILogger(request, { endpoint: '/api/participants/[participantId]' });
  try {
    const { participantId } = await params
    const url = new URL(request.url);
    const orgId = url.searchParams.get('orgId');

    if (!orgId || !participantId) {
      return NextResponse.json({ error: 'Missing orgId or participantId' }, { status: 400 });
    }

    const { error } = await ensureOrgAccess(orgId, logger);
    if (error) return error;

    const detail = await getParticipantDetail(orgId, participantId);

    if (!detail) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error: any) {
    logger.error({ 
      error: error?.message || String(error),
      stack: error?.stack
    }, 'Error in participant GET');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ participantId: string }> }) {
  const logger = createAPILogger(request, { endpoint: '/api/participants/[participantId]' });
  let participantId: string | undefined;
  try {
    const paramsData = await params;
    participantId = paramsData.participantId;
    const payload = await request.json();
    const orgId = payload?.orgId;

    if (!orgId || !participantId) {
      return NextResponse.json({ error: 'Missing orgId or participantId' }, { status: 400 });
    }

    const { adminClient, user, error } = await ensureOrgAccess(orgId, logger);
    if (error) return error;
    if (!adminClient || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

  const { data: participantRecord, error: participantFetchError } = await adminClient
      .from('participants')
      .select('id, merged_into, source, status')
      .eq('org_id', orgId)
      .eq('id', participantId)
      .maybeSingle();

    if (participantFetchError || !participantRecord) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
    }

    const canonicalId = participantRecord.merged_into || participantRecord.id;

    const updatePayload: Record<string, any> = {};
    const allowedFields = ['full_name', 'first_name', 'last_name', 'username', 'email', 'phone', 'bio', 'activity_score', 'risk_score', 'traits_cache', 'last_activity_at', 'source', 'status', 'notes', 'custom_attributes'];
    allowedFields.forEach(field => {
      if (field in payload) {
        updatePayload[field] = payload[field];
      }
    });

    // Логирование для отладки
    logger.debug({
      participant_id: participantId,
      canonical_id: canonicalId,
      update_payload: updatePayload,
      has_custom_attributes: 'custom_attributes' in updatePayload,
      custom_attributes_value: updatePayload.custom_attributes
    }, 'PUT /api/participants/[participantId]');

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

  const { data: updatedParticipant, error: updateError } = await adminClient
      .from('participants')
      .update(updatePayload)
      .eq('org_id', orgId)
      .eq('id', canonicalId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      logger.error({ error: updateError.message, participant_id: participantId, canonical_id: canonicalId, org_id: orgId }, 'Error updating participant');
      return NextResponse.json({ error: 'Failed to update participant' }, { status: 500 });
    }

    logger.info({
      canonical_id: canonicalId,
      updated_custom_attributes: updatedParticipant?.custom_attributes
    }, 'Participant updated successfully');

  // Log admin action
  await logAdminAction({
    orgId,
    userId: user.id,
    action: AdminActions.UPDATE_PARTICIPANT,
    resourceType: ResourceTypes.PARTICIPANT,
    resourceId: canonicalId,
    changes: {
      after: updatePayload
    },
    metadata: {
      participant_name: updatedParticipant?.full_name
    }
  });

    const detail = await getParticipantDetail(orgId, participantId);

    return NextResponse.json({ success: true, participant: updatedParticipant, detail });
  } catch (error: any) {
    logger.error({ 
      error: error?.message || String(error),
      stack: error?.stack,
      participant_id: participantId || 'unknown'
    }, 'Error in participant PUT');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ participantId: string }> }) {
  const logger = createAPILogger(request, { endpoint: '/api/participants/[participantId]' });
  let participantId: string | undefined;
  try {
    const paramsData = await params;
    participantId = paramsData.participantId;
    const payload = await request.json();
    const orgId = payload?.orgId;

    if (!orgId || !participantId) {
      return NextResponse.json({ error: 'Missing orgId or participantId' }, { status: 400 });
    }

    const { adminClient, user, error } = await ensureOrgAccess(orgId, logger);
    if (error) return error;
    if (!adminClient || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action } = payload || {};

    switch (action) {
      case 'addTrait':
        return handleAddTrait(adminClient, user.id, orgId, participantId, payload, logger);
      case 'removeTrait':
        return handleRemoveTrait(adminClient, orgId, participantId, payload, logger);
      case 'mergeDuplicates':
        return handleMergeParticipants(adminClient, user.id, orgId, participantId, payload, logger);
      case 'unmerge':
        return handleUnmerge(adminClient, user.id, orgId, participantId, payload, logger);
      case 'repairMergeFields':
        return handleRepairMergeFields(adminClient, user.id, orgId, participantId, logger);
      case 'archive':
        return handleArchiveParticipant(adminClient, user.id, orgId, participantId, logger);
      case 'restore':
        return handleRestoreParticipant(adminClient, user.id, orgId, participantId, logger);
      default:
        return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }
  } catch (error: any) {
    logger.error({ 
      error: error?.message || String(error),
      stack: error?.stack,
      participant_id: participantId || 'unknown'
    }, 'Error in participant PATCH');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleAddTrait(supabase: SupabaseClient, actorId: string, orgId: string, participantId: string, payload: any, logger?: ReturnType<typeof createAPILogger>) {
  const { key, value, valueType, source, confidence, metadata } = payload || {};

  if (!key || !value) {
    return NextResponse.json({ error: 'Missing trait key or value' }, { status: 400 });
  }

  const { data: participantRecord, error: participantError } = await supabase
    .from('participants')
    .select('id, merged_into, source, status')
    .eq('org_id', orgId)
    .eq('id', participantId)
    .maybeSingle();

  if (participantError || !participantRecord) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  const canonicalId = participantRecord.merged_into || participantRecord.id;

  const { data: trait, error: traitError } = await supabase
    .rpc('upsert_participant_trait', {
      p_participant_id: canonicalId,
      p_trait_key: key,
      p_trait_value: value,
      p_value_type: valueType ?? 'text',
      p_source: source ?? 'manual',
      p_confidence: confidence ?? null,
      p_metadata: metadata ?? null,
      p_user_id: actorId
    });

  if (traitError) {
    if (logger) {
      logger.error({ error: traitError.message, participant_id: participantId, org_id: orgId }, 'Error upserting participant trait');
    }
    return NextResponse.json({ error: 'Failed to upsert trait' }, { status: 500 });
  }

  const detail = await getParticipantDetail(orgId, participantId);

  return NextResponse.json({ success: true, trait, detail });
}

async function handleRemoveTrait(supabase: SupabaseClient, orgId: string, participantId: string, payload: any, logger?: ReturnType<typeof createAPILogger>) {
  const { traitId } = payload || {};

  if (!traitId) {
    return NextResponse.json({ error: 'Missing traitId' }, { status: 400 });
  }

  const { data: participantRecord, error: participantError } = await supabase
    .from('participants')
    .select('id, merged_into')
    .eq('org_id', orgId)
    .eq('id', participantId)
    .maybeSingle();

  if (participantError || !participantRecord) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  const canonicalId = participantRecord.merged_into || participantRecord.id;

  const { error: deleteError } = await supabase
    .from('participant_traits')
    .delete()
    .eq('id', traitId)
    .eq('participant_id', canonicalId);

  if (deleteError) {
    if (logger) {
      logger.error({ error: deleteError.message, participant_id: participantId, org_id: orgId }, 'Error deleting participant trait');
    }
    return NextResponse.json({ error: 'Failed to delete trait' }, { status: 500 });
  }

  const detail = await getParticipantDetail(orgId, participantId);

  return NextResponse.json({ success: true, detail });
}

async function handleMergeParticipants(supabase: SupabaseClient, actorId: string, orgId: string, participantId: string, payload: any, logger?: ReturnType<typeof createAPILogger>) {
  const { duplicates, targetId, duplicateId } = payload || {};

  // ✅ Новая логика: participantId = canonical (target), duplicateId = source
  if (duplicateId && typeof duplicateId === 'string') {
    return mergeFromDuplicate(supabase, actorId, orgId, participantId, duplicateId, logger);
  }

  // ✅ Старая логика для обратной совместимости (если передан targetId)
  if (targetId && typeof targetId === 'string') {
    // Если targetId === participantId, значит это новая логика
    if (targetId === participantId) {
      return NextResponse.json({ error: 'Cannot merge participant into itself' }, { status: 400 });
    }
    // Иначе используем старую логику (participantId объединяется в targetId)
    return mergeIntoTarget(supabase, actorId, orgId, participantId, targetId, logger);
  }

  const duplicateList = Array.isArray(duplicates) ? duplicates : [];
  if (duplicateList.length === 0) {
    return NextResponse.json({ error: 'No duplicates provided' }, { status: 400 });
  }

  return mergeIntoTarget(supabase, actorId, orgId, participantId, duplicateList[0], logger);
}

/**
 * ✅ НОВАЯ ФУНКЦИЯ: Объединяет дубликат (duplicateId) в текущий профиль (participantId)
 * participantId = canonical (target, основной профиль)
 * duplicateId = source (дубликат, который будет merged_into participantId)
 */
async function mergeFromDuplicate(
  supabase: SupabaseClient,
  actorId: string,
  orgId: string,
  participantId: string,
  duplicateId: string,
  logger?: ReturnType<typeof createAPILogger>
): Promise<NextResponse> {
  if (!duplicateId || typeof duplicateId !== 'string') {
    return NextResponse.json({ error: 'Invalid duplicate ID' }, { status: 400 });
  }

  // Проверяем текущий открытый профиль (target)
  const { data: participantRecord, error: participantError } = await supabase
    .from('participants')
    .select('id, merged_into, status')
    .eq('org_id', orgId)
    .eq('id', participantId)
    .maybeSingle();

  if (participantError || !participantRecord) {
    if (logger) {
      logger.error({ error: participantError?.message, participant_id: participantId }, 'Current participant (target) not found');
    }
    return NextResponse.json({ error: 'Current participant not found' }, { status: 404 });
  }

  const canonicalId = participantRecord.merged_into || participantRecord.id;
  
  if (logger) {
    logger.debug({
      id: participantId,
      merged_into: participantRecord.merged_into,
      status: participantRecord.status,
      canonical_id: canonicalId
    }, 'Merge from duplicate - Current participant (TARGET)');
  }

  // Проверяем выбранный дубликат (source)
  const { data: duplicateRecord, error: duplicateError } = await supabase
    .from('participants')
    .select('id, merged_into, status')
    .eq('org_id', orgId)
    .eq('id', duplicateId)
    .maybeSingle();

  if (duplicateError || !duplicateRecord) {
    if (logger) {
      logger.error({ error: duplicateError?.message, duplicate_id: duplicateId }, 'Duplicate (source) not found');
    }
    return NextResponse.json({ error: 'Duplicate participant not found' }, { status: 404 });
  }

  const duplicateCanonical = duplicateRecord.merged_into || duplicateRecord.id;
  
  if (logger) {
    logger.debug({
      id: duplicateId,
      merged_into: duplicateRecord.merged_into,
      status: duplicateRecord.status,
      duplicate_canonical: duplicateCanonical
    }, 'Merge from duplicate - Selected duplicate (SOURCE)');
  }

  // Проверка: нельзя объединить сам с собой
  if (canonicalId === duplicateCanonical) {
    if (logger) {
      logger.error({ canonical_id: canonicalId, duplicate_canonical: duplicateCanonical }, 'Cannot merge participant with itself');
    }
    return NextResponse.json({ 
      error: 'Cannot merge participant with itself',
      details: {
        participantId,
        duplicateId,
        sharedCanonical: canonicalId
      }
    }, { status: 400 });
  }

  // ✅ ПРАВИЛЬНАЯ ЛОГИКА: canonicalId (текущий) = target, duplicateCanonical (дубликат) = source
  if (logger) {
    logger.info({
      target: canonicalId,
      duplicates: [duplicateCanonical],
      actor: actorId
    }, 'Executing merge_participants_smart');
  }

  const { data: mergeResult, error: mergeError } = await supabase
    .rpc('merge_participants_smart', {
      p_target: canonicalId, // ✅ Текущий открытый профиль
      p_duplicates: [duplicateCanonical], // ✅ Выбранный дубликат
      p_actor: actorId
    });

  if (mergeError) {
    if (logger) {
      logger.warn({ error: mergeError.message, target: canonicalId, duplicates: [duplicateCanonical] }, 'Error merging participants (trying fallback)');
    }
    
    // Если новая функция недоступна, используем старую
    const { error: fallbackError } = await supabase
      .rpc('merge_participants_extended', {
        p_target: canonicalId,
        p_duplicates: [duplicateCanonical],
        p_actor: actorId
      });
    
    if (fallbackError) {
      if (logger) {
        logger.error({ error: fallbackError.message, target: canonicalId, duplicates: [duplicateCanonical] }, 'Error merging participants (fallback)');
      }
      return NextResponse.json({ error: 'Failed to merge participants' }, { status: 500 });
    }
  }
  
  // Логируем результаты объединения
  if (mergeResult && logger) {
    logger.info({ merge_result: mergeResult }, 'Merge result');
    
    if (mergeResult.conflicts && mergeResult.conflicts.length > 0) {
      logger.info({ conflicts: mergeResult.conflicts }, 'Conflicts detected');
    }
    
    if (mergeResult.merged_fields && mergeResult.merged_fields.length > 0) {
      logger.info({ merged_fields: mergeResult.merged_fields }, 'Fields merged');
    }
  }

  // Log admin action
  await logAdminAction({
    orgId,
    userId: actorId,
    action: AdminActions.MERGE_PARTICIPANTS,
    resourceType: ResourceTypes.PARTICIPANT,
    resourceId: canonicalId,
    metadata: {
      merged_from: duplicateCanonical,
      merged_into: canonicalId
    }
  });

  const detail = await getParticipantDetail(orgId, canonicalId);

  return NextResponse.json({ 
    success: true, 
    detail, 
    merged_into: canonicalId,
    merge_result: mergeResult || null
  });
}

/**
 * ⚠️ СТАРАЯ ФУНКЦИЯ: Объединяет participantId в targetId (обратная логика)
 * Оставлена для обратной совместимости
 */
async function mergeIntoTarget(
  supabase: SupabaseClient,
  actorId: string,
  orgId: string,
  participantId: string,
  targetId: string,
  logger?: ReturnType<typeof createAPILogger>
): Promise<NextResponse> {
  if (!targetId || typeof targetId !== 'string') {
    return NextResponse.json({ error: 'Invalid merge target' }, { status: 400 });
  }

  const { data: participantRecord, error: participantError } = await supabase
    .from('participants')
    .select('id, merged_into, status')
    .eq('org_id', orgId)
    .eq('id', participantId)
    .maybeSingle();

  if (participantError || !participantRecord) {
    if (logger) {
      logger.error({ error: participantError?.message, participant_id: participantId }, 'Participant not found');
    }
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  const canonicalId = participantRecord.merged_into || participantRecord.id;
  
  if (logger) {
    logger.debug({
      id: participantId,
      merged_into: participantRecord.merged_into,
      status: participantRecord.status,
      canonical_id: canonicalId
    }, 'Merge check - Current participant');
  }

  if (canonicalId === targetId) {
    if (logger) {
      logger.error({ canonical_id: canonicalId, target_id: targetId }, 'Cannot merge into itself');
    }
    return NextResponse.json({ error: 'Cannot merge participant into itself' }, { status: 400 });
  }

  const { data: targetRecord, error: targetError } = await supabase
    .from('participants')
    .select('id, merged_into, status')
    .eq('org_id', orgId)
    .eq('id', targetId)
    .maybeSingle();

  if (targetError || !targetRecord) {
    if (logger) {
      logger.error({ error: targetError?.message, target_id: targetId }, 'Target not found');
    }
    return NextResponse.json({ error: 'Selected participant not found' }, { status: 404 });
  }

  const targetCanonical = targetRecord.merged_into || targetRecord.id;
  
  if (logger) {
    logger.debug({
      id: targetId,
      merged_into: targetRecord.merged_into,
      status: targetRecord.status,
      target_canonical: targetCanonical
    }, 'Merge check - Target participant');
  }

  if (targetCanonical === canonicalId) {
    if (logger) {
      logger.error({
        participant_id: participantId,
        target_id: targetId,
        canonical_id: canonicalId,
        target_canonical: targetCanonical,
        participant_merged_into: participantRecord.merged_into,
        target_merged_into: targetRecord.merged_into
      }, 'Participants already share canonical record');
    }
    return NextResponse.json({ 
      error: 'Participants already share canonical record',
      details: {
        participantId,
        targetId,
        sharedCanonical: canonicalId
      }
    }, { status: 400 });
  }

  // Пытаемся использовать новую "умную" функцию объединения
  const { data: mergeResult, error: mergeError } = await supabase
    .rpc('merge_participants_smart', {
      p_target: targetCanonical,
      p_duplicates: [canonicalId],
      p_actor: actorId
    });

  if (mergeError) {
    if (logger) {
      logger.warn({ error: mergeError.message, target: targetCanonical, duplicates: [canonicalId] }, 'Error merging participants (trying fallback)');
    }
    
    // Если новая функция недоступна, используем старую
    const { error: fallbackError } = await supabase
      .rpc('merge_participants_extended', {
        p_target: targetCanonical,
        p_duplicates: [canonicalId],
        p_actor: actorId
      });
    
    if (fallbackError) {
      if (logger) {
        logger.error({ error: fallbackError.message, target: targetCanonical, duplicates: [canonicalId] }, 'Error merging participants (fallback)');
      }
      return NextResponse.json({ error: 'Failed to merge participants' }, { status: 500 });
    }
  }
  
  // Логируем результаты объединения
  if (mergeResult && logger) {
    logger.info({ merge_result: mergeResult }, 'Merge result');
    
    if (mergeResult.conflicts && mergeResult.conflicts.length > 0) {
      logger.info({ conflicts: mergeResult.conflicts }, 'Conflicts detected');
    }
    
    if (mergeResult.merged_fields && mergeResult.merged_fields.length > 0) {
      logger.info({ merged_fields: mergeResult.merged_fields }, 'Fields merged');
    }
  }

  // Log admin action
  await logAdminAction({
    orgId,
    userId: actorId,
    action: AdminActions.MERGE_PARTICIPANTS,
    resourceType: ResourceTypes.PARTICIPANT,
    resourceId: targetCanonical,
    metadata: {
      merged_from: canonicalId,
      merged_into: targetCanonical
    }
  });

  const detail = await getParticipantDetail(orgId, targetCanonical);

  return NextResponse.json({ 
    success: true, 
    detail, 
    merged_into: targetCanonical,
    merge_result: mergeResult || null
  });
}

/**
 * Разъединение (unmerge) ранее объединённого участника.
 * Освобождает ghostId: снимает merged_into и возвращает статус 'participant'.
 * participantId здесь = canonical (основной профиль), ghostId = прикреплённый.
 * Данные (traits, participant_groups), перенесённые при merge, не откатываются
 * автоматически — сброс только связи merged_into.
 */
async function handleUnmerge(
  supabase: SupabaseClient,
  actorId: string,
  orgId: string,
  canonicalId: string,
  payload: any,
  logger?: ReturnType<typeof createAPILogger>
): Promise<NextResponse> {
  const { ghostId } = payload || {};

  if (!ghostId || typeof ghostId !== 'string') {
    return NextResponse.json({ error: 'ghostId required' }, { status: 400 });
  }

  // Verify the ghost belongs to this org and is merged into the canonical
  const { data: ghost, error: ghostError } = await supabase
    .from('participants')
    .select('id, full_name, merged_into, participant_status, org_id')
    .eq('id', ghostId)
    .maybeSingle();

  if (ghostError || !ghost) {
    return NextResponse.json({ error: 'Ghost participant not found' }, { status: 404 });
  }

  if (ghost.org_id !== orgId) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  if (ghost.merged_into !== canonicalId) {
    return NextResponse.json({
      error: 'This participant is not merged into the specified canonical',
      details: { ghostId, expected_canonical: canonicalId, actual_merged_into: ghost.merged_into }
    }, { status: 400 });
  }

  // Release the ghost: clear merged_into, restore status
  const { error: updateError } = await supabase
    .from('participants')
    .update({
      merged_into: null,
      status: 'active',
      participant_status: 'participant',
      updated_at: new Date().toISOString(),
    })
    .eq('id', ghostId);

  if (updateError) {
    if (logger) {
      logger.error({ error: updateError.message, ghost_id: ghostId, canonical_id: canonicalId }, 'Error unmerging participant');
    }
    return NextResponse.json({ error: 'Failed to unmerge participant' }, { status: 500 });
  }

  // Also clear the participant_duplicates record so it can re-appear as a candidate
  await supabase
    .from('participant_duplicates')
    .update({ status: 'pending' })
    .or(`participant_id.eq.${ghostId},duplicate_participant_id.eq.${ghostId}`);

  await logAdminAction({
    orgId,
    userId: actorId,
    action: AdminActions.MERGE_PARTICIPANTS,
    resourceType: ResourceTypes.PARTICIPANT,
    resourceId: canonicalId,
    metadata: { action_type: 'unmerge', released_ghost: ghostId, ghost_name: ghost.full_name }
  });

  if (logger) {
    logger.info({ canonical_id: canonicalId, ghost_id: ghostId }, 'Participant unmerged (detached)');
  }

  const detail = await getParticipantDetail(orgId, canonicalId);
  return NextResponse.json({ success: true, detail, released_ghost: ghostId });
}

/**
 * Repairs a previously merged canonical participant by re-copying all important
 * fields from any attached ghost profiles.  Safe to run multiple times.
 * Uses COALESCE so existing values on the canonical are never overwritten.
 */
async function handleRepairMergeFields(
  supabase: SupabaseClient,
  actorId: string,
  orgId: string,
  participantId: string,
  logger?: ReturnType<typeof createAPILogger>
): Promise<NextResponse> {
  // Resolve canonical
  const { data: rec, error: recError } = await supabase
    .from('participants')
    .select('id, merged_into, org_id')
    .eq('id', participantId)
    .maybeSingle();

  if (recError || !rec) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }
  if (rec.org_id !== orgId) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const canonicalId = rec.merged_into || rec.id;

  // Fetch all ghost profiles merged into canonical
  const { data: ghosts, error: ghostsError } = await supabase
    .from('participants')
    .select('id, tg_user_id, username, photo_url, bio, max_user_id, max_username, tg_first_name, tg_last_name')
    .eq('merged_into', canonicalId);

  if (ghostsError) {
    return NextResponse.json({ error: 'Failed to load merged profiles' }, { status: 500 });
  }

  if (!ghosts || ghosts.length === 0) {
    return NextResponse.json({ success: true, message: 'No merged profiles found', repaired: false });
  }

  // Build COALESCE patches: pick first non-null value from any ghost
  const patch: Record<string, any> = {};
  const pick = (field: string) => {
    for (const g of ghosts) {
      if ((g as any)[field] != null) return (g as any)[field];
    }
    return null;
  };

  const { data: canonical } = await supabase
    .from('participants')
    .select('tg_user_id, username, photo_url, bio, max_user_id, max_username, tg_first_name, tg_last_name')
    .eq('id', canonicalId)
    .maybeSingle();

  const fields = ['tg_user_id', 'username', 'photo_url', 'bio', 'max_user_id', 'max_username', 'tg_first_name', 'tg_last_name'];
  for (const field of fields) {
    if (!(canonical as any)?.[field]) {
      const val = pick(field);
      if (val != null) patch[field] = val;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: true, message: 'All fields already populated on canonical', repaired: false });
  }

  patch.updated_at = new Date().toISOString();
  patch.updated_by = actorId;

  const { error: updateError } = await supabase
    .from('participants')
    .update(patch)
    .eq('id', canonicalId);

  if (updateError) {
    if (logger) logger.error({ error: updateError.message, canonical_id: canonicalId }, 'Error repairing merge fields');
    return NextResponse.json({ error: 'Failed to repair merge fields' }, { status: 500 });
  }

  if (logger) logger.info({ canonical_id: canonicalId, patched: Object.keys(patch) }, 'Merge fields repaired');

  const detail = await getParticipantDetail(orgId, canonicalId);
  return NextResponse.json({ success: true, repaired: true, patched_fields: Object.keys(patch), detail });
}

/**
 * Архивирование участника
 * Устанавливает participant_status = 'excluded' и deleted_at = NOW()
 * Участник перестаёт отображаться в списках, но данные сохраняются
 */
async function handleArchiveParticipant(
  supabase: SupabaseClient,
  actorId: string,
  orgId: string,
  participantId: string,
  logger?: ReturnType<typeof createAPILogger>
): Promise<NextResponse> {
  // Получаем участника
  const { data: participant, error: fetchError } = await supabase
    .from('participants')
    .select('id, full_name, participant_status, merged_into')
    .eq('org_id', orgId)
    .eq('id', participantId)
    .maybeSingle();

  if (fetchError || !participant) {
    if (logger) {
      logger.error({ error: fetchError?.message, participant_id: participantId }, 'Participant not found for archive');
    }
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  // Проверяем, не архивирован ли уже
  if (participant.participant_status === 'excluded') {
    return NextResponse.json({ error: 'Participant is already archived' }, { status: 400 });
  }

  const canonicalId = participant.merged_into || participant.id;

  // Обновляем статус
  const { error: updateError } = await supabase
    .from('participants')
    .update({
      participant_status: 'excluded',
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', canonicalId);

  if (updateError) {
    if (logger) {
      logger.error({ error: updateError.message, participant_id: participantId }, 'Error archiving participant');
    }
    return NextResponse.json({ error: 'Failed to archive participant' }, { status: 500 });
  }

  // Логируем действие администратора
  await logAdminAction({
    orgId,
    userId: actorId,
    action: AdminActions.DELETE_PARTICIPANT, // Используем существующий action для аудита
    resourceType: ResourceTypes.PARTICIPANT,
    resourceId: canonicalId,
    metadata: {
      participant_name: participant.full_name,
      action_type: 'archive',
      previous_status: participant.participant_status
    }
  });

  if (logger) {
    logger.info({ 
      participant_id: canonicalId, 
      participant_name: participant.full_name 
    }, 'Participant archived');
  }

  return NextResponse.json({ 
    success: true, 
    message: 'Participant archived successfully',
    participant_id: canonicalId
  });
}

/**
 * Восстановление участника из архива
 * Возвращает participant_status к 'participant' и очищает deleted_at
 */
async function handleRestoreParticipant(
  supabase: SupabaseClient,
  actorId: string,
  orgId: string,
  participantId: string,
  logger?: ReturnType<typeof createAPILogger>
): Promise<NextResponse> {
  // Получаем участника
  const { data: participant, error: fetchError } = await supabase
    .from('participants')
    .select('id, full_name, participant_status, merged_into')
    .eq('org_id', orgId)
    .eq('id', participantId)
    .maybeSingle();

  if (fetchError || !participant) {
    if (logger) {
      logger.error({ error: fetchError?.message, participant_id: participantId }, 'Participant not found for restore');
    }
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  // Проверяем, архивирован ли участник
  if (participant.participant_status !== 'excluded') {
    return NextResponse.json({ error: 'Participant is not archived' }, { status: 400 });
  }

  const canonicalId = participant.merged_into || participant.id;

  // Восстанавливаем статус
  const { error: updateError } = await supabase
    .from('participants')
    .update({
      participant_status: 'participant',
      deleted_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', canonicalId);

  if (updateError) {
    if (logger) {
      logger.error({ error: updateError.message, participant_id: participantId }, 'Error restoring participant');
    }
    return NextResponse.json({ error: 'Failed to restore participant' }, { status: 500 });
  }

  // Логируем действие администратора
  await logAdminAction({
    orgId,
    userId: actorId,
    action: AdminActions.UPDATE_PARTICIPANT,
    resourceType: ResourceTypes.PARTICIPANT,
    resourceId: canonicalId,
    metadata: {
      participant_name: participant.full_name,
      action_type: 'restore',
      previous_status: 'excluded'
    }
  });

  if (logger) {
    logger.info({ 
      participant_id: canonicalId, 
      participant_name: participant.full_name 
    }, 'Participant restored from archive');
  }

  // Получаем обновлённые данные участника
  const detail = await getParticipantDetail(orgId, canonicalId);

  return NextResponse.json({ 
    success: true, 
    message: 'Participant restored successfully',
    participant_id: canonicalId,
    detail
  });
}
