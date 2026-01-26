-- ============================================
-- RPC Functions for Applications System
-- ============================================

-- ============================================
-- 1. Создание заявки (из webhook или MiniApp)
-- ============================================
CREATE OR REPLACE FUNCTION create_application(
  p_org_id UUID,
  p_form_id UUID,
  p_tg_user_id BIGINT DEFAULT NULL,
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
  v_initial_stage_id UUID;
  v_source_id UUID;
  v_spam_score INT := 0;
  v_spam_reasons TEXT[] := '{}';
  v_form_settings JSONB;
  v_has_form_data BOOLEAN;
BEGIN
  -- Получить форму и её настройки
  SELECT settings INTO v_form_settings
  FROM application_forms
  WHERE id = p_form_id AND org_id = p_org_id AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Form not found or inactive';
  END IF;
  
  -- Найти начальный статус воронки
  SELECT ps.id INTO v_initial_stage_id
  FROM pipeline_stages ps
  JOIN application_forms af ON af.pipeline_id = ps.pipeline_id
  WHERE af.id = p_form_id AND ps.is_initial = true
  LIMIT 1;
  
  IF v_initial_stage_id IS NULL THEN
    RAISE EXCEPTION 'No initial stage found for pipeline';
  END IF;
  
  -- Найти или создать участника по tg_user_id
  IF p_tg_user_id IS NOT NULL THEN
    SELECT id INTO v_participant_id
    FROM participants
    WHERE org_id = p_org_id AND tg_user_id = p_tg_user_id
    LIMIT 1;
    
    IF v_participant_id IS NULL THEN
      INSERT INTO participants (org_id, tg_user_id, username, full_name)
      VALUES (
        p_org_id,
        p_tg_user_id,
        p_tg_user_data->>'username',
        COALESCE(
          NULLIF(CONCAT_WS(' ', p_tg_user_data->>'first_name', p_tg_user_data->>'last_name'), ''),
          p_tg_user_data->>'username',
          'User ' || p_tg_user_id::text
        )
      )
      RETURNING id INTO v_participant_id;
    END IF;
  END IF;
  
  -- Найти источник по коду
  IF p_source_code IS NOT NULL THEN
    SELECT id INTO v_source_id
    FROM application_sources
    WHERE code = p_source_code;
  END IF;
  
  -- Рассчитать spam score
  IF (v_form_settings->'spam_detection'->>'enabled')::boolean = true THEN
    -- Нет фото
    IF p_tg_user_data->>'photo_url' IS NULL OR p_tg_user_data->>'photo_url' = '' THEN
      v_spam_score := v_spam_score + COALESCE((v_form_settings->'spam_detection'->'checks'->>'no_photo')::int, 30);
      v_spam_reasons := array_append(v_spam_reasons, 'no_photo');
    END IF;
    
    -- Нет username
    IF p_tg_user_data->>'username' IS NULL OR p_tg_user_data->>'username' = '' THEN
      v_spam_score := v_spam_score + COALESCE((v_form_settings->'spam_detection'->'checks'->>'no_username')::int, 20);
      v_spam_reasons := array_append(v_spam_reasons, 'no_username');
    END IF;
    
    -- Пустой bio
    IF p_tg_user_data->>'bio' IS NULL OR p_tg_user_data->>'bio' = '' THEN
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
  v_has_form_data := p_form_data IS NOT NULL AND p_form_data != '{}'::jsonb AND p_form_data != '[]'::jsonb;
  
  -- Создать заявку
  INSERT INTO applications (
    org_id,
    form_id,
    stage_id,
    participant_id,
    tg_user_id,
    tg_chat_id,
    tg_join_request_date,
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
    v_initial_stage_id,
    v_participant_id,
    p_tg_user_id,
    p_tg_chat_id,
    CASE WHEN p_tg_chat_id IS NOT NULL THEN now() ELSE NULL END,
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
  
  -- Если данные формы уже заполнены, записать событие
  IF v_has_form_data THEN
    INSERT INTO application_events (application_id, event_type, actor_type, data)
    VALUES (v_application_id, 'form_filled', 'system', p_form_data);
  END IF;
  
  RETURN v_application_id;
END;
$$;

-- ============================================
-- 2. Обновление статуса заявки (перемещение по воронке)
-- ============================================
CREATE OR REPLACE FUNCTION move_application_to_stage(
  p_application_id UUID,
  p_new_stage_id UUID,
  p_actor_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app applications%ROWTYPE;
  v_old_stage pipeline_stages%ROWTYPE;
  v_new_stage pipeline_stages%ROWTYPE;
  v_result JSONB;
BEGIN
  -- Получить заявку
  SELECT * INTO v_app FROM applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found');
  END IF;
  
  -- Получить старый и новый статусы
  SELECT * INTO v_old_stage FROM pipeline_stages WHERE id = v_app.stage_id;
  SELECT * INTO v_new_stage FROM pipeline_stages WHERE id = p_new_stage_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stage not found');
  END IF;
  
  -- Проверить, что старый статус не терминальный
  IF v_old_stage.is_terminal THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot move from terminal stage');
  END IF;
  
  -- Обновить заявку
  UPDATE applications
  SET 
    stage_id = p_new_stage_id,
    processed_by = COALESCE(p_actor_id, processed_by),
    processed_at = CASE WHEN v_new_stage.is_terminal THEN now() ELSE processed_at END,
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_application_id;
  
  -- Записать событие
  INSERT INTO application_events (application_id, event_type, actor_type, actor_id, data)
  VALUES (
    p_application_id,
    'stage_changed',
    CASE WHEN p_actor_id IS NOT NULL THEN 'user' ELSE 'system' END,
    p_actor_id,
    jsonb_build_object(
      'from_stage_id', v_app.stage_id,
      'from_stage_name', v_old_stage.name,
      'to_stage_id', p_new_stage_id,
      'to_stage_name', v_new_stage.name,
      'is_terminal', v_new_stage.is_terminal,
      'terminal_type', v_new_stage.terminal_type
    )
  );
  
  -- Записать событие approved/rejected если терминальный
  IF v_new_stage.is_terminal THEN
    INSERT INTO application_events (application_id, event_type, actor_type, actor_id)
    VALUES (
      p_application_id,
      CASE WHEN v_new_stage.terminal_type = 'success' THEN 'approved' ELSE 'rejected' END,
      CASE WHEN p_actor_id IS NOT NULL THEN 'user' ELSE 'system' END,
      p_actor_id
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'application_id', p_application_id,
    'new_stage_id', p_new_stage_id,
    'is_terminal', v_new_stage.is_terminal,
    'terminal_type', v_new_stage.terminal_type,
    'auto_actions', v_new_stage.auto_actions
  );
END;
$$;

-- ============================================
-- 3. Получение заявок для воронки (с фильтрами)
-- ============================================
CREATE OR REPLACE FUNCTION get_pipeline_applications(
  p_pipeline_id UUID,
  p_stage_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  form_id UUID,
  stage_id UUID,
  stage_name TEXT,
  stage_color TEXT,
  participant_id UUID,
  tg_user_id BIGINT,
  tg_user_data JSONB,
  form_data JSONB,
  form_filled_at TIMESTAMPTZ,
  spam_score INT,
  spam_reasons TEXT[],
  utm_data JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  -- Participant info
  participant_username TEXT,
  participant_full_name TEXT,
  participant_photo_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.form_id,
    a.stage_id,
    ps.name as stage_name,
    ps.color as stage_color,
    a.participant_id,
    a.tg_user_id,
    a.tg_user_data,
    a.form_data,
    a.form_filled_at,
    a.spam_score,
    a.spam_reasons,
    a.utm_data,
    a.created_at,
    a.updated_at,
    p.username as participant_username,
    p.full_name as participant_full_name,
    p.photo_url as participant_photo_url
  FROM applications a
  JOIN application_forms af ON af.id = a.form_id
  JOIN pipeline_stages ps ON ps.id = a.stage_id
  LEFT JOIN participants p ON p.id = a.participant_id
  WHERE af.pipeline_id = p_pipeline_id
    AND (p_stage_id IS NULL OR a.stage_id = p_stage_id)
  ORDER BY a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ============================================
-- 4. Получение статистики воронки
-- ============================================
CREATE OR REPLACE FUNCTION get_pipeline_stats(p_pipeline_id UUID)
RETURNS TABLE (
  stage_id UUID,
  stage_name TEXT,
  stage_color TEXT,
  stage_position INT,
  is_terminal BOOLEAN,
  terminal_type TEXT,
  applications_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ps.id as stage_id,
    ps.name as stage_name,
    ps.color as stage_color,
    ps.position as stage_position,
    ps.is_terminal,
    ps.terminal_type,
    COUNT(a.id) as applications_count
  FROM pipeline_stages ps
  LEFT JOIN applications a ON a.stage_id = ps.id
  WHERE ps.pipeline_id = p_pipeline_id
  GROUP BY ps.id, ps.name, ps.color, ps.position, ps.is_terminal, ps.terminal_type
  ORDER BY ps.position;
END;
$$;

-- ============================================
-- 5. Получение формы по ID (для MiniApp)
-- ============================================
CREATE OR REPLACE FUNCTION get_application_form_public(
  p_form_id UUID,
  p_source_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form application_forms%ROWTYPE;
  v_org organizations%ROWTYPE;
  v_source application_sources%ROWTYPE;
  v_pipeline application_pipelines%ROWTYPE;
  v_member_count BIGINT;
BEGIN
  -- Получить форму
  SELECT * INTO v_form
  FROM application_forms
  WHERE id = p_form_id AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Form not found');
  END IF;
  
  -- Получить организацию
  SELECT * INTO v_org
  FROM organizations
  WHERE id = v_form.org_id;
  
  -- Получить воронку
  SELECT * INTO v_pipeline
  FROM application_pipelines
  WHERE id = v_form.pipeline_id;
  
  -- Получить источник
  IF p_source_code IS NOT NULL THEN
    SELECT * INTO v_source
    FROM application_sources
    WHERE code = p_source_code AND form_id = p_form_id;
  END IF;
  
  -- Получить количество участников (если нужно показывать)
  IF (v_form.landing->>'show_member_count')::boolean = true THEN
    SELECT COUNT(*) INTO v_member_count
    FROM participants
    WHERE org_id = v_form.org_id;
  END IF;
  
  RETURN jsonb_build_object(
    'form_id', v_form.id,
    'org_id', v_form.org_id,
    'org_name', v_org.name,
    'org_logo', v_org.logo_url,
    'pipeline_type', v_pipeline.pipeline_type,
    'landing', v_form.landing,
    'form_schema', v_form.form_schema,
    'success_page', v_form.success_page,
    'member_count', v_member_count,
    'source_id', v_source.id,
    'utm_source', v_source.utm_source,
    'utm_campaign', v_source.utm_campaign
  );
END;
$$;

-- ============================================
-- 6. Создание/обновление источника (UTM)
-- ============================================
CREATE OR REPLACE FUNCTION upsert_application_source(
  p_form_id UUID,
  p_utm_source TEXT DEFAULT NULL,
  p_utm_medium TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL,
  p_utm_term TEXT DEFAULT NULL,
  p_utm_content TEXT DEFAULT NULL,
  p_ref_code TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL
)
RETURNS TEXT  -- Возвращает code
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_existing_code TEXT;
BEGIN
  -- Проверить, есть ли уже такой источник
  SELECT code INTO v_existing_code
  FROM application_sources
  WHERE form_id = p_form_id
    AND COALESCE(utm_source, '') = COALESCE(p_utm_source, '')
    AND COALESCE(utm_medium, '') = COALESCE(p_utm_medium, '')
    AND COALESCE(utm_campaign, '') = COALESCE(p_utm_campaign, '')
    AND COALESCE(utm_term, '') = COALESCE(p_utm_term, '')
    AND COALESCE(utm_content, '') = COALESCE(p_utm_content, '')
    AND COALESCE(ref_code, '') = COALESCE(p_ref_code, '');
  
  IF v_existing_code IS NOT NULL THEN
    RETURN v_existing_code;
  END IF;
  
  -- Генерировать уникальный код (6 символов)
  LOOP
    v_code := lower(substring(md5(random()::text) from 1 for 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM application_sources WHERE code = v_code);
  END LOOP;
  
  -- Создать источник
  INSERT INTO application_sources (
    form_id, code, utm_source, utm_medium, utm_campaign, utm_term, utm_content, ref_code, name
  )
  VALUES (
    p_form_id, v_code, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_term, p_utm_content, p_ref_code,
    COALESCE(p_name, CONCAT_WS(' - ', p_utm_source, p_utm_campaign))
  );
  
  RETURN v_code;
END;
$$;

-- ============================================
-- 7. Заполнение анкеты (из MiniApp)
-- ============================================
CREATE OR REPLACE FUNCTION submit_application_form(
  p_application_id UUID,
  p_form_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app applications%ROWTYPE;
BEGIN
  -- Получить заявку
  SELECT * INTO v_app FROM applications WHERE id = p_application_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found');
  END IF;
  
  -- Проверить, что анкета ещё не заполнена
  IF v_app.form_filled_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Form already filled');
  END IF;
  
  -- Обновить заявку
  UPDATE applications
  SET 
    form_data = p_form_data,
    form_filled_at = now(),
    updated_at = now()
  WHERE id = p_application_id;
  
  -- Записать событие
  INSERT INTO application_events (application_id, event_type, actor_type, data)
  VALUES (p_application_id, 'form_filled', 'system', p_form_data);
  
  -- Обновить участника данными из формы (если есть)
  IF v_app.participant_id IS NOT NULL THEN
    UPDATE participants
    SET 
      full_name = COALESCE(p_form_data->>'name', full_name),
      email = COALESCE(p_form_data->>'email', email),
      phone = COALESCE(p_form_data->>'phone', phone),
      bio = COALESCE(p_form_data->>'goal', p_form_data->>'about', bio)
    WHERE id = v_app.participant_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'application_id', p_application_id
  );
END;
$$;

-- ============================================
-- 8. Создание воронки с дефолтными статусами
-- ============================================
CREATE OR REPLACE FUNCTION create_pipeline_with_default_stages(
  p_org_id UUID,
  p_name TEXT,
  p_pipeline_type TEXT,
  p_telegram_group_id BIGINT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id UUID;
BEGIN
  -- Создать воронку
  INSERT INTO application_pipelines (org_id, name, pipeline_type, telegram_group_id, created_by)
  VALUES (p_org_id, p_name, p_pipeline_type, p_telegram_group_id, p_created_by)
  RETURNING id INTO v_pipeline_id;
  
  -- Создать дефолтные статусы в зависимости от типа
  IF p_pipeline_type = 'join_request' THEN
    INSERT INTO pipeline_stages (pipeline_id, name, slug, color, position, is_initial, is_terminal, terminal_type, auto_actions) VALUES
      (v_pipeline_id, 'Новая', 'new', '#6B7280', 1, true, false, NULL, '{}'),
      (v_pipeline_id, 'Ожидает анкету', 'pending_form', '#F59E0B', 2, false, false, NULL, '{}'),
      (v_pipeline_id, 'На рассмотрении', 'review', '#3B82F6', 3, false, false, NULL, '{}'),
      (v_pipeline_id, 'Одобрено', 'approved', '#10B981', 4, false, true, 'success', '{"approve_telegram": true}'),
      (v_pipeline_id, 'Отклонено', 'rejected', '#EF4444', 5, false, true, 'failure', '{"reject_telegram": true}'),
      (v_pipeline_id, 'Спам', 'spam', '#7C3AED', 6, false, true, 'failure', '{"ban_telegram": true}');
  ELSIF p_pipeline_type = 'service' THEN
    INSERT INTO pipeline_stages (pipeline_id, name, slug, color, position, is_initial, is_terminal, terminal_type) VALUES
      (v_pipeline_id, 'Новая', 'new', '#6B7280', 1, true, false, NULL),
      (v_pipeline_id, 'В работе', 'in_progress', '#3B82F6', 2, false, false, NULL),
      (v_pipeline_id, 'Ожидает ответа', 'waiting', '#F59E0B', 3, false, false, NULL),
      (v_pipeline_id, 'Завершено', 'completed', '#10B981', 4, false, true, 'success'),
      (v_pipeline_id, 'Отменено', 'cancelled', '#EF4444', 5, false, true, 'failure');
  ELSE
    -- Кастомный тип - минимальные статусы
    INSERT INTO pipeline_stages (pipeline_id, name, slug, color, position, is_initial, is_terminal, terminal_type) VALUES
      (v_pipeline_id, 'Новая', 'new', '#6B7280', 1, true, false, NULL),
      (v_pipeline_id, 'Завершено', 'completed', '#10B981', 2, false, true, 'success'),
      (v_pipeline_id, 'Отменено', 'cancelled', '#EF4444', 3, false, true, 'failure');
  END IF;
  
  RETURN v_pipeline_id;
END;
$$;

-- ============================================
-- Grants
-- ============================================
GRANT EXECUTE ON FUNCTION create_application TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION move_application_to_stage TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_pipeline_applications TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_pipeline_stats TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_application_form_public TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION upsert_application_source TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION submit_application_form TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION create_pipeline_with_default_stages TO authenticated, service_role;

