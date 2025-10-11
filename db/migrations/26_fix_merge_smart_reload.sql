-- Исправление функции merge_participants_smart: перезагрузка target record после каждого дубликата
-- Версия: 26

-- Удаляем старую функцию
DROP FUNCTION IF EXISTS public.merge_participants_smart(uuid, uuid[], uuid);

-- Создаем исправленную функцию объединения
CREATE OR REPLACE FUNCTION public.merge_participants_smart(
  p_target uuid,
  p_duplicates uuid[],
  p_actor uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_duplicate uuid;
  v_target_record record;
  v_duplicate_record record;
  v_field_name text;
  v_target_value text;
  v_duplicate_value text;
  v_trait_key text;
  v_trait_counter integer;
  v_merged_fields jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
BEGIN
  IF array_length(p_duplicates, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'merged_fields', v_merged_fields,
      'conflicts', v_conflicts
    );
  END IF;

  -- Обрабатываем каждого дубликата
  FOREACH v_duplicate IN ARRAY p_duplicates
  LOOP
    -- ✅ КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: перезагружаем target участника перед обработкой каждого дубликата
    SELECT * INTO v_target_record
    FROM public.participants
    WHERE id = p_target;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target participant % not found', p_target;
    END IF;
    
    -- Получаем данные дубликата
    SELECT * INTO v_duplicate_record
    FROM public.participants
    WHERE id = v_duplicate;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Обрабатываем поля: full_name, email, phone, username, first_name, last_name
    -- 1. full_name
    v_target_value := v_target_record.full_name;
    v_duplicate_value := v_duplicate_record.full_name;
    
    IF v_target_value IS NULL AND v_duplicate_value IS NOT NULL THEN
      -- Копируем значение в target
      UPDATE public.participants
      SET full_name = v_duplicate_value,
          updated_at = now(),
          updated_by = p_actor
      WHERE id = p_target;
      
      v_merged_fields := v_merged_fields || jsonb_build_object(
        'field', 'full_name',
        'action', 'filled',
        'value', v_duplicate_value
      );
      
    ELSIF v_target_value IS NOT NULL AND v_duplicate_value IS NOT NULL AND v_target_value != v_duplicate_value THEN
      -- Конфликт: сохраняем в характеристики
      v_trait_key := 'full_name_merged';
      v_trait_counter := 1;
      
      -- Проверяем, есть ли уже такой ключ
      WHILE EXISTS (
        SELECT 1 FROM public.participant_traits
        WHERE participant_id = p_target AND trait_key = v_trait_key
      ) LOOP
        v_trait_counter := v_trait_counter + 1;
        v_trait_key := 'full_name_merged_' || v_trait_counter::text;
      END LOOP;
      
      -- Добавляем характеристику
      INSERT INTO public.participant_traits (
        participant_id, trait_key, trait_value, value_type, source, confidence, metadata, created_by
      ) VALUES (
        p_target,
        v_trait_key,
        v_duplicate_value,
        'text',
        'merge',
        100,
        jsonb_build_object(
          'merged_from', v_duplicate,
          'original_field', 'full_name',
          'conflict_with', v_target_value
        ),
        p_actor
      );
      
      v_conflicts := v_conflicts || jsonb_build_object(
        'field', 'full_name',
        'target_value', v_target_value,
        'duplicate_value', v_duplicate_value,
        'saved_as', v_trait_key
      );
    END IF;

    -- 2. email
    v_target_value := v_target_record.email;
    v_duplicate_value := v_duplicate_record.email;
    
    IF v_target_value IS NULL AND v_duplicate_value IS NOT NULL THEN
      UPDATE public.participants
      SET email = v_duplicate_value,
          updated_at = now(),
          updated_by = p_actor
      WHERE id = p_target;
      
      v_merged_fields := v_merged_fields || jsonb_build_object(
        'field', 'email',
        'action', 'filled',
        'value', v_duplicate_value
      );
      
    ELSIF v_target_value IS NOT NULL AND v_duplicate_value IS NOT NULL AND v_target_value != v_duplicate_value THEN
      v_trait_key := 'email_merged';
      v_trait_counter := 1;
      
      WHILE EXISTS (
        SELECT 1 FROM public.participant_traits
        WHERE participant_id = p_target AND trait_key = v_trait_key
      ) LOOP
        v_trait_counter := v_trait_counter + 1;
        v_trait_key := 'email_merged_' || v_trait_counter::text;
      END LOOP;
      
      INSERT INTO public.participant_traits (
        participant_id, trait_key, trait_value, value_type, source, confidence, metadata, created_by
      ) VALUES (
        p_target,
        v_trait_key,
        v_duplicate_value,
        'text',
        'merge',
        100,
        jsonb_build_object(
          'merged_from', v_duplicate,
          'original_field', 'email',
          'conflict_with', v_target_value
        ),
        p_actor
      );
      
      v_conflicts := v_conflicts || jsonb_build_object(
        'field', 'email',
        'target_value', v_target_value,
        'duplicate_value', v_duplicate_value,
        'saved_as', v_trait_key
      );
    END IF;

    -- 3. phone
    v_target_value := v_target_record.phone;
    v_duplicate_value := v_duplicate_record.phone;
    
    IF v_target_value IS NULL AND v_duplicate_value IS NOT NULL THEN
      UPDATE public.participants
      SET phone = v_duplicate_value,
          updated_at = now(),
          updated_by = p_actor
      WHERE id = p_target;
      
      v_merged_fields := v_merged_fields || jsonb_build_object(
        'field', 'phone',
        'action', 'filled',
        'value', v_duplicate_value
      );
      
    ELSIF v_target_value IS NOT NULL AND v_duplicate_value IS NOT NULL AND v_target_value != v_duplicate_value THEN
      v_trait_key := 'phone_merged';
      v_trait_counter := 1;
      
      WHILE EXISTS (
        SELECT 1 FROM public.participant_traits
        WHERE participant_id = p_target AND trait_key = v_trait_key
      ) LOOP
        v_trait_counter := v_trait_counter + 1;
        v_trait_key := 'phone_merged_' || v_trait_counter::text;
      END LOOP;
      
      INSERT INTO public.participant_traits (
        participant_id, trait_key, trait_value, value_type, source, confidence, metadata, created_by
      ) VALUES (
        p_target,
        v_trait_key,
        v_duplicate_value,
        'text',
        'merge',
        100,
        jsonb_build_object(
          'merged_from', v_duplicate,
          'original_field', 'phone',
          'conflict_with', v_target_value
        ),
        p_actor
      );
      
      v_conflicts := v_conflicts || jsonb_build_object(
        'field', 'phone',
        'target_value', v_target_value,
        'duplicate_value', v_duplicate_value,
        'saved_as', v_trait_key
      );
    END IF;

    -- 4. username
    v_target_value := v_target_record.username;
    v_duplicate_value := v_duplicate_record.username;
    
    IF v_target_value IS NULL AND v_duplicate_value IS NOT NULL THEN
      UPDATE public.participants
      SET username = v_duplicate_value,
          updated_at = now(),
          updated_by = p_actor
      WHERE id = p_target;
      
      v_merged_fields := v_merged_fields || jsonb_build_object(
        'field', 'username',
        'action', 'filled',
        'value', v_duplicate_value
      );
      
    ELSIF v_target_value IS NOT NULL AND v_duplicate_value IS NOT NULL AND v_target_value != v_duplicate_value THEN
      v_trait_key := 'username_merged';
      v_trait_counter := 1;
      
      WHILE EXISTS (
        SELECT 1 FROM public.participant_traits
        WHERE participant_id = p_target AND trait_key = v_trait_key
      ) LOOP
        v_trait_counter := v_trait_counter + 1;
        v_trait_key := 'username_merged_' || v_trait_counter::text;
      END LOOP;
      
      INSERT INTO public.participant_traits (
        participant_id, trait_key, trait_value, value_type, source, confidence, metadata, created_by
      ) VALUES (
        p_target,
        v_trait_key,
        v_duplicate_value,
        'text',
        'merge',
        100,
        jsonb_build_object(
          'merged_from', v_duplicate,
          'original_field', 'username',
          'conflict_with', v_target_value
        ),
        p_actor
      );
      
      v_conflicts := v_conflicts || jsonb_build_object(
        'field', 'username',
        'target_value', v_target_value,
        'duplicate_value', v_duplicate_value,
        'saved_as', v_trait_key
      );
    END IF;

    -- 5. first_name
    v_target_value := v_target_record.first_name;
    v_duplicate_value := v_duplicate_record.first_name;
    
    IF v_target_value IS NULL AND v_duplicate_value IS NOT NULL THEN
      UPDATE public.participants
      SET first_name = v_duplicate_value,
          updated_at = now(),
          updated_by = p_actor
      WHERE id = p_target;
      
      v_merged_fields := v_merged_fields || jsonb_build_object(
        'field', 'first_name',
        'action', 'filled',
        'value', v_duplicate_value
      );
      
    ELSIF v_target_value IS NOT NULL AND v_duplicate_value IS NOT NULL AND v_target_value != v_duplicate_value THEN
      v_trait_key := 'first_name_merged';
      v_trait_counter := 1;
      
      WHILE EXISTS (
        SELECT 1 FROM public.participant_traits
        WHERE participant_id = p_target AND trait_key = v_trait_key
      ) LOOP
        v_trait_counter := v_trait_counter + 1;
        v_trait_key := 'first_name_merged_' || v_trait_counter::text;
      END LOOP;
      
      INSERT INTO public.participant_traits (
        participant_id, trait_key, trait_value, value_type, source, confidence, metadata, created_by
      ) VALUES (
        p_target,
        v_trait_key,
        v_duplicate_value,
        'text',
        'merge',
        100,
        jsonb_build_object(
          'merged_from', v_duplicate,
          'original_field', 'first_name',
          'conflict_with', v_target_value
        ),
        p_actor
      );
      
      v_conflicts := v_conflicts || jsonb_build_object(
        'field', 'first_name',
        'target_value', v_target_value,
        'duplicate_value', v_duplicate_value,
        'saved_as', v_trait_key
      );
    END IF;

    -- 6. last_name
    v_target_value := v_target_record.last_name;
    v_duplicate_value := v_duplicate_record.last_name;
    
    IF v_target_value IS NULL AND v_duplicate_value IS NOT NULL THEN
      UPDATE public.participants
      SET last_name = v_duplicate_value,
          updated_at = now(),
          updated_by = p_actor
      WHERE id = p_target;
      
      v_merged_fields := v_merged_fields || jsonb_build_object(
        'field', 'last_name',
        'action', 'filled',
        'value', v_duplicate_value
      );
      
    ELSIF v_target_value IS NOT NULL AND v_duplicate_value IS NOT NULL AND v_target_value != v_duplicate_value THEN
      v_trait_key := 'last_name_merged';
      v_trait_counter := 1;
      
      WHILE EXISTS (
        SELECT 1 FROM public.participant_traits
        WHERE participant_id = p_target AND trait_key = v_trait_key
      ) LOOP
        v_trait_counter := v_trait_counter + 1;
        v_trait_key := 'last_name_merged_' || v_trait_counter::text;
      END LOOP;
      
      INSERT INTO public.participant_traits (
        participant_id, trait_key, trait_value, value_type, source, confidence, metadata, created_by
      ) VALUES (
        p_target,
        v_trait_key,
        v_duplicate_value,
        'text',
        'merge',
        100,
        jsonb_build_object(
          'merged_from', v_duplicate,
          'original_field', 'last_name',
          'conflict_with', v_target_value
        ),
        p_actor
      );
      
      v_conflicts := v_conflicts || jsonb_build_object(
        'field', 'last_name',
        'target_value', v_target_value,
        'duplicate_value', v_duplicate_value,
        'saved_as', v_trait_key
      );
    END IF;

  END LOOP;

  -- Вызываем старую функцию для переноса связей, характеристик и активности
  PERFORM public.merge_participants_extended(p_target, p_duplicates, p_actor);

  RETURN jsonb_build_object(
    'merged_fields', v_merged_fields,
    'conflicts', v_conflicts,
    'target', p_target,
    'duplicates', p_duplicates
  );
END;
$$;

COMMENT ON FUNCTION public.merge_participants_smart IS 
'Умное объединение участников с сохранением всех данных. 
Заполняет пустые поля, конфликтующие значения сохраняет в характеристики.
Версия 26: перезагружает target record перед обработкой каждого дубликата.';

