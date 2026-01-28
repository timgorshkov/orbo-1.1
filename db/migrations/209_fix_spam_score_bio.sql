-- ============================================
-- Fix: Don't penalize for empty_bio if bio wasn't provided
-- (Telegram WebApp doesn't expose bio field)
-- ============================================

-- Drop existing function first (signature changed - added default values)
DROP FUNCTION IF EXISTS create_application(uuid, uuid, bigint, bigint, jsonb, jsonb, text, jsonb);

CREATE OR REPLACE FUNCTION create_application(
  p_org_id UUID,
  p_form_id UUID,
  p_tg_user_id BIGINT,
  p_tg_chat_id BIGINT DEFAULT NULL,
  p_tg_user_data JSONB DEFAULT '{}'::jsonb,
  p_form_data JSONB DEFAULT '{}'::jsonb,
  p_source_code TEXT DEFAULT NULL,
  p_utm_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application_id UUID;
  v_participant_id UUID;
  v_pipeline_id UUID;
  v_initial_stage_id UUID;
  v_source_id UUID;
  v_spam_score INT := 0;
  v_spam_reasons TEXT[] := '{}';
  v_form_settings JSONB;
  v_has_form_data BOOLEAN;
BEGIN
  -- Получить форму и её настройки
  SELECT pipeline_id, settings INTO v_pipeline_id, v_form_settings
  FROM application_forms
  WHERE id = p_form_id;
  
  IF v_pipeline_id IS NULL THEN
    RAISE EXCEPTION 'Form not found';
  END IF;
  
  -- Получить начальный этап воронки
  SELECT id INTO v_initial_stage_id
  FROM pipeline_stages
  WHERE pipeline_id = v_pipeline_id
  ORDER BY position ASC
  LIMIT 1;
  
  IF v_initial_stage_id IS NULL THEN
    RAISE EXCEPTION 'Pipeline has no stages';
  END IF;
  
  -- Найти или создать participant
  SELECT id INTO v_participant_id
  FROM participants
  WHERE org_id = p_org_id AND tg_user_id = p_tg_user_id;
  
  IF v_participant_id IS NULL THEN
    INSERT INTO participants (org_id, tg_user_id, first_name, last_name, username, photo_url)
    VALUES (
      p_org_id,
      p_tg_user_id,
      COALESCE(p_tg_user_data->>'first_name', ''),
      p_tg_user_data->>'last_name',
      p_tg_user_data->>'username',
      p_tg_user_data->>'photo_url'
    )
    RETURNING id INTO v_participant_id;
  END IF;
  
  -- Получить source_id если передан код
  IF p_source_code IS NOT NULL THEN
    SELECT id INTO v_source_id
    FROM application_sources
    WHERE code = p_source_code AND form_id = p_form_id;
  END IF;
  
  -- Spam detection
  IF COALESCE((v_form_settings->'spam_detection'->>'enabled')::boolean, true) THEN
    -- Нет фото - ONLY check if photo_url field was actually provided in request
    -- (join_request webhook doesn't provide photo_url, so we shouldn't penalize)
    IF p_tg_user_data ? 'photo_url' AND (p_tg_user_data->>'photo_url' IS NULL OR p_tg_user_data->>'photo_url' = '') THEN
      v_spam_score := v_spam_score + COALESCE((v_form_settings->'spam_detection'->'checks'->>'no_photo')::int, 30);
      v_spam_reasons := array_append(v_spam_reasons, 'no_photo');
    END IF;
    
    -- Нет username
    IF p_tg_user_data->>'username' IS NULL OR p_tg_user_data->>'username' = '' THEN
      v_spam_score := v_spam_score + COALESCE((v_form_settings->'spam_detection'->'checks'->>'no_username')::int, 20);
      v_spam_reasons := array_append(v_spam_reasons, 'no_username');
    END IF;
    
    -- Пустой bio - ONLY check if bio field was actually provided in request
    -- (Telegram WebApp doesn't expose bio, so we shouldn't penalize for missing data)
    IF p_tg_user_data ? 'bio' AND (p_tg_user_data->>'bio' IS NULL OR p_tg_user_data->>'bio' = '') THEN
      v_spam_score := v_spam_score + COALESCE((v_form_settings->'spam_detection'->'checks'->>'empty_bio')::int, 15);
      v_spam_reasons := array_append(v_spam_reasons, 'empty_bio');
    END IF;
    
    -- Уже забанен в другой группе орги
    IF EXISTS (
      SELECT 1 FROM participant_bans pb
      WHERE pb.participant_id = v_participant_id AND pb.org_id = p_org_id
    ) THEN
      v_spam_score := v_spam_score + COALESCE((v_form_settings->'spam_detection'->'checks'->>'already_banned')::int, 100);
      v_spam_reasons := array_append(v_spam_reasons, 'already_banned');
    END IF;
  END IF;
  
  -- Проверить, есть ли данные формы
  v_has_form_data := p_form_data IS NOT NULL 
    AND p_form_data != '{}'::jsonb 
    AND jsonb_typeof(p_form_data) = 'object'
    AND (SELECT COUNT(*) FROM jsonb_object_keys(p_form_data)) > 0;
  
  -- Создать заявку
  -- Note: pipeline_id is derived from form_id -> application_forms.pipeline_id
  -- The applications table does NOT have pipeline_id column
  INSERT INTO applications (
    org_id,
    form_id,
    participant_id,
    stage_id,
    tg_user_id,
    tg_chat_id,
    tg_user_data,
    form_data,
    form_filled_at,
    spam_score,
    spam_reasons,
    source_id,
    utm_data
  )
  VALUES (
    p_org_id,
    p_form_id,
    v_participant_id,
    v_initial_stage_id,
    p_tg_user_id,
    p_tg_chat_id,
    p_tg_user_data,
    p_form_data,
    CASE WHEN v_has_form_data THEN now() ELSE NULL END,
    v_spam_score,
    v_spam_reasons,
    v_source_id,
    CASE 
      WHEN v_source_id IS NOT NULL THEN (
        SELECT jsonb_build_object(
          'utm_source', s.utm_source,
          'utm_medium', s.utm_medium,
          'utm_campaign', s.utm_campaign,
          'utm_term', s.utm_term,
          'utm_content', s.utm_content,
          'ref_code', s.ref_code
        )
        FROM application_sources s WHERE s.id = v_source_id
      )
      ELSE p_utm_data
    END
  )
  RETURNING id INTO v_application_id;
  
  -- Записать событие создания
  INSERT INTO application_events (application_id, event_type, actor_type, data)
  VALUES (
    v_application_id,
    'created',
    'system',
    jsonb_build_object(
      'spam_score', v_spam_score,
      'spam_reasons', v_spam_reasons,
      'has_form_data', v_has_form_data,
      'source_code', p_source_code
    )
  );
  
  -- Инкремент счётчика источника
  IF v_source_id IS NOT NULL THEN
    UPDATE application_sources 
    SET clicks_count = clicks_count + 1
    WHERE id = v_source_id;
  END IF;
  
  RETURN v_application_id;
END;
$$;

-- Также нужна функция для подтягивания bio при обработке join_request
-- Bio доступен в join_request webhook через Telegram Bot API
COMMENT ON FUNCTION create_application IS 
'Creates application from MiniApp or join_request. 
Note: empty_bio check only triggers if bio field is explicitly provided in tg_user_data.
Telegram WebApp does not expose bio, so MiniApp applications wont be penalized for this.
Join requests through webhook DO have bio available.';
