import { NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { getParticipantDetail } from '@/lib/server/getParticipantDetail';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logParticipantAudit } from '@/lib/server/participants/audit';

async function ensureOrgAccess(orgId: string) {
  const supabase = await createClientServer();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
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
    console.error('Membership check error:', membershipError);
    return { user: null, error: NextResponse.json({ error: 'Failed to verify membership' }, { status: 500 }) };
  }

  if (!membership) {
    return { user: null, error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }

  return { user, adminClient };
}

export async function GET(request: Request, { params }: { params: Promise<{ participantId: string }> }) {
  try {
    const { participantId } = await params
    const url = new URL(request.url);
    const orgId = url.searchParams.get('orgId');

    if (!orgId || !participantId) {
      return NextResponse.json({ error: 'Missing orgId or participantId' }, { status: 400 });
    }

    const { error } = await ensureOrgAccess(orgId);
    if (error) return error;

    const detail = await getParticipantDetail(orgId, participantId);

    if (!detail) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error: any) {
    console.error('Error in participant GET:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ participantId: string }> }) {
  try {
    const { participantId } = await params
    const payload = await request.json();
    const orgId = payload?.orgId;

    if (!orgId || !participantId) {
      return NextResponse.json({ error: 'Missing orgId or participantId' }, { status: 400 });
    }

    const { adminClient, user, error } = await ensureOrgAccess(orgId);
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
    console.log('PUT /api/participants/[participantId]', {
      participantId,
      canonicalId,
      updatePayload,
      hasCustomAttributes: 'custom_attributes' in updatePayload,
      customAttributesValue: updatePayload.custom_attributes
    });

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
      console.error('Error updating participant:', updateError);
      return NextResponse.json({ error: 'Failed to update participant' }, { status: 500 });
    }

    console.log('Participant updated successfully:', {
      canonicalId,
      updatedCustomAttributes: updatedParticipant?.custom_attributes
    });

  try {
    await logParticipantAudit({
      orgId,
      participantId: canonicalId,
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
      action: 'update',
      fieldChanges: updatePayload
    });
  } catch (auditError) {
    console.error('Failed to log participant update audit:', auditError);
  }

    const detail = await getParticipantDetail(orgId, participantId);

    return NextResponse.json({ success: true, participant: updatedParticipant, detail });
  } catch (error: any) {
    console.error('Error in participant PUT:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ participantId: string }> }) {
  try {
    const { participantId } = await params
    const payload = await request.json();
    const orgId = payload?.orgId;

    if (!orgId || !participantId) {
      return NextResponse.json({ error: 'Missing orgId or participantId' }, { status: 400 });
    }

    const { adminClient, user, error } = await ensureOrgAccess(orgId);
    if (error) return error;
    if (!adminClient || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action } = payload || {};

    switch (action) {
      case 'addTrait':
        return handleAddTrait(adminClient, user.id, orgId, participantId, payload);
      case 'removeTrait':
        return handleRemoveTrait(adminClient, orgId, participantId, payload);
      case 'mergeDuplicates':
        return handleMergeParticipants(adminClient, user.id, orgId, participantId, payload);
      default:
        return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error in participant PATCH:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

async function handleAddTrait(supabase: SupabaseClient, actorId: string, orgId: string, participantId: string, payload: any) {
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
    console.error('Error upserting participant trait:', traitError);
    return NextResponse.json({ error: 'Failed to upsert trait' }, { status: 500 });
  }

  const detail = await getParticipantDetail(orgId, participantId);

  return NextResponse.json({ success: true, trait, detail });
}

async function handleRemoveTrait(supabase: SupabaseClient, orgId: string, participantId: string, payload: any) {
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
    console.error('Error deleting participant trait:', deleteError);
    return NextResponse.json({ error: 'Failed to delete trait' }, { status: 500 });
  }

  const detail = await getParticipantDetail(orgId, participantId);

  return NextResponse.json({ success: true, detail });
}

async function handleMergeParticipants(supabase: SupabaseClient, actorId: string, orgId: string, participantId: string, payload: any) {
  const { duplicates, targetId, duplicateId } = payload || {};

  // ✅ Новая логика: participantId = canonical (target), duplicateId = source
  if (duplicateId && typeof duplicateId === 'string') {
    return mergeFromDuplicate(supabase, actorId, orgId, participantId, duplicateId);
  }

  // ✅ Старая логика для обратной совместимости (если передан targetId)
  if (targetId && typeof targetId === 'string') {
    // Если targetId === participantId, значит это новая логика
    if (targetId === participantId) {
      return NextResponse.json({ error: 'Cannot merge participant into itself' }, { status: 400 });
    }
    // Иначе используем старую логику (participantId объединяется в targetId)
    return mergeIntoTarget(supabase, actorId, orgId, participantId, targetId);
  }

  const duplicateList = Array.isArray(duplicates) ? duplicates : [];
  if (duplicateList.length === 0) {
    return NextResponse.json({ error: 'No duplicates provided' }, { status: 400 });
  }

  return mergeIntoTarget(supabase, actorId, orgId, participantId, duplicateList[0]);
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
  duplicateId: string
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
    console.error('Current participant (target) not found:', participantId, participantError);
    return NextResponse.json({ error: 'Current participant not found' }, { status: 404 });
  }

  const canonicalId = participantRecord.merged_into || participantRecord.id;
  
  console.log('Merge from duplicate - Current participant (TARGET):', {
    id: participantId,
    merged_into: participantRecord.merged_into,
    status: participantRecord.status,
    canonicalId
  });

  // Проверяем выбранный дубликат (source)
  const { data: duplicateRecord, error: duplicateError } = await supabase
    .from('participants')
    .select('id, merged_into, status')
    .eq('org_id', orgId)
    .eq('id', duplicateId)
    .maybeSingle();

  if (duplicateError || !duplicateRecord) {
    console.error('Duplicate (source) not found:', duplicateId, duplicateError);
    return NextResponse.json({ error: 'Duplicate participant not found' }, { status: 404 });
  }

  const duplicateCanonical = duplicateRecord.merged_into || duplicateRecord.id;
  
  console.log('Merge from duplicate - Selected duplicate (SOURCE):', {
    id: duplicateId,
    merged_into: duplicateRecord.merged_into,
    status: duplicateRecord.status,
    duplicateCanonical
  });

  // Проверка: нельзя объединить сам с собой
  if (canonicalId === duplicateCanonical) {
    console.error('Cannot merge participant with itself:', { canonicalId, duplicateCanonical });
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
  console.log('Executing merge_participants_smart:', {
    target: canonicalId,
    duplicates: [duplicateCanonical],
    actor: actorId
  });

  const { data: mergeResult, error: mergeError } = await supabase
    .rpc('merge_participants_smart', {
      p_target: canonicalId, // ✅ Текущий открытый профиль
      p_duplicates: [duplicateCanonical], // ✅ Выбранный дубликат
      p_actor: actorId
    });

  if (mergeError) {
    console.error('Error merging participants (trying fallback):', mergeError);
    
    // Если новая функция недоступна, используем старую
    const { error: fallbackError } = await supabase
      .rpc('merge_participants_extended', {
        p_target: canonicalId,
        p_duplicates: [duplicateCanonical],
        p_actor: actorId
      });
    
    if (fallbackError) {
      console.error('Error merging participants (fallback):', fallbackError);
      return NextResponse.json({ error: 'Failed to merge participants' }, { status: 500 });
    }
  }
  
  // Логируем результаты объединения
  if (mergeResult) {
    console.log('Merge result:', mergeResult);
    
    if (mergeResult.conflicts && mergeResult.conflicts.length > 0) {
      console.log('Conflicts detected:', mergeResult.conflicts);
    }
    
    if (mergeResult.merged_fields && mergeResult.merged_fields.length > 0) {
      console.log('Fields merged:', mergeResult.merged_fields);
    }
  }

  try {
    await logParticipantAudit({
      orgId,
      participantId: canonicalId,
      actorId,
      actorType: 'user',
      source: 'manual',
      action: 'merge',
      fieldChanges: {
        merged: duplicateCanonical,
        into: canonicalId
      }
    });
  } catch (auditError) {
    console.error('Failed to log participant merge audit:', auditError);
  }

  const detail = await getParticipantDetail(orgId, canonicalId);

  return NextResponse.json({ 
    success: true, 
    detail, 
    merged_into: canonicalId, // ✅ Возвращаем ID текущего (canonical) профиля
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
  targetId: string
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
    console.error('Participant not found:', participantId, participantError);
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  const canonicalId = participantRecord.merged_into || participantRecord.id;
  
  console.log('Merge check - Current participant:', {
    id: participantId,
    merged_into: participantRecord.merged_into,
    status: participantRecord.status,
    canonicalId
  });

  if (canonicalId === targetId) {
    console.error('Cannot merge into itself:', { canonicalId, targetId });
    return NextResponse.json({ error: 'Cannot merge participant into itself' }, { status: 400 });
  }

  const { data: targetRecord, error: targetError } = await supabase
    .from('participants')
    .select('id, merged_into, status')
    .eq('org_id', orgId)
    .eq('id', targetId)
    .maybeSingle();

  if (targetError || !targetRecord) {
    console.error('Target not found:', targetId, targetError);
    return NextResponse.json({ error: 'Selected participant not found' }, { status: 404 });
  }

  const targetCanonical = targetRecord.merged_into || targetRecord.id;
  
  console.log('Merge check - Target participant:', {
    id: targetId,
    merged_into: targetRecord.merged_into,
    status: targetRecord.status,
    targetCanonical
  });

  if (targetCanonical === canonicalId) {
    console.error('Participants already share canonical record:', {
      participantId,
      targetId,
      canonicalId,
      targetCanonical,
      participantMergedInto: participantRecord.merged_into,
      targetMergedInto: targetRecord.merged_into
    });
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
    console.error('Error merging participants (trying fallback):', mergeError);
    
    // Если новая функция недоступна, используем старую
    const { error: fallbackError } = await supabase
      .rpc('merge_participants_extended', {
        p_target: targetCanonical,
        p_duplicates: [canonicalId],
        p_actor: actorId
      });
    
    if (fallbackError) {
      console.error('Error merging participants (fallback):', fallbackError);
      return NextResponse.json({ error: 'Failed to merge participants' }, { status: 500 });
    }
  }
  
  // Логируем результаты объединения
  if (mergeResult) {
    console.log('Merge result:', mergeResult);
    
    if (mergeResult.conflicts && mergeResult.conflicts.length > 0) {
      console.log('Conflicts detected:', mergeResult.conflicts);
    }
    
    if (mergeResult.merged_fields && mergeResult.merged_fields.length > 0) {
      console.log('Fields merged:', mergeResult.merged_fields);
    }
  }

  try {
    await logParticipantAudit({
      orgId,
      participantId: targetCanonical,
      actorId,
      actorType: 'user',
      source: 'manual',
      action: 'merge',
      fieldChanges: {
        merged: canonicalId,
        into: targetCanonical
      }
    });
  } catch (auditError) {
    console.error('Failed to log participant merge audit:', auditError);
  }

  const detail = await getParticipantDetail(orgId, targetCanonical);

  return NextResponse.json({ 
    success: true, 
    detail, 
    merged_into: targetCanonical,
    merge_result: mergeResult || null
  });
}
