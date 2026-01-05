


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'RLS policies optimized with (select auth.uid()) for better performance - Migration 146';



CREATE TYPE "public"."messenger_platform" AS ENUM (
    'telegram',
    'max',
    'whatsapp'
);


ALTER TYPE "public"."messenger_platform" OWNER TO "postgres";


COMMENT ON TYPE "public"."messenger_platform" IS 'Поддерживаемые платформы мессенджеров: telegram, max, whatsapp';



CREATE TYPE "public"."participant_status_enum" AS ENUM (
    'participant',
    'event_attendee',
    'candidate',
    'excluded'
);


ALTER TYPE "public"."participant_status_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_activity_score"("p_participant_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_score INTEGER := 0;
  v_tg_user_id BIGINT;
  v_org_id UUID;
  v_message_count INTEGER;
  v_days_since_last_activity INTEGER;
  v_days_since_join INTEGER;
  v_reply_count INTEGER;
BEGIN
  -- Get participant info
  SELECT tg_user_id, org_id, 
         EXTRACT(DAY FROM NOW() - last_activity_at)::INTEGER,
         EXTRACT(DAY FROM NOW() - created_at)::INTEGER
  INTO v_tg_user_id, v_org_id, v_days_since_last_activity, v_days_since_join
  FROM participants
  WHERE id = p_participant_id;
  
  -- If no telegram user or org, return 0
  IF v_tg_user_id IS NULL OR v_org_id IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Count messages in last 30 days
  SELECT COUNT(*) INTO v_message_count
  FROM activity_events
  WHERE org_id = v_org_id
    AND tg_user_id = v_tg_user_id
    AND event_type = 'message'
    AND created_at > NOW() - INTERVAL '30 days';
  
  -- Count replies (more valuable than regular messages)
  SELECT COUNT(*) INTO v_reply_count
  FROM activity_events
  WHERE org_id = v_org_id
    AND tg_user_id = v_tg_user_id
    AND event_type = 'message'
    AND reply_to_message_id IS NOT NULL
    AND created_at > NOW() - INTERVAL '30 days';
  
  -- Base score: messages weighted
  v_score := (v_message_count * 5) + (v_reply_count * 3); -- Replies worth more
  
  -- Recency bonus/penalty
  IF v_days_since_last_activity IS NULL THEN
    -- Never active
    v_score := 0;
  ELSIF v_days_since_last_activity <= 1 THEN
    -- Active today/yesterday - bonus
    v_score := v_score + 20;
  ELSIF v_days_since_last_activity <= 7 THEN
    -- Active this week - small bonus
    v_score := v_score + 10;
  ELSIF v_days_since_last_activity > 30 THEN
    -- Inactive 30+ days - heavy penalty
    v_score := GREATEST(v_score - 50, 0);
  ELSIF v_days_since_last_activity > 14 THEN
    -- Inactive 14+ days - penalty
    v_score := v_score - 20;
  END IF;
  
  -- Consistency bonus (messages per day since join)
  IF v_days_since_join > 0 AND v_message_count > 0 THEN
    -- Consistent activity gets bonus
    v_score := v_score + LEAST((v_message_count * 30 / v_days_since_join)::INTEGER, 30);
  END IF;
  
  -- Normalize: min 0, max 999
  RETURN GREATEST(LEAST(v_score, 999), 0);
END;
$$;


ALTER FUNCTION "public"."calculate_activity_score"("p_participant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_activity_score"("p_participant_id" "uuid") IS 'Calculates activity score (0-999) based on messages, replies, recency, and consistency. Higher = more active.';



CREATE OR REPLACE FUNCTION "public"."calculate_risk_score"("p_participant_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_risk_score INTEGER := 0;
  v_days_since_last_activity INTEGER;
  v_activity_score INTEGER;
  v_message_count INTEGER;
  v_tg_user_id BIGINT;
  v_org_id UUID;
  v_days_since_join INTEGER;
BEGIN
  -- Get participant info
  SELECT tg_user_id, org_id, activity_score,
         EXTRACT(DAY FROM NOW() - last_activity_at)::INTEGER,
         EXTRACT(DAY FROM NOW() - created_at)::INTEGER
  INTO v_tg_user_id, v_org_id, v_activity_score, v_days_since_last_activity, v_days_since_join
  FROM participants
  WHERE id = p_participant_id;
  
  -- If no data, low risk (new/unknown)
  IF v_tg_user_id IS NULL OR v_org_id IS NULL THEN
    RETURN 20;
  END IF;
  
  -- Get total message count
  SELECT COUNT(*) INTO v_message_count
  FROM activity_events
  WHERE org_id = v_org_id
    AND tg_user_id = v_tg_user_id
    AND event_type = 'message';
  
  -- Calculate risk based on inactivity patterns
  IF v_days_since_last_activity IS NULL THEN
    -- Never active
    IF v_days_since_join > 7 THEN
      v_risk_score := 60; -- High risk - joined but never participated
    ELSE
      v_risk_score := 30; -- Medium risk - just joined, give them time
    END IF;
    
  ELSIF v_message_count > 10 AND v_days_since_last_activity > 30 THEN
    -- Was active (10+ messages) but silent 30+ days - HIGH CHURN RISK
    v_risk_score := 90 + LEAST(v_days_since_last_activity - 30, 10);
    
  ELSIF v_message_count > 5 AND v_days_since_last_activity > 21 THEN
    -- Was moderately active but silent 21+ days - HIGH RISK
    v_risk_score := 80;
    
  ELSIF v_message_count > 3 AND v_days_since_last_activity > 14 THEN
    -- Had some activity but silent 14+ days - MEDIUM-HIGH RISK
    v_risk_score := 65;
    
  ELSIF v_days_since_last_activity > 30 THEN
    -- Any participant silent 30+ days - MEDIUM RISK
    v_risk_score := 50;
    
  ELSIF v_days_since_last_activity > 14 THEN
    -- Silent 14+ days - MEDIUM RISK
    v_risk_score := 40;
    
  ELSIF v_days_since_last_activity > 7 THEN
    -- Silent 7+ days - LOW-MEDIUM RISK
    v_risk_score := 25;
    
  ELSIF v_days_since_last_activity > 3 THEN
    -- Silent 3+ days - LOW RISK
    v_risk_score := 15;
    
  ELSE
    -- Active recently - VERY LOW RISK
    v_risk_score := 5;
  END IF;
  
  -- Adjust based on activity score (high activity = lower risk)
  IF v_activity_score > 100 THEN
    v_risk_score := GREATEST(v_risk_score - 20, 5);
  ELSIF v_activity_score > 50 THEN
    v_risk_score := GREATEST(v_risk_score - 10, 5);
  END IF;
  
  -- Normalize: 0-100
  RETURN GREATEST(LEAST(v_risk_score, 100), 0);
END;
$$;


ALTER FUNCTION "public"."calculate_risk_score"("p_participant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_risk_score"("p_participant_id" "uuid") IS 'Calculates churn risk score (0-100). Higher = higher risk. Considers inactivity duration and past activity level.';



CREATE OR REPLACE FUNCTION "public"."check_item_permission"("p_item_id" "uuid", "p_user_id" "uuid", "p_action" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_item app_items;
  v_membership memberships;
BEGIN
  -- Get item
  SELECT * INTO v_item FROM app_items WHERE id = p_item_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Get membership
  SELECT * INTO v_membership
  FROM memberships
  WHERE org_id = v_item.org_id
  AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Check permissions
  IF p_action = 'read' THEN
    RETURN TRUE; -- All members can read
  ELSIF p_action = 'edit' THEN
    RETURN v_item.creator_id = p_user_id 
           OR v_membership.role IN ('owner', 'admin', 'moderator');
  ELSIF p_action = 'delete' THEN
    RETURN v_item.creator_id = p_user_id 
           OR v_membership.role IN ('owner', 'admin');
  ELSIF p_action = 'moderate' THEN
    RETURN v_membership.role IN ('owner', 'admin', 'moderator');
  ELSE
    RETURN FALSE;
  END IF;
END;
$$;


ALTER FUNCTION "public"."check_item_permission"("p_item_id" "uuid", "p_user_id" "uuid", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_notification_duplicate"("p_rule_id" "uuid", "p_dedup_hash" "text", "p_hours" integer DEFAULT 1) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM notification_logs
    WHERE rule_id = p_rule_id
      AND dedup_hash = p_dedup_hash
      AND created_at > NOW() - (p_hours || ' hours')::INTERVAL
      AND notification_status IN ('sent', 'pending')
  );
END;
$$;


ALTER FUNCTION "public"."check_notification_duplicate"("p_rule_id" "uuid", "p_dedup_hash" "text", "p_hours" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_notification_duplicate"("p_rule_id" "uuid", "p_dedup_hash" "text", "p_hours" integer) IS 'Проверяет, было ли уже такое уведомление за последние N часов';



CREATE OR REPLACE FUNCTION "public"."check_participant_exclusion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_org_id UUID;
  v_remaining_groups INTEGER;
BEGIN
  -- Если участника удалили из группы
  IF (TG_OP = 'DELETE') THEN
    -- Получаем org_id группы через org_telegram_groups
    -- ⚠️ ИСПРАВЛЕНО: otg.tg_chat_id (а не tg_group_id)
    SELECT otg.org_id INTO v_org_id
    FROM org_telegram_groups otg
    WHERE otg.tg_chat_id = OLD.tg_group_id
    LIMIT 1;
    
    -- Если группа не привязана ни к одной организации, выходим
    IF v_org_id IS NULL THEN
      RETURN OLD;
    END IF;
    
    -- Проверяем, остался ли участник хотя бы в одной группе этой организации
    -- ⚠️ ИСПРАВЛЕНО: otg.tg_chat_id (а не tg_group_id)
    SELECT COUNT(*) INTO v_remaining_groups
    FROM participant_groups pg
    JOIN org_telegram_groups otg ON otg.tg_chat_id = pg.tg_group_id
    WHERE pg.participant_id = OLD.participant_id
      AND otg.org_id = v_org_id
      AND pg.is_active = TRUE;
    
    -- Если не осталось ни одной группы → меняем статус на 'excluded'
    IF v_remaining_groups = 0 THEN
      UPDATE participants
      SET participant_status = 'excluded',
          updated_at = NOW()
      WHERE id = OLD.participant_id
        AND participant_status = 'participant';
    END IF;
  END IF;
  
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."check_participant_exclusion"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_participant_exclusion"() IS 'Автоматически меняет статус на excluded при удалении из всех групп организации';



CREATE OR REPLACE FUNCTION "public"."check_user_admin_status"("p_tg_chat_id" bigint, "p_tg_user_id" bigint) RETURNS TABLE("is_owner" boolean, "is_admin" boolean, "can_manage_chat" boolean, "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tga.is_owner,
    tga.is_admin,
    tga.can_manage_chat,
    tga.expires_at
  FROM telegram_group_admins tga
  WHERE tga.tg_chat_id = p_tg_chat_id 
    AND tga.tg_user_id = p_tg_user_id
    AND tga.expires_at > NOW();
END;
$$;


ALTER FUNCTION "public"."check_user_admin_status"("p_tg_chat_id" bigint, "p_tg_user_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_webhook_processed"("p_update_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM telegram_webhook_idempotency 
    WHERE update_id = p_update_id
  );
END;
$$;


ALTER FUNCTION "public"."check_webhook_processed"("p_update_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_webhook_processed"("p_update_id" bigint) IS 'Fast check if webhook update_id was already processed.';



CREATE OR REPLACE FUNCTION "public"."cleanup_admin_action_log"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.admin_action_log
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_admin_action_log"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_all_expired_auth_tokens"() RETURNS TABLE("telegram_deleted" integer, "email_deleted" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  SELECT cleanup_expired_auth_codes() INTO telegram_deleted;
  SELECT cleanup_expired_email_auth_tokens() INTO email_deleted;
  RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."cleanup_all_expired_auth_tokens"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_error_logs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_error_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_auth_codes"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_auth_codes
  WHERE expires_at < NOW()
  OR (is_used = TRUE AND used_at < NOW() - INTERVAL '7 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_auth_codes"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_expired_auth_codes"() IS 'Удаляет просроченные и старые использованные коды авторизации';



CREATE OR REPLACE FUNCTION "public"."cleanup_expired_email_auth_tokens"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM email_auth_tokens
  WHERE expires_at < NOW()
  OR (is_used = TRUE AND used_at < NOW() - INTERVAL '7 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_email_auth_tokens"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_expired_email_auth_tokens"() IS 'Удаляет просроченные и старые использованные токены авторизации';



CREATE OR REPLACE FUNCTION "public"."cleanup_expired_verifications"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  UPDATE user_telegram_accounts 
  SET verification_code = NULL, verification_expires_at = NULL
  WHERE verification_expires_at < NOW() AND is_verified = FALSE;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_verifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_health_events"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_health_events WHERE created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_health_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_notification_logs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM notification_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_notification_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_participant_messages"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM participant_messages
  WHERE sent_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Cleaned up % messages older than 90 days', deleted_count;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_participant_messages"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_old_participant_messages"() IS 'Удаляет сообщения старше 90 дней для экономии места';



CREATE OR REPLACE FUNCTION "public"."cleanup_webhook_idempotency"("p_retention_days" integer DEFAULT 7) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_webhook_idempotency 
  WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_webhook_idempotency"("p_retention_days" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_webhook_idempotency"("p_retention_days" integer) IS 'Cleanup old idempotency records. Run via cron every hour with retention_days=7.';



CREATE OR REPLACE FUNCTION "public"."create_get_participants_function"("org_id_param" "uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
  function_exists BOOLEAN;
BEGIN
  -- Проверяем, существует ли функция
  SELECT EXISTS (
    SELECT 1 
    FROM pg_proc 
    WHERE proname = 'get_participants_with_group_count'
  ) INTO function_exists;
  
  -- Если функция не существует, создаем ее
  IF NOT function_exists THEN
    EXECUTE $FUNC$
    CREATE OR REPLACE FUNCTION get_participants_with_group_count(org_id_param UUID)
    RETURNS TABLE (
      id UUID,
      org_id UUID,
      tg_user_id BIGINT,
      username TEXT,
      full_name TEXT,
      email TEXT,
      phone TEXT,
      created_at TIMESTAMP WITH TIME ZONE,
      last_activity_at TIMESTAMP WITH TIME ZONE,
      activity_score INTEGER,
      risk_score INTEGER,
      group_count BIGINT
    ) AS $INNER$
    BEGIN
      RETURN QUERY
      SELECT 
        p.*,
        COALESCE(
          (SELECT COUNT(*) 
           FROM participant_groups pg 
           WHERE pg.participant_id = p.id AND pg.is_active = TRUE),
          0
        ) AS group_count
      FROM 
        participants p
      WHERE 
        p.org_id = org_id_param
      ORDER BY 
        p.last_activity_at DESC NULLS LAST,
        p.created_at DESC
      LIMIT 100;
    END;
    $INNER$ LANGUAGE plpgsql;
    $FUNC$;
    
    RETURN 'Function created successfully';
  ELSE
    RETURN 'Function already exists';
  END IF;
END;
$_$;


ALTER FUNCTION "public"."create_get_participants_function"("org_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_system_notification_rules"("p_org_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Правило для молчунов
  INSERT INTO notification_rules (
    org_id,
    name,
    description,
    rule_type,
    config,
    use_ai,
    notify_owner,
    notify_admins,
    is_enabled,
    is_system,
    send_telegram
  ) VALUES (
    p_org_id,
    'Участники на грани оттока',
    'Уведомления об участниках, которые молчат более 14 дней',
    'churning_participant',
    '{"days_silent": 14}'::jsonb,
    FALSE,
    TRUE,
    FALSE,
    TRUE,
    TRUE,
    FALSE  -- НЕ отправляем в Telegram
  )
  ON CONFLICT (org_id, name) DO NOTHING;
  
  IF FOUND THEN v_count := v_count + 1; END IF;
  
  -- Правило для неактивных новичков
  INSERT INTO notification_rules (
    org_id,
    name,
    description,
    rule_type,
    config,
    use_ai,
    notify_owner,
    notify_admins,
    is_enabled,
    is_system,
    send_telegram
  ) VALUES (
    p_org_id,
    'Новички без активности',
    'Уведомления о новых участниках, которые не проявляют активность',
    'inactive_newcomer',
    '{"days_since_first": 14}'::jsonb,
    FALSE,
    TRUE,
    FALSE,
    TRUE,
    TRUE,
    FALSE  -- НЕ отправляем в Telegram
  )
  ON CONFLICT (org_id, name) DO NOTHING;
  
  IF FOUND THEN v_count := v_count + 1; END IF;
  
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."create_system_notification_rules"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."debug_find_group"("chat_id_param" bigint) RETURNS TABLE("id" integer, "org_id" "uuid", "tg_chat_id" bigint, "title" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT g.id, g.org_id, g.tg_chat_id, g.title
  FROM telegram_groups g
  WHERE g.tg_chat_id = chat_id_param
  OR g.tg_chat_id = ABS(chat_id_param)
  OR g.tg_chat_id::TEXT = chat_id_param::TEXT;
END;
$$;


ALTER FUNCTION "public"."debug_find_group"("chat_id_param" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_counter"("row_id" bigint) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  current_count INTEGER;
BEGIN
  -- Получаем текущее значение
  SELECT member_count INTO current_count
  FROM telegram_groups
  WHERE tg_chat_id = row_id;
  
  -- Если значение NULL или 0, оставляем 0
  IF current_count IS NULL OR current_count <= 0 THEN
    RETURN 0;
  ELSE
    RETURN current_count - 1;
  END IF;
END;
$$;


ALTER FUNCTION "public"."decrement_counter"("row_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_participant_data"("p_participant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Удаляем все сообщения участника
  DELETE FROM participant_messages WHERE participant_id = p_participant_id;
  
  -- Анонимизируем события активности (не удаляем для сохранения статистики)
  UPDATE activity_events 
  SET participant_id = NULL, 
      tg_user_id = NULL,
      meta = CASE 
        WHEN meta IS NOT NULL 
        THEN jsonb_set(meta, '{user,anonymized}', 'true'::jsonb)
        ELSE '{"user": {"anonymized": true}}'::jsonb
      END
  WHERE participant_id = p_participant_id;
  
  RAISE NOTICE 'Participant data deleted/anonymized for ID: %', p_participant_id;
END;
$$;


ALTER FUNCTION "public"."delete_participant_data"("p_participant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_participant_data"("p_participant_id" "uuid") IS 'Удаляет сообщения и анонимизирует события участника (GDPR Right to be Forgotten)';



CREATE OR REPLACE FUNCTION "public"."exec_sql"("sql" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  EXECUTE sql;
END;
$$;


ALTER FUNCTION "public"."exec_sql"("sql" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_old_invitations"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.invitations
  SET 
    status = 'expired',
    updated_at = NOW()
  WHERE 
    status = 'pending'
    AND expires_at < NOW();
    
  RAISE NOTICE 'Expired old invitations';
END;
$$;


ALTER FUNCTION "public"."expire_old_invitations"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."expire_old_invitations"() IS 'Automatically marks expired invitations';



CREATE OR REPLACE FUNCTION "public"."find_duplicate_participants"("p_org_id" "uuid") RETURNS TABLE("participant_id_1" "uuid", "participant_id_2" "uuid", "match_reason" "text", "confidence" numeric, "details" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Дубли по email
  RETURN QUERY
  SELECT 
    p1.id,
    p2.id,
    'email_match'::TEXT,
    1.0::NUMERIC,
    jsonb_build_object(
      'email', p1.email,
      'p1_tg_user_id', p1.tg_user_id,
      'p2_tg_user_id', p2.tg_user_id,
      'p1_created', p1.created_at,
      'p2_created', p2.created_at
    )
  FROM participants p1
  JOIN participants p2 ON p1.email = p2.email 
    AND p1.org_id = p2.org_id
    AND p1.id < p2.id
  WHERE p1.org_id = p_org_id
    AND p1.email IS NOT NULL
    AND p1.email != ''
    AND p1.merged_into IS NULL
    AND p2.merged_into IS NULL;
  
  -- Дубли по tg_user_id
  RETURN QUERY
  SELECT 
    p1.id,
    p2.id,
    'telegram_id_match'::TEXT,
    1.0::NUMERIC,
    jsonb_build_object(
      'tg_user_id', p1.tg_user_id,
      'p1_email', p1.email,
      'p2_email', p2.email,
      'p1_created', p1.created_at,
      'p2_created', p2.created_at
    )
  FROM participants p1
  JOIN participants p2 ON p1.tg_user_id = p2.tg_user_id 
    AND p1.org_id = p2.org_id
    AND p1.id < p2.id
  WHERE p1.org_id = p_org_id
    AND p1.tg_user_id IS NOT NULL
    AND p1.merged_into IS NULL
    AND p2.merged_into IS NULL;
END;
$$;


ALTER FUNCTION "public"."find_duplicate_participants"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_group_by_chat_id"("chat_id" bigint) RETURNS TABLE("id" integer, "org_id" "uuid", "analytics_enabled" boolean)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT g.id, g.org_id, g.analytics_enabled
  FROM telegram_groups g
  WHERE g.tg_chat_id = chat_id;
END;
$$;


ALTER FUNCTION "public"."find_group_by_chat_id"("chat_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_user_id_by_telegram"("p_tg_user_id" bigint) RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Приоритет 1: Ищем в user_telegram_accounts (verified)
  SELECT user_id INTO v_user_id
  FROM user_telegram_accounts
  WHERE telegram_user_id = p_tg_user_id
    AND is_verified = true
  LIMIT 1;
  
  -- Приоритет 2: Fallback на participants
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id
    FROM participants
    WHERE tg_user_id = p_tg_user_id
      AND merged_into IS NULL
      AND user_id IS NOT NULL
    LIMIT 1;
  END IF;
  
  RETURN v_user_id;
END;
$$;


ALTER FUNCTION "public"."find_user_id_by_telegram"("p_tg_user_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."find_user_id_by_telegram"("p_tg_user_id" bigint) IS 'Helper function to find user_id by telegram_user_id globally (across all organizations)';



CREATE OR REPLACE FUNCTION "public"."generate_invite_token"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
  token_exists BOOLEAN;
BEGIN
  LOOP
    result := '';
    -- Генерируем токен из 10 символов
    FOR i IN 1..10 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    
    -- Проверяем уникальность
    SELECT EXISTS(SELECT 1 FROM organization_invites WHERE token = result) INTO token_exists;
    
    EXIT WHEN NOT token_exists;
  END LOOP;
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."generate_invite_token"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."generate_invite_token"() IS 'Генерирует уникальный короткий токен для приглашения';



CREATE OR REPLACE FUNCTION "public"."generate_verification_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));
END;
$$;


ALTER FUNCTION "public"."generate_verification_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_weekly_digest_data"("p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result JSONB;
  v_key_metrics JSONB;
  v_attention_zones JSONB;
  v_upcoming_events JSONB;
  v_message_count INT;
BEGIN
  -- ==================================================
  -- BLOCK A: KEY METRICS (Week vs Previous Week)
  -- ==================================================
  WITH current_week AS (
    SELECT
      COUNT(DISTINCT ae.tg_user_id) as active_participants,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as messages,
      COUNT(*) FILTER (WHERE ae.reply_to_message_id IS NOT NULL) as replies,
      SUM(ae.reactions_count) as reactions
    FROM activity_events ae
    JOIN org_telegram_groups otg ON otg.tg_chat_id = ae.tg_chat_id
    WHERE otg.org_id = p_org_id
      AND ae.created_at >= NOW() - INTERVAL '7 days'
  ),
  previous_week AS (
    SELECT
      COUNT(DISTINCT ae.tg_user_id) as active_participants,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as messages,
      COUNT(*) FILTER (WHERE ae.reply_to_message_id IS NOT NULL) as replies,
      SUM(ae.reactions_count) as reactions
    FROM activity_events ae
    JOIN org_telegram_groups otg ON otg.tg_chat_id = ae.tg_chat_id
    WHERE otg.org_id = p_org_id
      AND ae.created_at >= NOW() - INTERVAL '14 days'
      AND ae.created_at < NOW() - INTERVAL '7 days'
  )
  SELECT jsonb_build_object(
    'current', jsonb_build_object(
      'active_participants', COALESCE(cw.active_participants, 0),
      'messages', COALESCE(cw.messages, 0),
      'replies', COALESCE(cw.replies, 0),
      'reactions', COALESCE(cw.reactions, 0)
    ),
    'previous', jsonb_build_object(
      'active_participants', COALESCE(pw.active_participants, 0),
      'messages', COALESCE(pw.messages, 0),
      'replies', COALESCE(pw.replies, 0),
      'reactions', COALESCE(pw.reactions, 0)
    )
  ) INTO v_key_metrics
  FROM current_week cw, previous_week pw;

  -- Get message count for AI decision
  SELECT COALESCE(v_key_metrics->'current'->>'messages', '0')::INT INTO v_message_count;

  -- ==================================================
  -- BLOCK B: ATTENTION ZONES
  -- ==================================================
  WITH inactive_newcomers AS (
    SELECT COUNT(*) as count
    FROM participants p
    WHERE p.org_id = p_org_id
      AND p.created_at >= NOW() - INTERVAL '7 days'
      AND (p.last_activity_at IS NULL OR p.last_activity_at < NOW() - INTERVAL '3 days')
  ),
  silent_members AS (
    SELECT COUNT(*) as count
    FROM participants p
    WHERE p.org_id = p_org_id
      AND p.last_activity_at < NOW() - INTERVAL '14 days'
      AND p.participant_status = 'participant'
  )
  SELECT jsonb_build_object(
    'inactive_newcomers', COALESCE(inn.count, 0),
    'silent_members', COALESCE(sm.count, 0)
  ) INTO v_attention_zones
  FROM inactive_newcomers inn, silent_members sm;

  -- ==================================================
  -- BLOCK E: UPCOMING EVENTS (Next 7 Days)
  -- ==================================================
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'title', e.title,
      'start_time', (e.event_date + e.start_time)::timestamptz,
      'location', e.location_info,
      'registration_count', COALESCE(reg_counts.count, 0)
    )
    ORDER BY e.event_date, e.start_time ASC
  ) INTO v_upcoming_events
  FROM events e
  LEFT JOIN (
    SELECT event_id, COUNT(*) as count
    FROM event_registrations
    WHERE status = 'registered'
    GROUP BY event_id
  ) reg_counts ON reg_counts.event_id = e.id
  WHERE e.org_id = p_org_id
    AND (e.event_date + e.start_time)::timestamptz >= NOW()
    AND (e.event_date + e.start_time)::timestamptz <= NOW() + INTERVAL '7 days'
    AND e.status = 'published';

  -- If no events, return empty array
  IF v_upcoming_events IS NULL THEN
    v_upcoming_events := '[]'::jsonb;
  END IF;

  -- ==================================================
  -- RESULT
  -- ==================================================
  v_result := jsonb_build_object(
    'org_id', p_org_id,
    'generated_at', NOW(),
    'key_metrics', v_key_metrics,
    'attention_zones', v_attention_zones,
    'upcoming_events', v_upcoming_events,
    'message_count', v_message_count,
    'ai_analysis_eligible', v_message_count >= 20
  );

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."generate_weekly_digest_data"("p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."generate_weekly_digest_data"("p_org_id" "uuid") IS 'Collects data for AI Weekly Digest: key metrics, attention zones, upcoming events. Returns eligibility for AI analysis (requires ≥20 messages).';



CREATE OR REPLACE FUNCTION "public"."get_activity_gini"("org_id_param" "uuid", "tg_chat_id_param" bigint, "days_ago" integer DEFAULT 7, "timezone_name" "text" DEFAULT 'Europe/Moscow'::"text") RETURNS double precision
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  total_messages bigint;
  user_messages record;
  previous_sum bigint := 0;
  gini float := 0;
  user_count integer := 0;
BEGIN
  -- Получаем общее количество сообщений
  SELECT COUNT(*) INTO total_messages
  FROM activity_events
  WHERE tg_chat_id = tg_chat_id_param
    AND org_id = org_id_param
    AND event_type = 'message'
    AND created_at >= (NOW() AT TIME ZONE timezone_name - (days_ago || ' days')::interval);

  -- Если сообщений нет, возвращаем 0
  IF total_messages = 0 THEN
    RETURN 0;
  END IF;

  -- Получаем количество сообщений по пользователям, отсортированное по возрастанию
  FOR user_messages IN (
    SELECT tg_user_id, COUNT(*) as message_count
    FROM activity_events
    WHERE tg_chat_id = tg_chat_id_param
      AND org_id = org_id_param
      AND event_type = 'message'
      AND created_at >= (NOW() AT TIME ZONE timezone_name - (days_ago || ' days')::interval)
    GROUP BY tg_user_id
    ORDER BY message_count
  ) LOOP
    user_count := user_count + 1;
    gini := gini + (user_count * user_messages.message_count::float - previous_sum);
    previous_sum := previous_sum + user_messages.message_count;
  END LOOP;

  -- Вычисляем коэффициент Джини
  RETURN ROUND((gini / (user_count * previous_sum::float))::numeric, 4);
END;
$$;


ALTER FUNCTION "public"."get_activity_gini"("org_id_param" "uuid", "tg_chat_id_param" bigint, "days_ago" integer, "timezone_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_activity_heatmap"("p_org_id" "uuid", "p_days" integer DEFAULT 30, "p_tg_chat_id" bigint DEFAULT NULL::bigint, "p_timezone" "text" DEFAULT 'UTC'::"text") RETURNS TABLE("hour_of_day" integer, "day_of_week" integer, "message_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH org_groups AS (
    SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = p_org_id
  ),
  -- Telegram activity
  telegram_heatmap AS (
    SELECT 
      EXTRACT(HOUR FROM ae.created_at AT TIME ZONE p_timezone)::INT as hour_of_day,
      EXTRACT(DOW FROM ae.created_at AT TIME ZONE p_timezone)::INT as day_of_week,
      COUNT(*)::BIGINT as message_count
    FROM activity_events ae
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.created_at >= NOW() - (p_days || ' days')::INTERVAL
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
      AND ae.event_type = 'message'
    GROUP BY 1, 2
  ),
  -- WhatsApp activity (tg_chat_id = 0)
  whatsapp_heatmap AS (
    SELECT 
      EXTRACT(HOUR FROM ae.created_at AT TIME ZONE p_timezone)::INT as hour_of_day,
      EXTRACT(DOW FROM ae.created_at AT TIME ZONE p_timezone)::INT as day_of_week,
      COUNT(*)::BIGINT as message_count
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
      AND ae.created_at >= NOW() - (p_days || ' days')::INTERVAL
      AND p_tg_chat_id IS NULL  -- WhatsApp doesn't filter by chat_id
    GROUP BY 1, 2
  ),
  -- Combined
  combined AS (
    SELECT 
      COALESCE(th.hour_of_day, wh.hour_of_day) as hour_of_day,
      COALESCE(th.day_of_week, wh.day_of_week) as day_of_week,
      COALESCE(th.message_count, 0) + COALESCE(wh.message_count, 0) as message_count
    FROM telegram_heatmap th
    FULL OUTER JOIN whatsapp_heatmap wh 
      ON th.hour_of_day = wh.hour_of_day AND th.day_of_week = wh.day_of_week
  )
  SELECT 
    c.hour_of_day,
    c.day_of_week,
    c.message_count
  FROM combined c
  ORDER BY c.hour_of_day, c.day_of_week;
END;
$$;


ALTER FUNCTION "public"."get_activity_heatmap"("p_org_id" "uuid", "p_days" integer, "p_tg_chat_id" bigint, "p_timezone" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_activity_heatmap"("p_org_id" "uuid", "p_days" integer, "p_tg_chat_id" bigint, "p_timezone" "text") IS 'Returns activity heatmap including Telegram and WhatsApp';



CREATE OR REPLACE FUNCTION "public"."get_activity_timeline"("p_org_id" "uuid", "p_days" integer DEFAULT 30, "p_tg_chat_id" bigint DEFAULT NULL::bigint) RETURNS TABLE("date" "date", "message_count" bigint, "reaction_count" bigint, "active_users_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (p_days - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::DATE as date
  ),
  org_groups AS (
    SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = p_org_id
  ),
  -- Telegram activity
  telegram_activity AS (
    SELECT 
      DATE(ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC')) as activity_date,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as message_count,
      COALESCE(SUM(ae.reactions_count), 0) as reaction_count,
      COUNT(DISTINCT ae.tg_user_id) FILTER (WHERE ae.tg_user_id IS NOT NULL) as active_users_count
    FROM activity_events ae
    JOIN organizations o ON o.id = p_org_id
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.created_at >= CURRENT_DATE - (p_days - 1)
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
      AND ae.event_type IN ('message', 'reaction')
    GROUP BY DATE(ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC'))
  ),
  -- WhatsApp activity (tg_chat_id = 0)
  whatsapp_activity AS (
    SELECT 
      DATE(ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC')) as activity_date,
      COUNT(*) as message_count,
      0::BIGINT as reaction_count,
      COUNT(DISTINCT (ae.meta->>'participant_id')) as active_users_count
    FROM activity_events ae
    JOIN organizations o ON o.id = p_org_id
    WHERE ae.org_id = p_org_id
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
      AND ae.created_at >= CURRENT_DATE - (p_days - 1)
      AND p_tg_chat_id IS NULL  -- WhatsApp doesn't filter by chat_id
    GROUP BY DATE(ae.created_at AT TIME ZONE COALESCE(o.timezone, 'UTC'))
  ),
  -- Combined activity by date
  combined_activity AS (
    SELECT 
      COALESCE(ta.activity_date, wa.activity_date) as activity_date,
      COALESCE(ta.message_count, 0) + COALESCE(wa.message_count, 0) as message_count,
      COALESCE(ta.reaction_count, 0) + COALESCE(wa.reaction_count, 0) as reaction_count,
      COALESCE(ta.active_users_count, 0) + COALESCE(wa.active_users_count, 0) as active_users_count
    FROM telegram_activity ta
    FULL OUTER JOIN whatsapp_activity wa ON ta.activity_date = wa.activity_date
  )
  SELECT 
    ds.date,
    COALESCE(ca.message_count, 0)::BIGINT,
    COALESCE(ca.reaction_count, 0)::BIGINT,
    COALESCE(ca.active_users_count, 0)::BIGINT
  FROM date_series ds
  LEFT JOIN combined_activity ca ON ca.activity_date = ds.date
  ORDER BY ds.date ASC;
END;
$$;


ALTER FUNCTION "public"."get_activity_timeline"("p_org_id" "uuid", "p_days" integer, "p_tg_chat_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_activity_timeline"("p_org_id" "uuid", "p_days" integer, "p_tg_chat_id" bigint) IS 'Returns daily activity timeline including Telegram and WhatsApp';



CREATE OR REPLACE FUNCTION "public"."get_app_theme"("p_app_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_theme JSONB;
BEGIN
  SELECT jsonb_build_object(
    'primary_color', primary_color,
    'secondary_color', secondary_color,
    'logo_url', logo_url,
    'custom_css', custom_css
  ) INTO v_theme
  FROM apps
  WHERE id = p_app_id;
  
  RETURN v_theme;
END;
$$;


ALTER FUNCTION "public"."get_app_theme"("p_app_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_app_theme"("p_app_id" "uuid") IS 'Get theme configuration for an app';



CREATE OR REPLACE FUNCTION "public"."get_churning_participants"("p_org_id" "uuid", "p_days_silent" integer DEFAULT 14) RETURNS TABLE("participant_id" "uuid", "full_name" "text", "username" "text", "last_activity_at" timestamp with time zone, "days_since_activity" integer, "previous_activity_score" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.username,
    p.last_activity_at,
    EXTRACT(DAY FROM NOW() - p.last_activity_at)::INTEGER as days_since,
    p.activity_score
  FROM participants p
  WHERE 
    p.org_id = p_org_id
    AND p.last_activity_at IS NOT NULL
    AND p.last_activity_at < NOW() - (p_days_silent || ' days')::INTERVAL
    AND p.activity_score > 10 -- Had meaningful activity before
    AND p.source != 'bot'
    AND (p.participant_status IS NULL OR p.participant_status != 'excluded')
    -- CRITICAL: Must be in at least one group
    AND EXISTS (
      SELECT 1 FROM participant_groups pg 
      WHERE pg.participant_id = p.id
    )
  ORDER BY p.activity_score DESC, p.last_activity_at DESC
  LIMIT 20;
END;
$$;


ALTER FUNCTION "public"."get_churning_participants"("p_org_id" "uuid", "p_days_silent" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_churning_participants"("p_org_id" "uuid", "p_days_silent" integer) IS 'Returns participants who were active but are now silent for N days. Only includes participants in groups.';



CREATE OR REPLACE FUNCTION "public"."get_date_in_timezone"("timestamp_value" timestamp with time zone, "timezone_name" "text" DEFAULT 'Europe/Moscow'::"text") RETURNS "date"
    LANGUAGE "plpgsql"
    AS $$
    BEGIN
      RETURN (timestamp_value AT TIME ZONE timezone_name)::DATE;
    END;
    $$;


ALTER FUNCTION "public"."get_date_in_timezone"("timestamp_value" timestamp with time zone, "timezone_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_engagement_breakdown"("p_org_id" "uuid") RETURNS TABLE("category" "text", "count" bigint, "percentage" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total_participants BIGINT;
BEGIN
  -- Get total participants in this org
  SELECT COUNT(*) INTO v_total_participants
  FROM participants p
  WHERE p.org_id = p_org_id
    AND p.merged_into IS NULL;
  
  IF v_total_participants = 0 THEN
    v_total_participants := 1; -- Avoid division by zero
  END IF;
  
  RETURN QUERY
  WITH 
  -- Pre-aggregate WhatsApp activity (no N+1 subqueries!)
  whatsapp_activity AS (
    SELECT 
      (ae.meta->>'participant_id')::UUID as participant_id,
      MIN(ae.created_at) as first_activity,
      MAX(ae.created_at) as last_activity
    FROM activity_events ae
    WHERE ae.tg_chat_id = 0 
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
      AND ae.org_id = p_org_id
    GROUP BY (ae.meta->>'participant_id')::UUID
  ),
  -- Pre-aggregate Telegram messages
  telegram_activity AS (
    SELECT 
      pm.participant_id,
      MIN(pm.sent_at) as first_message,
      MAX(pm.sent_at) as last_message
    FROM participant_messages pm
    WHERE pm.org_id = p_org_id
    GROUP BY pm.participant_id
  ),
  -- Calculate real activity dates for each participant using JOINs
  participant_activity AS (
    SELECT 
      p.id,
      p.created_at,
      p.last_activity_at,
      p.activity_score,
      LEAST(ta.first_message, wa.first_activity) as first_message_at,
      GREATEST(ta.last_message, wa.last_activity) as last_message_at
    FROM participants p
    LEFT JOIN telegram_activity ta ON ta.participant_id = p.id
    LEFT JOIN whatsapp_activity wa ON wa.participant_id = p.id
    WHERE p.org_id = p_org_id
      AND p.merged_into IS NULL
  ),
  participants_enriched AS (
    SELECT 
      id,
      created_at,
      last_activity_at,
      activity_score,
      first_message_at,
      last_message_at,
      -- real_join_date: earliest of first_message_at or created_at
      CASE 
        WHEN first_message_at IS NOT NULL AND first_message_at < created_at 
          THEN first_message_at
        ELSE created_at
      END as real_join_date,
      -- real_last_activity: latest of last_message_at or last_activity_at
      CASE
        WHEN last_message_at IS NOT NULL AND (last_activity_at IS NULL OR last_message_at > last_activity_at)
          THEN last_message_at
        ELSE last_activity_at
      END as real_last_activity
    FROM participant_activity
  ),
  categorized AS (
    SELECT 
      CASE
        -- Priority 1: Silent (no activity in 30 days OR never active and joined >7 days ago)
        WHEN real_last_activity IS NULL AND real_join_date < NOW() - INTERVAL '7 days'
          THEN 'silent'
        WHEN real_last_activity IS NOT NULL AND real_last_activity < NOW() - INTERVAL '30 days'
          THEN 'silent'
        
        -- Priority 2: Newcomers (joined <30 days ago AND not silent)
        WHEN real_join_date >= NOW() - INTERVAL '30 days'
          THEN 'newcomers'
        
        -- Priority 3: Core (activity_score >= 60)
        WHEN COALESCE(activity_score, 0) >= 60
          THEN 'core'
        
        -- Priority 4: Experienced (activity_score >= 30)
        WHEN COALESCE(activity_score, 0) >= 30
          THEN 'experienced'
        
        -- Default: other (doesn't fit any category)
        ELSE 'other'
      END as category
    FROM participants_enriched
  )
  SELECT 
    c.category,
    COUNT(*)::BIGINT as count,
    ROUND((COUNT(*)::NUMERIC / v_total_participants) * 100, 1) as percentage
  FROM categorized c
  GROUP BY c.category
  ORDER BY 
    CASE c.category
      WHEN 'core' THEN 1
      WHEN 'experienced' THEN 2
      WHEN 'newcomers' THEN 3
      WHEN 'silent' THEN 4
      ELSE 5
    END;
END;
$$;


ALTER FUNCTION "public"."get_engagement_breakdown"("p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_engagement_breakdown"("p_org_id" "uuid") IS 'Returns engagement breakdown including both Telegram and WhatsApp activity:
- Silent: no activity >30d OR never active & joined >7d
- Newcomers: joined <30d (and not silent)
- Core: activity_score >= 60
- Experienced: activity_score >= 30';



CREATE OR REPLACE FUNCTION "public"."get_enriched_participants"("p_org_id" "uuid", "p_include_tags" boolean DEFAULT true) RETURNS TABLE("id" "uuid", "org_id" "uuid", "user_id" "uuid", "full_name" "text", "username" "text", "email" "text", "phone" "text", "bio" "text", "photo_url" "text", "tg_user_id" bigint, "tg_first_name" "text", "tg_last_name" "text", "participant_status" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "last_activity_at" timestamp with time zone, "enriched_at" timestamp with time zone, "interests" "text"[], "links" "jsonb", "first_message_at" timestamp with time zone, "last_message_at" timestamp with time zone, "message_count" bigint, "is_org_owner" boolean, "is_org_admin" boolean, "is_group_creator" boolean, "is_group_admin" boolean, "custom_title" "text", "tags" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH 
  -- Get org memberships (owner/admin)
  org_roles AS (
    SELECT m.user_id, m.role
    FROM memberships m
    WHERE m.org_id = p_org_id AND m.role IN ('owner', 'admin')
  ),
  
  -- Get telegram groups for this org
  org_groups AS (
    SELECT otg.tg_chat_id
    FROM org_telegram_groups otg
    WHERE otg.org_id = p_org_id
  ),
  
  -- Get telegram admins for org groups
  tg_admins AS (
    SELECT DISTINCT ON (tga.tg_user_id)
      tga.tg_user_id,
      tga.is_owner,
      tga.is_admin,
      tga.custom_title
    FROM telegram_group_admins tga
    WHERE tga.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND tga.expires_at > NOW()
    ORDER BY tga.tg_user_id, tga.is_owner DESC, tga.is_admin DESC
  ),
  
  -- Get message stats per participant (using aggregates, NOT loading all messages)
  msg_stats AS (
    SELECT 
      pm.participant_id,
      MIN(pm.sent_at) as first_msg,
      MAX(pm.sent_at) as last_msg,
      COUNT(*) as msg_count
    FROM participant_messages pm
    WHERE pm.participant_id IN (
      SELECT p.id FROM participants p 
      WHERE p.org_id = p_org_id AND p.merged_into IS NULL
    )
    GROUP BY pm.participant_id
  ),
  
  -- Get WhatsApp stats
  wa_stats AS (
    SELECT 
      (ae.meta->>'participant_id')::UUID as participant_id,
      MIN(ae.created_at) as first_msg,
      MAX(ae.created_at) as last_msg,
      COUNT(*) as msg_count
    FROM activity_events ae
    WHERE ae.org_id = p_org_id 
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
    GROUP BY ae.meta->>'participant_id'
  ),
  
  -- Combine message stats
  combined_stats AS (
    SELECT 
      COALESCE(ms.participant_id, ws.participant_id) as participant_id,
      LEAST(ms.first_msg, ws.first_msg) as first_msg,
      GREATEST(ms.last_msg, ws.last_msg) as last_msg,
      COALESCE(ms.msg_count, 0) + COALESCE(ws.msg_count, 0) as msg_count
    FROM msg_stats ms
    FULL OUTER JOIN wa_stats ws ON ms.participant_id = ws.participant_id
  ),
  
  -- Get tags if requested
  participant_tags_agg AS (
    SELECT 
      pta.participant_id,
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', pt.id,
          'name', pt.name,
          'color', pt.color
        )
      ) as tags
    FROM participant_tag_assignments pta
    JOIN participant_tags pt ON pt.id = pta.tag_id
    WHERE p_include_tags
      AND pta.participant_id IN (
        SELECT p.id FROM participants p 
        WHERE p.org_id = p_org_id AND p.merged_into IS NULL
      )
    GROUP BY pta.participant_id
  )
  
  SELECT 
    p.id,
    p.org_id,
    p.user_id,
    p.full_name,
    p.username,
    p.email,
    p.phone,
    p.bio,
    p.photo_url,
    p.tg_user_id,
    p.tg_first_name,
    p.tg_last_name,
    -- Cast ENUM to TEXT to match function return type
    p.participant_status::TEXT as participant_status,
    p.created_at,
    p.updated_at,
    p.last_activity_at,
    -- Get enriched_at from custom_attributes JSON field
    (p.custom_attributes->>'last_enriched_at')::TIMESTAMPTZ as enriched_at,
    -- Use COALESCE for interests in case it's NULL
    COALESCE(p.interests, '{}'::TEXT[]) as interests,
    -- links column doesn't exist - return NULL
    NULL::JSONB as links,
    cs.first_msg as first_message_at,
    cs.last_msg as last_message_at,
    COALESCE(cs.msg_count, 0) as message_count,
    (r.role = 'owner') as is_org_owner,
    (r.role = 'admin') as is_org_admin,
    COALESCE(ta.is_owner, false) as is_group_creator,
    COALESCE(ta.is_admin, false) as is_group_admin,
    ta.custom_title,
    COALESCE(pt.tags, '[]'::JSONB) as tags
  FROM participants p
  LEFT JOIN org_roles r ON r.user_id = p.user_id
  LEFT JOIN tg_admins ta ON ta.tg_user_id = p.tg_user_id
  LEFT JOIN combined_stats cs ON cs.participant_id = p.id
  LEFT JOIN participant_tags_agg pt ON pt.participant_id = p.id
  WHERE p.org_id = p_org_id
    AND p.participant_status != 'excluded'
    AND p.merged_into IS NULL
  ORDER BY p.full_name NULLS LAST;
END;
$$;


ALTER FUNCTION "public"."get_enriched_participants"("p_org_id" "uuid", "p_include_tags" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_enriched_participants"("p_org_id" "uuid", "p_include_tags" boolean) IS 'Returns enriched participant data for an organization with message stats, tags, and roles. Fixed: participant_status ENUM cast to TEXT.';



CREATE OR REPLACE FUNCTION "public"."get_event_available_spots"("event_id_param" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  event_capacity INTEGER;
  registered_count INTEGER;
BEGIN
  -- Get event capacity
  SELECT capacity INTO event_capacity
  FROM public.events
  WHERE id = event_id_param;
  
  -- If no capacity limit, return NULL (unlimited)
  IF event_capacity IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Count registered participants
  SELECT COUNT(*) INTO registered_count
  FROM public.event_registrations
  WHERE event_id = event_id_param
    AND status = 'registered';
  
  -- Return available spots
  RETURN GREATEST(0, event_capacity - registered_count);
END;
$$;


ALTER FUNCTION "public"."get_event_available_spots"("event_id_param" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_event_available_spots"("event_id_param" "uuid") IS 'Get number of available spots for an event';



CREATE OR REPLACE FUNCTION "public"."get_event_payment_stats"("p_event_id" "uuid") RETURNS TABLE("total_registrations" bigint, "total_expected_amount" numeric, "total_paid_amount" numeric, "paid_count" bigint, "pending_count" bigint, "overdue_count" bigint, "payment_completion_percent" integer)
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_registrations,
    COALESCE(SUM(er.price), 0) AS total_expected_amount,
    COALESCE(SUM(er.paid_amount), 0) AS total_paid_amount,
    COUNT(*) FILTER (WHERE er.payment_status = 'paid')::BIGINT AS paid_count,
    COUNT(*) FILTER (WHERE er.payment_status = 'pending')::BIGINT AS pending_count,
    COUNT(*) FILTER (WHERE er.payment_status = 'overdue')::BIGINT AS overdue_count,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND((COUNT(*) FILTER (WHERE er.payment_status = 'paid')::DECIMAL / COUNT(*)) * 100)::INTEGER
      ELSE 0
    END AS payment_completion_percent
  FROM event_registrations er
  WHERE er.event_id = p_event_id
    AND er.status != 'cancelled'
    AND er.price IS NOT NULL
    AND er.price > 0;
END;
$$;


ALTER FUNCTION "public"."get_event_payment_stats"("p_event_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_event_payment_stats"("p_event_id" "uuid") IS 'Get payment statistics for an event';



CREATE OR REPLACE FUNCTION "public"."get_event_registered_count"("event_uuid" "uuid", "count_by_paid" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  result_count INTEGER;
BEGIN
  IF count_by_paid THEN
    -- Count only paid registrations (considering quantity)
    SELECT COALESCE(SUM(quantity), 0)::INTEGER INTO result_count
    FROM event_registrations
    WHERE event_id = event_uuid
      AND status = 'registered'
      AND payment_status = 'paid';
  ELSE
    -- Count all registered (considering quantity)
    SELECT COALESCE(SUM(quantity), 0)::INTEGER INTO result_count
    FROM event_registrations
    WHERE event_id = event_uuid
      AND status = 'registered';
  END IF;
  
  RETURN result_count;
END;
$$;


ALTER FUNCTION "public"."get_event_registered_count"("event_uuid" "uuid", "count_by_paid" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_event_registered_count"("event_uuid" "uuid", "count_by_paid" boolean) IS 'Returns count of registered participants for an event, optionally counting only paid registrations. Includes quantity multiplier.';



CREATE OR REPLACE FUNCTION "public"."get_inactive_newcomers"("p_org_id" "uuid", "p_days_since_first" integer DEFAULT 14) RETURNS TABLE("participant_id" "uuid", "full_name" "text", "username" "text", "created_at" timestamp with time zone, "days_since_join" integer, "activity_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH 
  -- Telegram activity
  telegram_activity AS (
    SELECT 
      ae.tg_user_id,
      MIN(ae.created_at) as first_activity_date,
      COUNT(*) as activity_count
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.event_type IN ('message', 'join')
      AND ae.tg_user_id IS NOT NULL
    GROUP BY ae.tg_user_id
  ),
  -- WhatsApp activity (by participant_id)
  whatsapp_activity AS (
    SELECT 
      (ae.meta->>'participant_id')::UUID as participant_id,
      MIN(ae.created_at) as first_activity_date,
      COUNT(*) as activity_count
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
    GROUP BY (ae.meta->>'participant_id')::UUID
  ),
  -- Participants who are ACTUALLY in groups (critical filter)
  participants_with_groups AS (
    SELECT DISTINCT pg.participant_id
    FROM participant_groups pg
    JOIN participants p ON p.id = pg.participant_id
    WHERE p.org_id = p_org_id
  ),
  -- Combined activity per participant
  participant_activity AS (
    SELECT 
      p.id as participant_id,
      -- Use earliest activity date from either source
      LEAST(
        COALESCE(ta.first_activity_date, wa.first_activity_date),
        COALESCE(wa.first_activity_date, ta.first_activity_date)
      ) as first_activity_date,
      -- Sum activity from both sources
      COALESCE(ta.activity_count, 0) + COALESCE(wa.activity_count, 0) as total_activity
    FROM participants p
    LEFT JOIN telegram_activity ta ON ta.tg_user_id = p.tg_user_id AND p.tg_user_id IS NOT NULL
    LEFT JOIN whatsapp_activity wa ON wa.participant_id = p.id
    WHERE p.org_id = p_org_id
  )
  SELECT 
    p.id as participant_id,
    p.full_name,
    p.username,
    p.created_at,
    EXTRACT(DAY FROM NOW() - COALESCE(pa.first_activity_date, p.created_at))::INTEGER as days_since_join,
    COALESCE(pa.total_activity, 0)::INTEGER as activity_count
  FROM participants p
  LEFT JOIN participant_activity pa ON pa.participant_id = p.id
  WHERE 
    p.org_id = p_org_id
    AND p.created_at > NOW() - INTERVAL '30 days' -- Joined in last 30 days
    AND (
      -- Either never had activity or had very little
      pa.total_activity IS NULL 
      OR pa.total_activity <= 2
    )
    AND COALESCE(pa.first_activity_date, p.created_at) < NOW() - (p_days_since_first || ' days')::INTERVAL
    AND p.source != 'bot'
    AND (p.participant_status IS NULL OR p.participant_status != 'excluded')
    -- CRITICAL: Must be in at least one group (via participant_groups table)
    AND EXISTS (
      SELECT 1 FROM participants_with_groups pwg 
      WHERE pwg.participant_id = p.id
    )
  ORDER BY p.created_at DESC
  LIMIT 20;
END;
$$;


ALTER FUNCTION "public"."get_inactive_newcomers"("p_org_id" "uuid", "p_days_since_first" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_inactive_newcomers"("p_org_id" "uuid", "p_days_since_first" integer) IS 'Возвращает неактивных новичков, которые состоят хотя бы в одной группе. WhatsApp-импортированные участники без групп исключены.';



CREATE OR REPLACE FUNCTION "public"."get_key_metrics"("p_org_id" "uuid", "p_period_days" integer DEFAULT 14, "p_tg_chat_id" bigint DEFAULT NULL::bigint) RETURNS TABLE("current_participants" integer, "current_messages" integer, "current_engagement_rate" numeric, "current_replies" integer, "current_reactions" integer, "current_reply_ratio" numeric, "previous_participants" integer, "previous_messages" integer, "previous_engagement_rate" numeric, "previous_replies" integer, "previous_reactions" integer, "previous_reply_ratio" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_current_start TIMESTAMPTZ;
  v_previous_start TIMESTAMPTZ;
  v_previous_end TIMESTAMPTZ;
  v_total_participants INT;
BEGIN
  v_current_start := NOW() - (p_period_days || ' days')::INTERVAL;
  v_previous_end := v_current_start;
  v_previous_start := v_previous_end - (p_period_days || ' days')::INTERVAL;
  
  -- Get TOTAL participants in org (not just Telegram group members)
  -- This is the base for engagement rate calculation
  SELECT COUNT(*) INTO v_total_participants
  FROM participants p
  WHERE p.org_id = p_org_id 
    AND p.merged_into IS NULL
    AND COALESCE(p.source, '') != 'bot';
  
  IF v_total_participants = 0 THEN
    v_total_participants := 1; -- Avoid division by zero
  END IF;
  
  RETURN QUERY
  WITH org_groups AS (
    SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = p_org_id
  ),
  -- Telegram activity (from org groups)
  telegram_current AS (
    SELECT 
      ae.tg_user_id,
      CASE WHEN ae.event_type = 'message' THEN 1 ELSE 0 END as is_message,
      CASE WHEN ae.reply_to_message_id IS NOT NULL 
              OR (ae.meta->'message'->>'reply_to_id') IS NOT NULL THEN 1 ELSE 0 END as is_reply,
      COALESCE(ae.reactions_count, 0) as reactions
    FROM activity_events ae
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.created_at >= v_current_start
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
  ),
  -- WhatsApp activity (tg_chat_id = 0)
  whatsapp_current AS (
    SELECT 
      (ae.meta->>'participant_id')::UUID as participant_id,
      1 as is_message,
      0 as is_reply,
      0 as reactions
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
      AND ae.created_at >= v_current_start
      AND p_tg_chat_id IS NULL  -- WhatsApp doesn't filter by chat_id
  ),
  current_stats AS (
    SELECT 
      -- Unique active participants (from both Telegram and WhatsApp)
      (
        SELECT COUNT(DISTINCT x.participant_id) FROM (
          -- Telegram participants (via tg_user_id -> participants mapping)
          SELECT p.id as participant_id
          FROM telegram_current tc
          JOIN participants p ON p.tg_user_id = tc.tg_user_id AND p.org_id = p_org_id
          WHERE tc.tg_user_id IS NOT NULL
          UNION
          -- WhatsApp participants (directly from meta)
          SELECT wc.participant_id
          FROM whatsapp_current wc
        ) x
      )::INT as participants,
      -- Total messages (Telegram + WhatsApp)
      (
        (SELECT COUNT(*) FROM telegram_current WHERE is_message = 1) +
        (SELECT COUNT(*) FROM whatsapp_current)
      )::INT as messages,
      -- Replies (Telegram only for now)
      (SELECT COUNT(*) FROM telegram_current WHERE is_reply = 1)::INT as replies,
      -- Reactions (Telegram only)
      (SELECT COALESCE(SUM(reactions), 0) FROM telegram_current)::BIGINT as reactions
  ),
  -- Previous period (same logic)
  telegram_previous AS (
    SELECT 
      ae.tg_user_id,
      CASE WHEN ae.event_type = 'message' THEN 1 ELSE 0 END as is_message,
      CASE WHEN ae.reply_to_message_id IS NOT NULL 
              OR (ae.meta->'message'->>'reply_to_id') IS NOT NULL THEN 1 ELSE 0 END as is_reply,
      COALESCE(ae.reactions_count, 0) as reactions
    FROM activity_events ae
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.created_at >= v_previous_start
      AND ae.created_at < v_previous_end
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
  ),
  whatsapp_previous AS (
    SELECT 
      (ae.meta->>'participant_id')::UUID as participant_id,
      1 as is_message,
      0 as is_reply,
      0 as reactions
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
      AND ae.created_at >= v_previous_start
      AND ae.created_at < v_previous_end
      AND p_tg_chat_id IS NULL
  ),
  previous_stats AS (
    SELECT 
      (
        SELECT COUNT(DISTINCT x.participant_id) FROM (
          SELECT p.id as participant_id
          FROM telegram_previous tp
          JOIN participants p ON p.tg_user_id = tp.tg_user_id AND p.org_id = p_org_id
          WHERE tp.tg_user_id IS NOT NULL
          UNION
          SELECT wp.participant_id
          FROM whatsapp_previous wp
        ) x
      )::INT as participants,
      (
        (SELECT COUNT(*) FROM telegram_previous WHERE is_message = 1) +
        (SELECT COUNT(*) FROM whatsapp_previous)
      )::INT as messages,
      (SELECT COUNT(*) FROM telegram_previous WHERE is_reply = 1)::INT as replies,
      (SELECT COALESCE(SUM(reactions), 0) FROM telegram_previous)::BIGINT as reactions
  )
  SELECT 
    cs.participants,
    cs.messages,
    ROUND((cs.participants::NUMERIC / v_total_participants::NUMERIC) * 100, 1) as engagement_rate,
    cs.replies,
    cs.reactions::INT,
    CASE WHEN cs.messages > 0 
      THEN ROUND((cs.replies::NUMERIC / cs.messages::NUMERIC) * 100, 1)
      ELSE 0 
    END as current_reply_ratio,
    ps.participants,
    ps.messages,
    ROUND((ps.participants::NUMERIC / v_total_participants::NUMERIC) * 100, 1) as engagement_rate_prev,
    ps.replies,
    ps.reactions::INT,
    CASE WHEN ps.messages > 0 
      THEN ROUND((ps.replies::NUMERIC / ps.messages::NUMERIC) * 100, 1)
      ELSE 0 
    END as previous_reply_ratio
  FROM current_stats cs, previous_stats ps;
END;
$$;


ALTER FUNCTION "public"."get_key_metrics"("p_org_id" "uuid", "p_period_days" integer, "p_tg_chat_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_key_metrics"("p_org_id" "uuid", "p_period_days" integer, "p_tg_chat_id" bigint) IS 'Returns key metrics including WhatsApp activity. Engagement = active/total participants.';



CREATE OR REPLACE FUNCTION "public"."get_newcomer_activation"("org_id_param" "uuid", "tg_chat_id_param" bigint, "hours_ago" integer DEFAULT 72, "timezone_name" "text" DEFAULT 'Europe/Moscow'::"text") RETURNS double precision
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  total_newcomers bigint;
  active_newcomers bigint;
BEGIN
  -- Получаем общее количество новых участников за последние 72 часа
  SELECT COUNT(DISTINCT tg_user_id) INTO total_newcomers
  FROM activity_events
  WHERE tg_chat_id = tg_chat_id_param
    AND org_id = org_id_param
    AND event_type = 'join'
    AND created_at >= (NOW() AT TIME ZONE timezone_name - (hours_ago || ' hours')::interval);

  -- Получаем количество новых участников, которые отправили хотя бы одно сообщение
  SELECT COUNT(DISTINCT ae.tg_user_id) INTO active_newcomers
  FROM activity_events ae
  WHERE ae.tg_chat_id = tg_chat_id_param
    AND ae.org_id = org_id_param
    AND ae.event_type = 'message'
    AND ae.created_at >= (NOW() AT TIME ZONE timezone_name - (hours_ago || ' hours')::interval)
    AND EXISTS (
      SELECT 1 FROM activity_events join_events
      WHERE join_events.tg_chat_id = tg_chat_id_param
        AND join_events.org_id = org_id_param
        AND join_events.tg_user_id = ae.tg_user_id
        AND join_events.event_type = 'join'
        AND join_events.created_at >= (NOW() AT TIME ZONE timezone_name - (hours_ago || ' hours')::interval)
    );

  -- Возвращаем процент активации
  RETURN CASE 
    WHEN total_newcomers > 0 THEN 
      ROUND((active_newcomers::float / total_newcomers::float) * 100, 2)
    ELSE 0
  END;
END;
$$;


ALTER FUNCTION "public"."get_newcomer_activation"("org_id_param" "uuid", "tg_chat_id_param" bigint, "hours_ago" integer, "timezone_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_openai_api_logs"("p_org_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 50) RETURNS TABLE("id" bigint, "org_id" "uuid", "request_type" "text", "model" "text", "prompt_tokens" integer, "completion_tokens" integer, "total_tokens" integer, "cost_usd" numeric, "cost_rub" numeric, "metadata" "jsonb", "created_at" timestamp with time zone, "created_by" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_is_superadmin BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.superadmins 
    WHERE superadmins.user_id = auth.uid()
  ) INTO v_is_superadmin;
  
  IF v_is_superadmin THEN
    RETURN QUERY
    SELECT l.id, l.org_id, l.request_type, l.model, l.prompt_tokens,
           l.completion_tokens, l.total_tokens, l.cost_usd, l.cost_rub,
           l.metadata, l.created_at, l.created_by
    FROM public.openai_api_logs l
    WHERE (p_org_id IS NULL OR l.org_id = p_org_id)
    ORDER BY l.created_at DESC
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT l.id, l.org_id, l.request_type, l.model, l.prompt_tokens,
           l.completion_tokens, l.total_tokens, l.cost_usd, l.cost_rub,
           l.metadata, l.created_at, l.created_by
    FROM public.openai_api_logs l
    WHERE EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = l.org_id AND m.user_id = auth.uid() AND m.role = 'owner'
    )
    AND (p_org_id IS NULL OR l.org_id = p_org_id)
    ORDER BY l.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_openai_api_logs"("p_org_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_openai_cost_summary"("p_org_id" "uuid" DEFAULT NULL::"uuid", "p_days" integer DEFAULT 30) RETURNS TABLE("total_requests" bigint, "total_tokens" bigint, "total_cost_usd" numeric, "total_cost_rub" numeric, "avg_cost_per_request_usd" numeric, "by_request_type" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(*) as req_count,
      SUM(logs.total_tokens) as tok_sum, -- ⭐ Explicit alias
      SUM(logs.cost_usd) as cost_usd_sum,
      SUM(logs.cost_rub) as cost_rub_sum,
      logs.request_type
    FROM public.openai_api_logs logs -- ⭐ Alias added
    WHERE (p_org_id IS NULL OR logs.org_id = p_org_id)
      AND logs.created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY logs.request_type
  )
  SELECT
    SUM(s.req_count)::BIGINT as total_requests,
    SUM(s.tok_sum)::BIGINT as total_tokens,
    SUM(s.cost_usd_sum)::NUMERIC as total_cost_usd,
    SUM(s.cost_rub_sum)::NUMERIC as total_cost_rub,
    CASE 
      WHEN SUM(s.req_count) > 0 THEN (SUM(s.cost_usd_sum) / SUM(s.req_count))::NUMERIC
      ELSE 0::NUMERIC
    END as avg_cost_per_request_usd,
    jsonb_object_agg(
      s.request_type, 
      jsonb_build_object(
        'requests', s.req_count,
        'tokens', s.tok_sum,
        'cost_usd', s.cost_usd_sum,
        'cost_rub', s.cost_rub_sum
      )
    ) as by_request_type
  FROM stats s;
END;
$$;


ALTER FUNCTION "public"."get_openai_cost_summary"("p_org_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_notifications"("p_org_id" "uuid", "p_limit" integer DEFAULT 50, "p_include_resolved" boolean DEFAULT true, "p_hours_back" integer DEFAULT 168) RETURNS TABLE("id" "uuid", "created_at" timestamp with time zone, "notification_type" "text", "source_type" "text", "title" "text", "description" "text", "severity" "text", "link_url" "text", "link_text" "text", "metadata" "jsonb", "resolved_at" timestamp with time zone, "resolved_by" "uuid", "resolved_by_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  -- Notification logs (AI-based alerts)
  SELECT 
    nl.id,
    nl.created_at,
    nl.rule_type::TEXT as notification_type,
    'notification_rule'::TEXT as source_type,
    -- Title includes group name for group-related notifications
    CASE nl.rule_type
      WHEN 'negative_discussion' THEN 
        'Негатив: ' || COALESCE(nl.trigger_context->>'group_title', 'группа')
      WHEN 'unanswered_question' THEN 
        'Вопрос: ' || COALESCE(nl.trigger_context->>'group_title', 'группа')
      WHEN 'group_inactive' THEN 
        'Неактивность: ' || COALESCE(nl.trigger_context->>'group_title', 'группа')
      ELSE nl.rule_type
    END as title,
    -- Description with more context
    CASE nl.rule_type
      WHEN 'negative_discussion' THEN
        COALESCE(nl.trigger_context->>'summary', 'Обнаружен негатив')
      WHEN 'unanswered_question' THEN
        COALESCE(nl.trigger_context->>'question_text', 'Вопрос без ответа')
      WHEN 'group_inactive' THEN
        'Группа «' || COALESCE(nl.trigger_context->>'group_title', '?') || 
        '» неактивна ' || COALESCE(nl.trigger_context->>'inactive_hours', '?') || ' ч.'
      ELSE
        COALESCE(nl.trigger_context->>'summary', 'Уведомление')
    END::TEXT as description,
    COALESCE(nl.trigger_context->>'severity', 'medium')::TEXT as severity,
    -- Generate proper Telegram link
    CASE 
      WHEN nl.trigger_context->>'last_message_id' IS NOT NULL THEN
        get_telegram_message_link(
          nl.trigger_context->>'group_id',
          (nl.trigger_context->>'last_message_id')::BIGINT
        )
      WHEN nl.trigger_context->>'group_id' IS NOT NULL THEN
        get_telegram_message_link(nl.trigger_context->>'group_id', NULL)
      ELSE
        CONCAT('/p/', p_org_id, '/telegram')
    END as link_url,
    COALESCE(nl.trigger_context->>'group_title', 'Группа')::TEXT as link_text,
    nl.trigger_context as metadata,
    nl.resolved_at,
    nl.resolved_by,
    nl.resolved_by_name
  FROM notification_logs nl
  WHERE nl.org_id = p_org_id
    AND nl.notification_status = 'sent'
    AND nl.created_at > NOW() - (p_hours_back || ' hours')::INTERVAL
    AND (p_include_resolved OR nl.resolved_at IS NULL)
  
  UNION ALL
  
  -- Attention zone items (churning participants, inactive newcomers)
  SELECT 
    azi.id,
    azi.created_at,
    azi.item_type::TEXT as notification_type,
    'attention_zone'::TEXT as source_type,
    CASE azi.item_type
      WHEN 'churning_participant' THEN 'Участник на грани оттока'
      WHEN 'inactive_newcomer' THEN 'Новичок без активности'
      WHEN 'critical_event' THEN 'Критичное событие'
      ELSE azi.item_type
    END as title,
    COALESCE(
      azi.item_data->>'full_name',
      azi.item_data->>'title',
      'Без имени'
    )::TEXT as description,
    CASE azi.item_type
      WHEN 'churning_participant' THEN 'warning'
      WHEN 'inactive_newcomer' THEN 'info'
      WHEN 'critical_event' THEN 'error'
      ELSE 'info'
    END as severity,
    CASE azi.item_type
      WHEN 'critical_event' THEN CONCAT('/p/', p_org_id, '/events/', azi.item_id)
      ELSE CONCAT('/p/', p_org_id, '/members/', azi.item_id)
    END as link_url,
    CASE azi.item_type
      WHEN 'critical_event' THEN COALESCE(azi.item_data->>'title', 'Событие')
      ELSE COALESCE(azi.item_data->>'full_name', 'Участник')
    END as link_text,
    azi.item_data as metadata,
    azi.resolved_at,
    azi.resolved_by,
    azi.resolved_by_name
  FROM attention_zone_items azi
  WHERE azi.org_id = p_org_id
    AND azi.created_at > NOW() - (p_hours_back || ' hours')::INTERVAL
    AND (p_include_resolved OR azi.resolved_at IS NULL)
  
  ORDER BY resolved_at NULLS FIRST, created_at DESC
  LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_org_notifications"("p_org_id" "uuid", "p_limit" integer, "p_include_resolved" boolean, "p_hours_back" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_org_notifications"("p_org_id" "uuid", "p_limit" integer, "p_include_resolved" boolean, "p_hours_back" integer) IS 'Returns unified notifications with proper Telegram links';



CREATE OR REPLACE FUNCTION "public"."get_participant_enrichment"("p_participant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_enrichment JSONB;
BEGIN
  SELECT custom_attributes
  INTO v_enrichment
  FROM public.participants
  WHERE id = p_participant_id;
  
  RETURN COALESCE(v_enrichment, '{}'::jsonb);
END;
$$;


ALTER FUNCTION "public"."get_participant_enrichment"("p_participant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_participant_enrichment"("p_participant_id" "uuid") IS 'Returns the enrichment data for a participant (custom_attributes JSONB).
Used by enrichment service and analytics.';



CREATE OR REPLACE FUNCTION "public"."get_participant_messages_stats"() RETURNS TABLE("total_messages" bigint, "total_participants" bigint, "total_size_mb" numeric, "oldest_message" timestamp with time zone, "newest_message" timestamp with time zone, "avg_message_length" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_messages,
    COUNT(DISTINCT participant_id)::BIGINT as total_participants,
    ROUND((pg_total_relation_size('participant_messages')::NUMERIC / 1024 / 1024), 2) as total_size_mb,
    MIN(sent_at) as oldest_message,
    MAX(sent_at) as newest_message,
    ROUND(AVG(chars_count), 0) as avg_message_length
  FROM participant_messages;
END;
$$;


ALTER FUNCTION "public"."get_participant_messages_stats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_participant_messages_stats"() IS 'Возвращает статистику по хранимым сообщениям';



CREATE OR REPLACE FUNCTION "public"."get_participant_tags"("p_participant_id" "uuid") RETURNS TABLE("tag_id" "uuid", "tag_name" "text", "tag_color" "text", "tag_description" "text", "assigned_at" timestamp with time zone, "assigned_by_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pt.id as tag_id,
    pt.name as tag_name,
    pt.color as tag_color,
    pt.description as tag_description,
    pta.assigned_at,
    COALESCE(p.full_name, p.username, 'Unknown') as assigned_by_name
  FROM participant_tag_assignments pta
  JOIN participant_tags pt ON pt.id = pta.tag_id
  LEFT JOIN participants p ON p.user_id = pta.assigned_by AND p.org_id = pt.org_id
  WHERE pta.participant_id = p_participant_id
  ORDER BY pta.assigned_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_participant_tags"("p_participant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_participant_tags"("p_participant_id" "uuid") IS 'Returns all tags assigned to a participant with metadata';



CREATE OR REPLACE FUNCTION "public"."get_participants_by_tag"("p_tag_id" "uuid") RETURNS TABLE("participant_id" "uuid", "full_name" "text", "username" "text", "photo_url" "text", "assigned_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as participant_id,
    p.full_name,
    p.username,
    p.photo_url,
    pta.assigned_at
  FROM participant_tag_assignments pta
  JOIN participants p ON p.id = pta.participant_id
  WHERE pta.tag_id = p_tag_id
    AND p.merged_into IS NULL
  ORDER BY pta.assigned_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_participants_by_tag"("p_tag_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_participants_by_tag"("p_tag_id" "uuid") IS 'Returns all participants assigned to a specific tag';



CREATE OR REPLACE FUNCTION "public"."get_participants_with_group_count"("org_id_param" "uuid") RETURNS TABLE("id" "uuid", "org_id" "uuid", "tg_user_id" bigint, "username" "text", "full_name" "text", "email" "text", "phone" "text", "created_at" timestamp with time zone, "last_activity_at" timestamp with time zone, "activity_score" integer, "risk_score" integer, "group_count" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.*,
    COALESCE(
      (SELECT COUNT(*) 
       FROM participant_groups pg 
       WHERE pg.participant_id = p.id AND pg.is_active = TRUE),
      0
    ) AS group_count
  FROM 
    participants p
  WHERE 
    p.org_id = org_id_param
  ORDER BY 
    p.last_activity_at DESC NULLS LAST,
    p.created_at DESC
  LIMIT 100;
END;
$$;


ALTER FUNCTION "public"."get_participants_with_group_count"("org_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_prime_time"("org_id_param" "uuid", "tg_chat_id_param" bigint, "days_ago" integer DEFAULT 7, "timezone_name" "text" DEFAULT 'Europe/Moscow'::"text") RETURNS TABLE("hour" integer, "message_count" bigint, "is_prime_time" boolean)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  WITH hourly_stats AS (
    SELECT 
      EXTRACT(HOUR FROM created_at AT TIME ZONE timezone_name)::integer as hour,
      COUNT(*) as message_count
    FROM activity_events
    WHERE tg_chat_id = tg_chat_id_param
      AND org_id = org_id_param
      AND event_type = 'message'
      AND created_at >= (NOW() AT TIME ZONE timezone_name - (days_ago || ' days')::interval)
    GROUP BY hour
  ),
  avg_count AS (
    SELECT AVG(message_count) as avg_messages
    FROM hourly_stats
  )
  SELECT 
    h.hour,
    COALESCE(hs.message_count, 0) as message_count,
    COALESCE(hs.message_count > avg_count.avg_messages, false) as is_prime_time
  FROM generate_series(0, 23) h(hour)
  LEFT JOIN hourly_stats hs ON h.hour = hs.hour
  CROSS JOIN avg_count
  ORDER BY h.hour;
END;
$$;


ALTER FUNCTION "public"."get_prime_time"("org_id_param" "uuid", "tg_chat_id_param" bigint, "days_ago" integer, "timezone_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_qualification_stats"() RETURNS TABLE("total_responses" bigint, "completed_count" bigint, "by_role" "jsonb", "by_community_type" "jsonb", "by_groups_count" "jsonb", "top_pain_points" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_responses,
    COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::BIGINT as completed_count,
    
    -- Count by role
    jsonb_object_agg(
      COALESCE(responses->>'role', 'unknown'),
      role_count
    ) as by_role,
    
    -- Count by community type
    jsonb_object_agg(
      COALESCE(responses->>'community_type', 'unknown'),
      community_count
    ) as by_community_type,
    
    -- Count by groups count
    jsonb_object_agg(
      COALESCE(responses->>'groups_count', 'unknown'),
      groups_count
    ) as by_groups_count,
    
    -- Top pain points
    '[]'::jsonb as top_pain_points
    
  FROM user_qualification_responses
  CROSS JOIN LATERAL (
    SELECT COUNT(*) as role_count
    FROM user_qualification_responses r2
    WHERE r2.responses->>'role' = user_qualification_responses.responses->>'role'
  ) roles
  CROSS JOIN LATERAL (
    SELECT COUNT(*) as community_count
    FROM user_qualification_responses r3
    WHERE r3.responses->>'community_type' = user_qualification_responses.responses->>'community_type'
  ) communities
  CROSS JOIN LATERAL (
    SELECT COUNT(*) as groups_count
    FROM user_qualification_responses r4
    WHERE r4.responses->>'groups_count' = user_qualification_responses.responses->>'groups_count'
  ) groups_stat;
END;
$$;


ALTER FUNCTION "public"."get_qualification_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_qualification_summary"() RETURNS TABLE("total_users" bigint, "completed_qualification" bigint, "completion_rate" numeric, "responses_by_field" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      COUNT(DISTINCT u.id) as total_users,
      COUNT(DISTINCT q.user_id) FILTER (WHERE q.completed_at IS NOT NULL) as completed
    FROM auth.users u
    LEFT JOIN user_qualification_responses q ON q.user_id = u.id
  ),
  field_stats AS (
    SELECT jsonb_build_object(
      'role', (
        SELECT jsonb_object_agg(val, cnt)
        FROM (
          SELECT responses->>'role' as val, COUNT(*) as cnt
          FROM user_qualification_responses
          WHERE responses->>'role' IS NOT NULL
          GROUP BY responses->>'role'
        ) r
      ),
      'community_type', (
        SELECT jsonb_object_agg(val, cnt)
        FROM (
          SELECT responses->>'community_type' as val, COUNT(*) as cnt
          FROM user_qualification_responses
          WHERE responses->>'community_type' IS NOT NULL
          GROUP BY responses->>'community_type'
        ) c
      ),
      'groups_count', (
        SELECT jsonb_object_agg(val, cnt)
        FROM (
          SELECT responses->>'groups_count' as val, COUNT(*) as cnt
          FROM user_qualification_responses
          WHERE responses->>'groups_count' IS NOT NULL
          GROUP BY responses->>'groups_count'
        ) g
      ),
      'pain_points', (
        SELECT jsonb_object_agg(val, cnt)
        FROM (
          SELECT pp.val, COUNT(*) as cnt
          FROM user_qualification_responses,
               jsonb_array_elements_text(responses->'pain_points') as pp(val)
          GROUP BY pp.val
        ) p
      )
    ) as stats
  )
  SELECT 
    s.total_users,
    s.completed,
    CASE WHEN s.total_users > 0 
         THEN ROUND((s.completed::NUMERIC / s.total_users) * 100, 1)
         ELSE 0 
    END as completion_rate,
    f.stats as responses_by_field
  FROM stats s, field_stats f;
END;
$$;


ALTER FUNCTION "public"."get_qualification_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_reactions_replies_stats"("p_org_id" "uuid", "p_period_days" integer DEFAULT 14, "p_tg_chat_id" bigint DEFAULT NULL::bigint) RETURNS TABLE("current_replies" bigint, "current_reactions" bigint, "current_messages" bigint, "current_reply_ratio" numeric, "previous_replies" bigint, "previous_reactions" bigint, "previous_messages" bigint, "previous_reply_ratio" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_current_start TIMESTAMPTZ;
  v_previous_start TIMESTAMPTZ;
  v_previous_end TIMESTAMPTZ;
BEGIN
  v_current_start := NOW() - (p_period_days || ' days')::INTERVAL;
  v_previous_end := v_current_start;
  v_previous_start := v_previous_end - (p_period_days || ' days')::INTERVAL;
  
  RETURN QUERY
  WITH org_groups AS (
    SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = p_org_id
  ),
  current_stats AS (
    SELECT 
      -- Count replies using reply_to_message_id column (primary)
      -- Fallback to meta->'message'->>'reply_to_id' for old imports
      COUNT(*) FILTER (
        WHERE reply_to_message_id IS NOT NULL 
        OR (meta->'message'->>'reply_to_id') IS NOT NULL
      ) as replies,
      COALESCE(SUM(reactions_count), 0) as reactions,
      COUNT(*) FILTER (WHERE event_type = 'message') as messages
    FROM activity_events
    WHERE tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND created_at >= v_current_start
      AND (p_tg_chat_id IS NULL OR tg_chat_id = p_tg_chat_id)
  ),
  previous_stats AS (
    SELECT 
      COUNT(*) FILTER (
        WHERE reply_to_message_id IS NOT NULL 
        OR (meta->'message'->>'reply_to_id') IS NOT NULL
      ) as replies,
      COALESCE(SUM(reactions_count), 0) as reactions,
      COUNT(*) FILTER (WHERE event_type = 'message') as messages
    FROM activity_events
    WHERE tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND created_at >= v_previous_start
      AND created_at < v_previous_end
      AND (p_tg_chat_id IS NULL OR tg_chat_id = p_tg_chat_id)
  )
  SELECT 
    cs.replies::BIGINT,
    cs.reactions::BIGINT,
    cs.messages::BIGINT,
    CASE WHEN cs.messages > 0 
      THEN ROUND((cs.replies::NUMERIC / cs.messages::NUMERIC), 4)
      ELSE 0 
    END as current_reply_ratio,
    ps.replies::BIGINT,
    ps.reactions::BIGINT,
    ps.messages::BIGINT,
    CASE WHEN ps.messages > 0 
      THEN ROUND((ps.replies::NUMERIC / ps.messages::NUMERIC), 4)
      ELSE 0 
    END as previous_reply_ratio
  FROM current_stats cs, previous_stats ps;
END;
$$;


ALTER FUNCTION "public"."get_reactions_replies_stats"("p_org_id" "uuid", "p_period_days" integer, "p_tg_chat_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_reactions_replies_stats"("p_org_id" "uuid", "p_period_days" integer, "p_tg_chat_id" bigint) IS 'Returns reactions/replies stats using reply_to_message_id column + meta fallback';



CREATE OR REPLACE FUNCTION "public"."get_risk_radar"("org_id_param" "uuid", "tg_chat_id_param" bigint, "min_risk_score" double precision DEFAULT 70, "limit_param" integer DEFAULT 10, "timezone_name" "text" DEFAULT 'Europe/Moscow'::"text") RETURNS TABLE("tg_user_id" bigint, "username" "text", "risk_score" double precision, "last_activity" timestamp without time zone, "message_count" integer)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  WITH user_stats AS (
    SELECT 
      ae.tg_user_id,
      MAX(ae.meta->>'user'->>'username') as username,
      MAX(ae.created_at) as last_activity,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as message_count
    FROM activity_events ae
    WHERE ae.tg_chat_id = tg_chat_id_param
      AND ae.org_id = org_id_param
      AND ae.created_at >= (NOW() AT TIME ZONE timezone_name - '30 days'::interval)
    GROUP BY ae.tg_user_id
  )
  SELECT 
    us.tg_user_id,
    us.username,
    get_risk_score(org_id_param, tg_chat_id_param, us.tg_user_id) as risk_score,
    us.last_activity,
    us.message_count
  FROM user_stats us
  WHERE get_risk_score(org_id_param, tg_chat_id_param, us.tg_user_id) >= min_risk_score
  ORDER BY risk_score DESC
  LIMIT limit_param;
END;
$$;


ALTER FUNCTION "public"."get_risk_radar"("org_id_param" "uuid", "tg_chat_id_param" bigint, "min_risk_score" double precision, "limit_param" integer, "timezone_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_risk_score"("org_id_param" "uuid", "tg_chat_id_param" bigint, "user_id_param" bigint, "days_ago" integer DEFAULT 30, "timezone_name" "text" DEFAULT 'Europe/Moscow'::"text") RETURNS double precision
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  last_activity timestamp;
  message_count integer;
  reply_count integer;
  mention_count integer;
  risk_score float;
BEGIN
  -- Получаем дату последней активности
  SELECT MAX(created_at) INTO last_activity
  FROM activity_events
  WHERE tg_chat_id = tg_chat_id_param
    AND org_id = org_id_param
    AND tg_user_id = user_id_param
    AND event_type = 'message';

  -- Получаем количество сообщений за период
  SELECT COUNT(*) INTO message_count
  FROM activity_events
  WHERE tg_chat_id = tg_chat_id_param
    AND org_id = org_id_param
    AND tg_user_id = user_id_param
    AND event_type = 'message'
    AND created_at >= (NOW() AT TIME ZONE timezone_name - (days_ago || ' days')::interval);

  -- Получаем количество ответов на сообщения пользователя
  SELECT COUNT(*) INTO reply_count
  FROM activity_events
  WHERE tg_chat_id = tg_chat_id_param
    AND org_id = org_id_param
    AND event_type = 'message'
    AND reply_to_message_id IN (
      SELECT message_id
      FROM activity_events
      WHERE tg_chat_id = tg_chat_id_param
        AND org_id = org_id_param
        AND tg_user_id = user_id_param
        AND created_at >= (NOW() AT TIME ZONE timezone_name - (days_ago || ' days')::interval)
    );

  -- Получаем количество упоминаний пользователя
  SELECT COUNT(*) INTO mention_count
  FROM activity_events
  WHERE tg_chat_id = tg_chat_id_param
    AND org_id = org_id_param
    AND event_type = 'message'
    AND meta->>'mentions' ? user_id_param::text
    AND created_at >= (NOW() AT TIME ZONE timezone_name - (days_ago || ' days')::interval);

  -- Вычисляем риск оттока (0-100)
  risk_score := CASE
    WHEN last_activity IS NULL THEN 100  -- Пользователь никогда не писал
    WHEN last_activity < (NOW() AT TIME ZONE timezone_name - '14 days'::interval) THEN 80  -- Не писал более 14 дней
    WHEN message_count = 0 THEN 70  -- Нет сообщений за период
    ELSE
      50 * (1 - LEAST(message_count::float / 10, 1)) +  -- До 50 баллов за количество сообщений
      25 * (1 - LEAST((reply_count + mention_count)::float / 5, 1)) +  -- До 25 баллов за взаимодействия
      25 * (EXTRACT(EPOCH FROM (NOW() AT TIME ZONE timezone_name - last_activity)) / (86400 * 14))  -- До 25 баллов за давность последнего сообщения
  END;

  RETURN ROUND(GREATEST(LEAST(risk_score, 100), 0)::numeric, 2);
END;
$$;


ALTER FUNCTION "public"."get_risk_score"("org_id_param" "uuid", "tg_chat_id_param" bigint, "user_id_param" bigint, "days_ago" integer, "timezone_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_silent_rate"("org_id_param" "uuid", "tg_chat_id_param" bigint, "days_ago" integer DEFAULT 7, "timezone_name" "text" DEFAULT 'Europe/Moscow'::"text") RETURNS double precision
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  total_members bigint;
  active_members bigint;
BEGIN
  -- Получаем общее количество участников
  SELECT member_count INTO total_members
  FROM telegram_groups
  WHERE tg_chat_id = tg_chat_id_param AND org_id = org_id_param;

  -- Получаем количество активных участников (отправивших хотя бы одно сообщение)
  SELECT COUNT(DISTINCT tg_user_id) INTO active_members
  FROM activity_events
  WHERE tg_chat_id = tg_chat_id_param
    AND org_id = org_id_param
    AND event_type = 'message'
    AND created_at >= (NOW() AT TIME ZONE timezone_name - (days_ago || ' days')::interval);

  -- Возвращаем процент "молчунов"
  RETURN CASE 
    WHEN total_members > 0 THEN 
      ROUND(((total_members - COALESCE(active_members, 0))::float / total_members::float) * 100, 2)
    ELSE 0
  END;
END;
$$;


ALTER FUNCTION "public"."get_silent_rate"("org_id_param" "uuid", "tg_chat_id_param" bigint, "days_ago" integer, "timezone_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tag_stats"("p_org_id" "uuid") RETURNS TABLE("tag_id" "uuid", "tag_name" "text", "tag_color" "text", "participant_count" bigint, "last_used" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pt.id as tag_id,
    pt.name as tag_name,
    pt.color as tag_color,
    COUNT(DISTINCT pta.participant_id) as participant_count,
    MAX(pta.assigned_at) as last_used
  FROM participant_tags pt
  LEFT JOIN participant_tag_assignments pta ON pta.tag_id = pt.id
  WHERE pt.org_id = p_org_id
  GROUP BY pt.id, pt.name, pt.color
  ORDER BY participant_count DESC, pt.name ASC;
END;
$$;


ALTER FUNCTION "public"."get_tag_stats"("p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_tag_stats"("p_org_id" "uuid") IS 'Returns usage statistics for all tags in an organization';



CREATE OR REPLACE FUNCTION "public"."get_telegram_group"("p_chat_id" bigint) RETURNS TABLE("id" integer, "org_id" "uuid", "analytics_enabled" boolean)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT g.id, g.org_id, g.analytics_enabled
  FROM telegram_groups g
  WHERE g.tg_chat_id = p_chat_id;
END;
$$;


ALTER FUNCTION "public"."get_telegram_group"("p_chat_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_telegram_health_status"("p_tg_chat_id" bigint) RETURNS TABLE("status" "text", "last_success" timestamp with time zone, "last_failure" timestamp with time zone, "failure_count_24h" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN MAX(CASE WHEN event_type LIKE '%_success' THEN created_at END) > 
           MAX(CASE WHEN event_type LIKE '%_failure' THEN created_at END)
      THEN 'healthy'::TEXT
      ELSE 'unhealthy'::TEXT
    END AS status,
    MAX(CASE WHEN event_type LIKE '%_success' THEN created_at END) AS last_success,
    MAX(CASE WHEN event_type LIKE '%_failure' THEN created_at END) AS last_failure,
    COUNT(*) FILTER (
      WHERE event_type LIKE '%_failure' 
      AND created_at > NOW() - INTERVAL '24 hours'
    )::INTEGER AS failure_count_24h
  FROM public.telegram_health_events
  WHERE tg_chat_id = p_tg_chat_id
  AND created_at > NOW() - INTERVAL '7 days';
END;
$$;


ALTER FUNCTION "public"."get_telegram_health_status"("p_tg_chat_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_telegram_message_link"("p_chat_id" "text", "p_message_id" bigint DEFAULT NULL::bigint) RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  v_chat_id_clean TEXT;
BEGIN
  -- Remove -100 prefix for supergroups
  -- e.g., -1003569294766 -> 3569294766
  IF p_chat_id LIKE '-100%' THEN
    v_chat_id_clean := SUBSTRING(p_chat_id FROM 5);
  ELSIF p_chat_id LIKE '-%' THEN
    -- Regular groups (shouldn't have public links, but try anyway)
    v_chat_id_clean := SUBSTRING(p_chat_id FROM 2);
  ELSE
    v_chat_id_clean := p_chat_id;
  END IF;
  
  IF p_message_id IS NOT NULL THEN
    -- Link to specific message
    RETURN 'https://t.me/c/' || v_chat_id_clean || '/' || p_message_id::TEXT;
  ELSE
    -- Link to group (last message)
    RETURN 'https://t.me/c/' || v_chat_id_clean;
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_telegram_message_link"("p_chat_id" "text", "p_message_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_telegram_message_link"("p_chat_id" "text", "p_message_id" bigint) IS 'Generates a t.me link to a Telegram message or group';



CREATE OR REPLACE FUNCTION "public"."get_top_contributors"("p_org_id" "uuid", "p_limit" integer DEFAULT 10, "p_tg_chat_id" bigint DEFAULT NULL::bigint) RETURNS TABLE("participant_id" "uuid", "tg_user_id" bigint, "full_name" "text", "tg_first_name" "text", "tg_last_name" "text", "username" "text", "activity_count" integer, "message_count" integer, "reaction_count" integer, "rank" integer, "rank_change" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH org_groups AS (
    SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = p_org_id
  ),
  -- Telegram activity (from org groups)
  telegram_current AS (
    SELECT 
      ae.tg_user_id,
      p.id as participant_id,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as messages,
      COALESCE(SUM(ae.reactions_count), 0) as reactions
    FROM activity_events ae
    LEFT JOIN participants p ON p.tg_user_id = ae.tg_user_id AND p.org_id = p_org_id
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.tg_user_id IS NOT NULL
      AND ae.created_at >= DATE_TRUNC('week', NOW())
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
    GROUP BY ae.tg_user_id, p.id
  ),
  -- WhatsApp activity (tg_chat_id = 0, participant_id in meta)
  whatsapp_current AS (
    SELECT 
      (ae.meta->>'participant_id')::UUID as participant_id,
      COUNT(*) as messages
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
      AND ae.created_at >= DATE_TRUNC('week', NOW())
      AND p_tg_chat_id IS NULL  -- WhatsApp doesn't have chat_id filtering
    GROUP BY (ae.meta->>'participant_id')::UUID
  ),
  -- Combine Telegram and WhatsApp for current week
  current_week AS (
    SELECT 
      COALESCE(tc.participant_id, wc.participant_id) as participant_id,
      tc.tg_user_id,
      (COALESCE(tc.messages, 0) + COALESCE(wc.messages, 0))::INT as messages,
      COALESCE(tc.reactions, 0)::INT as reactions,
      (COALESCE(tc.messages, 0) + COALESCE(wc.messages, 0) + COALESCE(tc.reactions, 0))::INT as score
    FROM telegram_current tc
    FULL OUTER JOIN whatsapp_current wc ON tc.participant_id = wc.participant_id
    WHERE COALESCE(tc.participant_id, wc.participant_id) IS NOT NULL
  ),
  -- Previous week Telegram
  telegram_previous AS (
    SELECT 
      p.id as participant_id,
      ae.tg_user_id,
      COUNT(*) FILTER (WHERE ae.event_type = 'message') as messages,
      COALESCE(SUM(ae.reactions_count), 0) as reactions
    FROM activity_events ae
    LEFT JOIN participants p ON p.tg_user_id = ae.tg_user_id AND p.org_id = p_org_id
    WHERE ae.tg_chat_id IN (SELECT tg_chat_id FROM org_groups)
      AND ae.tg_user_id IS NOT NULL
      AND ae.created_at >= DATE_TRUNC('week', NOW()) - INTERVAL '7 days'
      AND ae.created_at < DATE_TRUNC('week', NOW())
      AND (p_tg_chat_id IS NULL OR ae.tg_chat_id = p_tg_chat_id)
    GROUP BY ae.tg_user_id, p.id
  ),
  -- Previous week WhatsApp
  whatsapp_previous AS (
    SELECT 
      (ae.meta->>'participant_id')::UUID as participant_id,
      COUNT(*) as messages
    FROM activity_events ae
    WHERE ae.org_id = p_org_id
      AND ae.tg_chat_id = 0
      AND ae.event_type = 'message'
      AND ae.meta->>'participant_id' IS NOT NULL
      AND ae.created_at >= DATE_TRUNC('week', NOW()) - INTERVAL '7 days'
      AND ae.created_at < DATE_TRUNC('week', NOW())
      AND p_tg_chat_id IS NULL
    GROUP BY (ae.meta->>'participant_id')::UUID
  ),
  -- Combine for previous week
  previous_week AS (
    SELECT 
      COALESCE(tp.participant_id, wp.participant_id) as participant_id,
      tp.tg_user_id,
      (COALESCE(tp.messages, 0) + COALESCE(wp.messages, 0) + COALESCE(tp.reactions, 0))::INT as score,
      ROW_NUMBER() OVER (ORDER BY (COALESCE(tp.messages, 0) + COALESCE(wp.messages, 0) + COALESCE(tp.reactions, 0)) DESC) as prev_rank
    FROM telegram_previous tp
    FULL OUTER JOIN whatsapp_previous wp ON tp.participant_id = wp.participant_id
    WHERE COALESCE(tp.participant_id, wp.participant_id) IS NOT NULL
  ),
  ranked_current AS (
    SELECT 
      cw.*,
      ROW_NUMBER() OVER (ORDER BY cw.score DESC) as curr_rank
    FROM current_week cw
  ),
  combined AS (
    SELECT 
      rc.participant_id,
      rc.tg_user_id,
      rc.score as activity_count,
      rc.messages as message_count,
      rc.reactions as reaction_count,
      rc.curr_rank::INT as rank,
      COALESCE(rc.curr_rank::INT - pw.prev_rank::INT, 0) as rank_change
    FROM ranked_current rc
    LEFT JOIN previous_week pw ON pw.participant_id = rc.participant_id
    WHERE rc.curr_rank <= p_limit
    ORDER BY rc.curr_rank ASC
  ),
  with_participants AS (
    SELECT DISTINCT ON (c.participant_id)
      c.participant_id,
      c.tg_user_id,
      c.rank,
      c.rank_change,
      c.activity_count,
      c.message_count,
      c.reaction_count,
      p.full_name,
      p.tg_first_name,
      p.tg_last_name,
      p.username
    FROM combined c
    LEFT JOIN participants p ON p.id = c.participant_id
    ORDER BY c.participant_id, p.created_at ASC NULLS LAST
  )
  SELECT 
    wp.participant_id,
    wp.tg_user_id,
    wp.full_name,
    wp.tg_first_name,
    wp.tg_last_name,
    wp.username,
    wp.activity_count,
    wp.message_count,
    wp.reaction_count,
    wp.rank,
    wp.rank_change
  FROM with_participants wp
  ORDER BY wp.rank ASC;
END;
$$;


ALTER FUNCTION "public"."get_top_contributors"("p_org_id" "uuid", "p_limit" integer, "p_tg_chat_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_top_contributors"("p_org_id" "uuid", "p_limit" integer, "p_tg_chat_id" bigint) IS 'Returns top contributors including Telegram and WhatsApp activity';



CREATE OR REPLACE FUNCTION "public"."get_user_by_email"("user_email" character varying) RETURNS TABLE("id" "uuid", "email" character varying, "email_confirmed_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone, "created_at" timestamp with time zone, "raw_user_meta_data" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.email,
    u.email_confirmed_at,
    u.last_sign_in_at,
    u.created_at,
    u.raw_user_meta_data
  FROM auth.users u
  WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(user_email));
END;
$$;


ALTER FUNCTION "public"."get_user_by_email"("user_email" character varying) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_by_email"("user_email" character varying) IS 'Find auth.users data by email. Used by superadmin panel for adding superadmins.';



CREATE OR REPLACE FUNCTION "public"."get_user_display_name"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_name TEXT;
BEGIN
  -- 1. Try auth.users raw_user_meta_data
  SELECT 
    COALESCE(
      raw_user_meta_data->>'full_name',
      raw_user_meta_data->>'name',
      SPLIT_PART(email, '@', 1)
    )
  INTO v_name
  FROM auth.users
  WHERE id = p_user_id;
  
  IF v_name IS NOT NULL AND v_name != '' THEN
    RETURN v_name;
  END IF;
  
  -- 2. Try user_telegram_accounts (verified Telegram name)
  SELECT 
    COALESCE(
      CONCAT(telegram_first_name, ' ', telegram_last_name),
      telegram_username,
      telegram_first_name
    )
  INTO v_name
  FROM user_telegram_accounts
  WHERE user_id = p_user_id
    AND is_verified = true
  ORDER BY verified_at DESC
  LIMIT 1;
  
  IF v_name IS NOT NULL AND TRIM(v_name) != '' THEN
    RETURN TRIM(v_name);
  END IF;
  
  -- 3. Fallback to email
  SELECT email INTO v_name
  FROM auth.users
  WHERE id = p_user_id;
  
  RETURN COALESCE(v_name, 'Пользователь');
END;
$$;


ALTER FUNCTION "public"."get_user_display_name"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_display_name"("p_user_id" "uuid") IS 'Возвращает отображаемое имя пользователя из доступных источников';



CREATE OR REPLACE FUNCTION "public"."get_user_email_info"("p_user_id" "uuid") RETURNS TABLE("email" "text", "email_confirmed" boolean, "email_confirmed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.email::TEXT,
    (u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL)::BOOLEAN,
    u.email_confirmed_at
  FROM auth.users u
  WHERE u.id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."get_user_email_info"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Query auth.users table (requires SECURITY DEFINER to access)
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE LOWER(email) = LOWER(p_email)
  LIMIT 1;
  
  RETURN v_user_id;
END;
$$;


ALTER FUNCTION "public"."get_user_id_by_email"("p_email" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") IS 'Returns Supabase user ID for a given email address. Used to link NextAuth sessions to existing Supabase users.';



CREATE OR REPLACE FUNCTION "public"."get_user_role_in_org"("p_user_id" "uuid", "p_org_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- 1. Проверяем memberships (owner/admin/member)
  SELECT role INTO v_role
  FROM memberships
  WHERE user_id = p_user_id AND org_id = p_org_id
  LIMIT 1;
  
  IF v_role IN ('owner', 'admin', 'member') THEN
    RETURN v_role;
  END IF;
  
  -- 2. Проверяем участие через Telegram-группы
  PERFORM 1
  FROM participants p
  JOIN participant_groups pg ON pg.participant_id = p.id
  JOIN telegram_groups tg ON tg.tg_chat_id = pg.tg_group_id
  JOIN user_telegram_accounts uta ON uta.telegram_user_id = p.tg_user_id AND uta.org_id = tg.org_id
  WHERE uta.user_id = p_user_id
    AND tg.org_id = p_org_id
    AND p.participant_status IN ('participant', 'event_attendee')
  LIMIT 1;
  
  IF FOUND THEN
    RETURN 'member';
  END IF;
  
  -- 3. Проверяем участие через события (регистрация на события организации)
  PERFORM 1
  FROM user_telegram_accounts uta
  JOIN participants p ON p.tg_user_id = uta.telegram_user_id AND p.org_id = uta.org_id
  JOIN event_registrations er ON er.participant_id = p.id
  JOIN events e ON e.id = er.event_id
  WHERE uta.user_id = p_user_id
    AND e.org_id = p_org_id
    AND p.participant_status IN ('participant', 'event_attendee')
    AND er.status = 'registered'
  LIMIT 1;
  
  IF FOUND THEN
    RETURN 'member';
  END IF;
  
  -- 4. Нет доступа
  RETURN 'guest';
END;
$$;


ALTER FUNCTION "public"."get_user_role_in_org"("p_user_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_role_in_org"("p_user_id" "uuid", "p_org_id" "uuid") IS 'Возвращает роль пользователя в организации: owner, admin, member или guest. Проверяет memberships, участие в Telegram-группах и регистрацию на события.';



CREATE OR REPLACE FUNCTION "public"."get_user_telegram_id"("p_user_id" "uuid") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_tg_user_id BIGINT;
BEGIN
  -- First try user_telegram_accounts (primary source)
  SELECT telegram_user_id INTO v_tg_user_id
  FROM user_telegram_accounts
  WHERE user_id = p_user_id
    AND is_verified = true
  ORDER BY verified_at DESC NULLS LAST
  LIMIT 1;
  
  -- Fallback to auth.users raw_user_meta_data
  IF v_tg_user_id IS NULL THEN
    SELECT (raw_user_meta_data->>'tg_user_id')::BIGINT INTO v_tg_user_id
    FROM auth.users
    WHERE id = p_user_id;
  END IF;
  
  -- Last resort: check raw_user_meta_data for telegram_user_id
  IF v_tg_user_id IS NULL THEN
    SELECT (raw_user_meta_data->>'telegram_user_id')::BIGINT INTO v_tg_user_id
    FROM auth.users
    WHERE id = p_user_id;
  END IF;
  
  RETURN v_tg_user_id;
END;
$$;


ALTER FUNCTION "public"."get_user_telegram_id"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_telegram_id"("p_user_id" "uuid") IS 'Get telegram user ID from auth.users metadata';



CREATE OR REPLACE FUNCTION "public"."get_users_by_ids"("user_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "email" character varying, "email_confirmed_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone, "created_at" timestamp with time zone, "raw_user_meta_data" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.email,
    u.email_confirmed_at,
    u.last_sign_in_at,
    u.created_at,
    u.raw_user_meta_data
  FROM auth.users u
  WHERE u.id = ANY(user_ids);
END;
$$;


ALTER FUNCTION "public"."get_users_by_ids"("user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_attention_item_shown"("p_org_id" "uuid", "p_item_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE attention_zone_items
  SET 
    times_shown = times_shown + 1,
    last_shown_at = NOW()
  WHERE org_id = p_org_id
    AND item_id = ANY(p_item_ids);
END;
$$;


ALTER FUNCTION "public"."increment_attention_item_shown"("p_org_id" "uuid", "p_item_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_counter"("row_id" bigint) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  current_count INTEGER;
BEGIN
  -- Получаем текущее значение
  SELECT member_count INTO current_count
  FROM telegram_groups
  WHERE tg_chat_id = row_id;
  
  -- Если значение NULL, устанавливаем в 1
  IF current_count IS NULL THEN
    RETURN 1;
  ELSE
    RETURN current_count + 1;
  END IF;
END;
$$;


ALTER FUNCTION "public"."increment_counter"("row_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_notification_trigger_count"("p_rule_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE notification_rules
  SET trigger_count = trigger_count + 1
  WHERE id = p_rule_id;
END;
$$;


ALTER FUNCTION "public"."increment_notification_trigger_count"("p_rule_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."increment_notification_trigger_count"("p_rule_id" "uuid") IS 'Atomically increment notification rule trigger count';



CREATE OR REPLACE FUNCTION "public"."increment_reactions_count"("p_org_id" "uuid", "p_tg_chat_id" bigint, "p_message_id" bigint, "p_delta" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Update reactions_count for the original message
  UPDATE activity_events
  SET reactions_count = GREATEST(0, reactions_count + p_delta)
  WHERE org_id = p_org_id
    AND tg_chat_id = p_tg_chat_id
    AND message_id = p_message_id
    AND event_type = 'message';
    
  -- If no rows updated, log warning (message not found)
  IF NOT FOUND THEN
    RAISE NOTICE 'Message not found for reaction update: org=%, chat=%, msg=%', p_org_id, p_tg_chat_id, p_message_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."increment_reactions_count"("p_org_id" "uuid", "p_tg_chat_id" bigint, "p_message_id" bigint, "p_delta" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."increment_reactions_count"("p_org_id" "uuid", "p_tg_chat_id" bigint, "p_message_id" bigint, "p_delta" integer) IS 'Increments or decrements reactions_count on a message';



CREATE OR REPLACE FUNCTION "public"."insert_telegram_group"("p_org_id" "uuid", "p_chat_id" bigint, "p_title" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Проверяем существование группы
  IF EXISTS (SELECT 1 FROM telegram_groups WHERE tg_chat_id = p_chat_id) THEN
    -- Обновляем существующую группу
    UPDATE telegram_groups 
    SET 
      title = p_title,
      bot_status = 'connected',
      analytics_enabled = true,
      last_sync_at = NOW()
    WHERE tg_chat_id = p_chat_id;
  ELSE
    -- Вставляем новую группу
    INSERT INTO telegram_groups (
      org_id, 
      tg_chat_id, 
      title, 
      bot_status, 
      analytics_enabled, 
      last_sync_at
    ) VALUES (
      p_org_id,
      p_chat_id,
      p_title,
      'connected',
      true,
      NOW()
    );
  END IF;
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error inserting group: %', SQLERRM;
    RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."insert_telegram_group"("p_org_id" "uuid", "p_chat_id" bigint, "p_title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_activated_admin"("p_user_id" "uuid", "p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM memberships m
    INNER JOIN auth.users u ON u.id = m.user_id
    WHERE 
      m.user_id = p_user_id
      AND m.org_id = p_org_id
      AND m.role IN ('owner', 'admin')
      AND (
        m.role = 'owner' 
        OR (u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL)  -- Админы должны иметь подтверждённый email
      )
  );
$$;


ALTER FUNCTION "public"."is_activated_admin"("p_user_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_activated_admin"("p_user_id" "uuid", "p_org_id" "uuid") IS 'Returns true if user is an activated admin (owner or admin with confirmed email) in the organization';



CREATE OR REPLACE FUNCTION "public"."is_invite_valid"("p_token" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_invite RECORD;
BEGIN
  SELECT * INTO v_invite
  FROM organization_invites
  WHERE token = p_token
    AND is_active = TRUE;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Проверка истечения срока
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
    RETURN FALSE;
  END IF;
  
  -- Проверка лимита использований
  IF v_invite.max_uses IS NOT NULL AND v_invite.current_uses >= v_invite.max_uses THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."is_invite_valid"("p_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_invite_valid"("p_token" "text") IS 'Проверяет валидность приглашения (срок, лимиты, активность)';



CREATE OR REPLACE FUNCTION "public"."is_org_member"("_org" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists(
    select 1 from public.memberships m
    where m.org_id = _org and m.user_id = auth.uid()
  )
$$;


ALTER FUNCTION "public"."is_org_member"("_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member_rpc"("_org" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select exists(
    select 1 from public.memberships m
    where m.org_id = _org and m.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_org_member_rpc"("_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_registered_for_event"("event_id_param" "uuid", "participant_id_param" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.event_registrations
    WHERE event_id = event_id_param
      AND participant_id = participant_id_param
      AND status = 'registered'
  );
END;
$$;


ALTER FUNCTION "public"."is_user_registered_for_event"("event_id_param" "uuid", "participant_id_param" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_user_registered_for_event"("event_id_param" "uuid", "participant_id_param" "uuid") IS 'Check if a user is registered for an event';



CREATE OR REPLACE FUNCTION "public"."is_user_superadmin"("user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $_$
  SELECT EXISTS (
    SELECT 1 FROM public.superadmins 
    WHERE superadmins.user_id = $1
  );
$_$;


ALTER FUNCTION "public"."is_user_superadmin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_admin_action"("p_org_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "text" DEFAULT NULL::"text", "p_changes" "jsonb" DEFAULT NULL::"jsonb", "p_metadata" "jsonb" DEFAULT NULL::"jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_log_id BIGINT;
BEGIN
  INSERT INTO public.admin_action_log (
    org_id, user_id, action, resource_type, resource_id,
    changes, metadata
  )
  VALUES (
    p_org_id, p_user_id, p_action, p_resource_type, p_resource_id,
    p_changes, p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;


ALTER FUNCTION "public"."log_admin_action"("p_org_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "text", "p_changes" "jsonb", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_app_event"("p_app_id" "uuid", "p_event_type" "text", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_item_id" "uuid" DEFAULT NULL::"uuid", "p_collection_id" "uuid" DEFAULT NULL::"uuid", "p_data" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO app_analytics_events (
    app_id, event_type, user_id, item_id, collection_id, data
  ) VALUES (
    p_app_id, p_event_type, p_user_id, p_item_id, p_collection_id, p_data
  ) RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;


ALTER FUNCTION "public"."log_app_event"("p_app_id" "uuid", "p_event_type" "text", "p_user_id" "uuid", "p_item_id" "uuid", "p_collection_id" "uuid", "p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_error"("p_level" "text", "p_message" "text", "p_error_code" "text" DEFAULT NULL::"text", "p_context" "jsonb" DEFAULT NULL::"jsonb", "p_stack_trace" "text" DEFAULT NULL::"text", "p_org_id" "uuid" DEFAULT NULL::"uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_fingerprint TEXT;
  v_error_id BIGINT;
BEGIN
  -- Generate fingerprint for deduplication
  v_fingerprint := MD5(
    COALESCE(p_error_code, '') || 
    COALESCE(p_message, '') || 
    COALESCE(p_context->>'path', '')
  );
  
  INSERT INTO public.error_logs (
    level, message, error_code, context, stack_trace,
    fingerprint, org_id, user_id
  )
  VALUES (
    p_level, p_message, p_error_code, p_context, p_stack_trace,
    v_fingerprint, p_org_id, p_user_id
  )
  RETURNING id INTO v_error_id;
  
  RETURN v_error_id;
END;
$$;


ALTER FUNCTION "public"."log_error"("p_level" "text", "p_message" "text", "p_error_code" "text", "p_context" "jsonb", "p_stack_trace" "text", "p_org_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_telegram_health"("p_tg_chat_id" bigint, "p_event_type" "text", "p_status" "text", "p_message" "text" DEFAULT NULL::"text", "p_details" "jsonb" DEFAULT NULL::"jsonb", "p_org_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO telegram_health_events (
    tg_chat_id, event_type, status, message, details, org_id
  ) VALUES (
    p_tg_chat_id, p_event_type, p_status, p_message, p_details, p_org_id
  );
END;
$$;


ALTER FUNCTION "public"."log_telegram_health"("p_tg_chat_id" bigint, "p_event_type" "text", "p_status" "text", "p_message" "text", "p_details" "jsonb", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_overdue_payments"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Mark payments as overdue if:
  -- 1. Status is 'pending'
  -- 2. Event date has passed OR payment deadline has passed
  WITH overdue_registrations AS (
    UPDATE event_registrations er
    SET 
      payment_status = 'overdue',
      payment_updated_at = NOW()
    FROM events e
    WHERE er.event_id = e.id
      AND er.payment_status = 'pending'
      AND er.price IS NOT NULL
      AND er.price > 0
      AND (
        -- Event has already happened
        e.event_date < CURRENT_DATE
        OR
        -- Payment deadline has passed (event_date - payment_deadline_days)
        (e.event_date - INTERVAL '1 day' * COALESCE(e.payment_deadline_days, 3)) < CURRENT_DATE
      )
    RETURNING er.id
  )
  SELECT COUNT(*)::INTEGER INTO updated_count FROM overdue_registrations;
  
  RETURN updated_count;
END;
$$;


ALTER FUNCTION "public"."mark_overdue_payments"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_overdue_payments"() IS 'Mark pending payments as overdue if deadline passed. Returns count of updated records.';



CREATE OR REPLACE FUNCTION "public"."material_pages_set_position"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.position = 0 then
    select coalesce(max(position), 0) + 1 into new.position
    from public.material_pages
    where org_id = new.org_id
      and coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(new.parent_id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."material_pages_set_position"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."material_pages_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."material_pages_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."material_search_index_refresh"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  new_content text;
begin
  if tg_op = 'DELETE' then
    delete from public.material_search_index where page_id = old.id;
    return old;
  end if;

  new_content := coalesce(new.content_md, '');

  insert into public.material_search_index (page_id, org_id, title, content_ts)
  values (new.id, new.org_id, new.title, to_tsvector('russian', coalesce(new.title, '') || ' ' || new_content))
  on conflict (page_id) do update
    set title = excluded.title,
        content_ts = excluded.content_ts;

  return new;
end;
$$;


ALTER FUNCTION "public"."material_search_index_refresh"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_duplicate_participants"("p_canonical_id" "uuid", "p_duplicate_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result JSONB;
  v_canonical participants%ROWTYPE;
  v_duplicate participants%ROWTYPE;
  v_updated_registrations INTEGER;
  v_transferred_groups INTEGER;
BEGIN
  SELECT * INTO v_canonical FROM participants WHERE id = p_canonical_id AND merged_into IS NULL;
  SELECT * INTO v_duplicate FROM participants WHERE id = p_duplicate_id AND merged_into IS NULL;
  
  IF v_canonical.id IS NULL THEN
    RAISE EXCEPTION 'Canonical participant % not found or already merged', p_canonical_id;
  END IF;
  
  IF v_duplicate.id IS NULL THEN
    RAISE EXCEPTION 'Duplicate participant % not found or already merged', p_duplicate_id;
  END IF;
  
  IF v_canonical.org_id != v_duplicate.org_id THEN
    RAISE EXCEPTION 'Participants must be in the same organization';
  END IF;
  
  -- Обновляем canonical
  UPDATE participants
  SET 
    email = COALESCE(NULLIF(email, ''), NULLIF(v_duplicate.email, '')),
    tg_user_id = COALESCE(tg_user_id, v_duplicate.tg_user_id),
    username = COALESCE(username, v_duplicate.username),
    first_name = COALESCE(first_name, v_duplicate.first_name),
    last_name = COALESCE(last_name, v_duplicate.last_name),
    full_name = COALESCE(NULLIF(full_name, ''), NULLIF(v_duplicate.full_name, '')),
    phone = COALESCE(phone, v_duplicate.phone),
    updated_at = NOW()
  WHERE id = p_canonical_id;
  
  -- Переносим регистрации
  UPDATE event_registrations
  SET participant_id = p_canonical_id
  WHERE participant_id = p_duplicate_id
    AND NOT EXISTS (
      SELECT 1 FROM event_registrations er2
      WHERE er2.participant_id = p_canonical_id
        AND er2.event_id = event_registrations.event_id
    );
  
  GET DIAGNOSTICS v_updated_registrations = ROW_COUNT;
  
  -- Переносим группы
  INSERT INTO participant_groups (participant_id, tg_group_id, joined_at, left_at, is_active)
  SELECT 
    p_canonical_id,
    pg.tg_group_id,
    pg.joined_at,
    pg.left_at,
    pg.is_active
  FROM participant_groups pg
  WHERE pg.participant_id = p_duplicate_id
    AND NOT EXISTS (
      SELECT 1 FROM participant_groups pg2
      WHERE pg2.participant_id = p_canonical_id
        AND pg2.tg_group_id = pg.tg_group_id
    )
  ON CONFLICT DO NOTHING;
  
  GET DIAGNOSTICS v_transferred_groups = ROW_COUNT;
  
  -- Помечаем как merged
  UPDATE participants
  SET merged_into = p_canonical_id, updated_at = NOW()
  WHERE id = p_duplicate_id;
  
  v_result = jsonb_build_object(
    'success', true,
    'canonical_id', p_canonical_id,
    'duplicate_id', p_duplicate_id,
    'updated_registrations', v_updated_registrations,
    'transferred_groups', v_transferred_groups,
    'merged_at', NOW()
  );
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."merge_duplicate_participants"("p_canonical_id" "uuid", "p_duplicate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_duplicate_telegram_groups"() RETURNS TABLE("tg_chat_id" "text", "duplicates_merged" integer, "kept_id" bigint, "removed_ids" bigint[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_duplicate RECORD;
  v_keep_id BIGINT;
  v_remove_ids BIGINT[];
  v_removed_count INT;
BEGIN
  -- Find all chat_ids with duplicates
  FOR v_duplicate IN 
    SELECT tg.tg_chat_id, array_agg(tg.id ORDER BY 
      -- Prefer: connected > pending > inactive, then by most recent activity
      CASE tg.bot_status 
        WHEN 'connected' THEN 1 
        WHEN 'pending' THEN 2 
        WHEN 'inactive' THEN 3 
        ELSE 4 
      END,
      tg.last_sync_at DESC NULLS LAST,
      tg.id
    ) as ids
    FROM telegram_groups tg
    GROUP BY tg.tg_chat_id
    HAVING COUNT(*) > 1
  LOOP
    -- Keep the first (best) record
    v_keep_id := v_duplicate.ids[1];
    v_remove_ids := v_duplicate.ids[2:array_length(v_duplicate.ids, 1)];
    v_removed_count := array_length(v_remove_ids, 1);
    
    -- Update org_telegram_groups to point to kept record's tg_chat_id
    -- (This handles cases where duplicates might have different org bindings)
    -- Note: org_telegram_groups uses tg_chat_id (text), not id
    
    -- Update telegram_group_admins to point to kept chat_id
    -- (Same as above - uses tg_chat_id)
    
    -- Update participant_groups to point to kept chat_id
    UPDATE participant_groups
    SET tg_group_id = v_duplicate.tg_chat_id
    WHERE tg_group_id IN (
      SELECT tg_chat_id FROM telegram_groups WHERE id = ANY(v_remove_ids)
    )
    AND tg_group_id != v_duplicate.tg_chat_id;
    
    -- Delete duplicate records (keep the best one)
    DELETE FROM telegram_groups WHERE id = ANY(v_remove_ids);
    
    -- Return info about this merge
    tg_chat_id := v_duplicate.tg_chat_id;
    duplicates_merged := v_removed_count;
    kept_id := v_keep_id;
    removed_ids := v_remove_ids;
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$;


ALTER FUNCTION "public"."merge_duplicate_telegram_groups"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_participants"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
  begin
    if array_length(p_duplicates, 1) is null then
      return;
    end if;

    update public.participant_groups
    set participant_id = p_target
    where participant_id = any(p_duplicates)
      and not exists (
        select 1
        from public.participant_groups pg2
        where pg2.participant_id = p_target
          and pg2.tg_group_id = public.participant_groups.tg_group_id
      );

    update public.participant_traits pt
    set participant_id = p_target,
        updated_at = now(),
        updated_by = p_actor
    where participant_id = any(p_duplicates)
      and not exists (
        select 1
        from public.participant_traits existing
        where existing.participant_id = p_target
          and existing.trait_key = pt.trait_key
          and existing.trait_value = pt.trait_value
      );

    delete from public.participant_traits pt
    where participant_id = any(p_duplicates);

    update public.activity_events
    set participant_id = p_target
    where participant_id = any(p_duplicates);

    update public.participants
    set merged_into = p_target,
        last_activity_at = greatest(public.participants.last_activity_at, now())
    where id = any(p_duplicates);

  end;
$$;


ALTER FUNCTION "public"."merge_participants"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_participants_extended"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  if array_length(p_duplicates, 1) is null then
    return;
  end if;

  -- Re-use existing merge logic for relations
  perform public.merge_participants(p_target, p_duplicates, p_actor);

  -- Mark duplicates as merged
  update public.participants
  set status = 'merged',
      merged_into = p_target,
      updated_at = now(),
      updated_by = p_actor
  where id = any(p_duplicates);

  update public.participant_duplicates
  set status = 'merged',
      resolved_by = p_actor,
      updated_at = now()
  where duplicate_participant_id = any(p_duplicates)
     or participant_id = any(p_duplicates);
end;
$$;


ALTER FUNCTION "public"."merge_participants_extended"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_participants_smart"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."merge_participants_smart"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."merge_participants_smart"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid") IS 'Умное объединение участников с сохранением всех данных. 
Заполняет пустые поля, конфликтующие значения сохраняет в характеристики.
Версия 26: перезагружает target record перед обработкой каждого дубликата.';



CREATE OR REPLACE FUNCTION "public"."migrate_telegram_chat_id"("old_chat_id" bigint, "new_chat_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result JSONB;
  v_old_group_id BIGINT;
  v_new_group_id BIGINT;
  v_old_group RECORD;
  v_moved_orgs INT := 0;
  v_moved_admins INT := 0;
  v_moved_participants INT := 0;
  v_moved_activities INT := 0;
  v_old_chat_text TEXT := old_chat_id::TEXT;
  v_new_chat_text TEXT := new_chat_id::TEXT;
BEGIN
  SELECT * INTO v_old_group 
  FROM telegram_groups 
  WHERE tg_chat_id = old_chat_id;
  
  IF v_old_group IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Old chat_id not found', 'old_chat_id', old_chat_id);
  END IF;
  
  v_old_group_id := v_old_group.id;
  
  SELECT id INTO v_new_group_id 
  FROM telegram_groups 
  WHERE tg_chat_id = new_chat_id;
  
  IF v_new_group_id IS NULL THEN
    INSERT INTO telegram_groups (
      tg_chat_id, title, bot_status, last_sync_at, member_count, 
      new_members_count, invite_link, migrated_from
    )
    VALUES (
      new_chat_id,
      v_old_group.title, 
      COALESCE(v_old_group.bot_status, 'pending'),
      NOW(),
      v_old_group.member_count, 
      v_old_group.new_members_count,
      v_old_group.invite_link,
      v_old_chat_text
    )
    RETURNING id INTO v_new_group_id;
  ELSE
    UPDATE telegram_groups 
    SET migrated_from = v_old_chat_text
    WHERE id = v_new_group_id;
  END IF;
  
  UPDATE telegram_groups 
  SET migrated_to = v_new_chat_text, 
      bot_status = 'inactive'
  WHERE id = v_old_group_id;
  
  -- Move org bindings
  INSERT INTO org_telegram_groups (org_id, tg_chat_id, created_by, created_at)
  SELECT org_id, new_chat_id, created_by, created_at
  FROM org_telegram_groups
  WHERE tg_chat_id = old_chat_id
  ON CONFLICT (org_id, tg_chat_id) DO NOTHING;
  
  GET DIAGNOSTICS v_moved_orgs = ROW_COUNT;
  
  DELETE FROM org_telegram_groups WHERE tg_chat_id = old_chat_id;
  
  -- Move admin records
  INSERT INTO telegram_group_admins (
    tg_chat_id, tg_user_id, is_owner, is_admin, custom_title,
    can_manage_chat, can_delete_messages, can_manage_video_chats,
    can_restrict_members, can_promote_members, can_change_info,
    can_invite_users, can_pin_messages, can_post_messages,
    can_edit_messages, verified_at, expires_at
  )
  SELECT 
    new_chat_id, tg_user_id, is_owner, is_admin, custom_title,
    can_manage_chat, can_delete_messages, can_manage_video_chats,
    can_restrict_members, can_promote_members, can_change_info,
    can_invite_users, can_pin_messages, can_post_messages,
    can_edit_messages, verified_at, expires_at
  FROM telegram_group_admins
  WHERE tg_chat_id = old_chat_id
  ON CONFLICT (tg_chat_id, tg_user_id) DO UPDATE SET
    is_owner = EXCLUDED.is_owner,
    is_admin = EXCLUDED.is_admin,
    verified_at = EXCLUDED.verified_at,
    expires_at = EXCLUDED.expires_at;
  
  GET DIAGNOSTICS v_moved_admins = ROW_COUNT;
  
  DELETE FROM telegram_group_admins WHERE tg_chat_id = old_chat_id;
  
  -- Update participant_groups: first delete duplicates, then update rest
  -- Delete old records where participant already exists in new group
  DELETE FROM participant_groups 
  WHERE tg_group_id = old_chat_id 
  AND participant_id IN (
    SELECT participant_id FROM participant_groups WHERE tg_group_id = new_chat_id
  );
  
  -- Update remaining records
  UPDATE participant_groups
  SET tg_group_id = new_chat_id
  WHERE tg_group_id = old_chat_id;
  
  GET DIAGNOSTICS v_moved_participants = ROW_COUNT;
  
  -- Update activity_events
  UPDATE activity_events
  SET tg_chat_id = new_chat_id
  WHERE tg_chat_id = old_chat_id;
  
  GET DIAGNOSTICS v_moved_activities = ROW_COUNT;
  
  -- Update group_metrics
  UPDATE group_metrics
  SET tg_chat_id = new_chat_id
  WHERE tg_chat_id = old_chat_id;
  
  v_result := jsonb_build_object(
    'success', true,
    'old_chat_id', old_chat_id,
    'new_chat_id', new_chat_id,
    'old_group_id', v_old_group_id,
    'new_group_id', v_new_group_id,
    'moved_orgs', v_moved_orgs,
    'moved_admins', v_moved_admins,
    'moved_participants', v_moved_participants,
    'moved_activities', v_moved_activities
  );
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."migrate_telegram_chat_id"("old_chat_id" bigint, "new_chat_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."migrate_telegram_chat_id"("old_chat_id" bigint, "new_chat_id" bigint) IS 'Migrate data from old chat_id to new chat_id when Telegram group becomes supergroup. Updates all related tables and marks old group as migrated.';



CREATE OR REPLACE FUNCTION "public"."org_dashboard_stats"("_org" "uuid") RETURNS json
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  with totals as (
    select
      (select count(*) from participants p where p.org_id = _org) as total_participants,
      (select count(*) from activity_events e where e.org_id = _org and e.type='join' and e.created_at >= now() - interval '7 days') as new_7d,
      (select count(*) from activity_events e where e.org_id = _org and e.type='leave' and e.created_at >= now() - interval '7 days') as left_7d
  )
  select to_json(totals) from totals;
$$;


ALTER FUNCTION "public"."org_dashboard_stats"("_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_webhook_message"("p_org_id" "uuid", "p_tg_user_id" bigint, "p_tg_chat_id" bigint, "p_message_id" bigint, "p_message_thread_id" bigint DEFAULT NULL::bigint, "p_reply_to_message_id" bigint DEFAULT NULL::bigint, "p_reply_to_user_id" bigint DEFAULT NULL::bigint, "p_username" "text" DEFAULT NULL::"text", "p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text", "p_full_name" "text" DEFAULT NULL::"text", "p_has_media" boolean DEFAULT false, "p_chars_count" integer DEFAULT 0, "p_links_count" integer DEFAULT 0, "p_mentions_count" integer DEFAULT 0, "p_reactions_count" integer DEFAULT 0, "p_meta" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_participant_id UUID;
  v_is_new_participant BOOLEAN := FALSE;
  v_is_new_group_link BOOLEAN := FALSE;
  v_activity_event_id BIGINT;
  v_effective_full_name TEXT;
BEGIN
  -- Calculate effective full name
  v_effective_full_name := COALESCE(
    NULLIF(p_full_name, ''),
    NULLIF(TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, '')), ''),
    p_username,
    'User ' || p_tg_user_id::TEXT
  );

  -- Step 1: Get or create participant (single UPSERT)
  INSERT INTO participants (
    org_id,
    tg_user_id,
    username,
    tg_first_name,
    tg_last_name,
    full_name,
    source,
    participant_status,
    last_activity_at,
    updated_at
  ) VALUES (
    p_org_id,
    p_tg_user_id,
    p_username,
    p_first_name,
    p_last_name,
    v_effective_full_name,
    'telegram_group',
    'participant',
    NOW(),
    NOW()
  )
  ON CONFLICT (org_id, tg_user_id) 
  DO UPDATE SET
    -- Update Telegram names if changed
    tg_first_name = COALESCE(EXCLUDED.tg_first_name, participants.tg_first_name),
    tg_last_name = COALESCE(EXCLUDED.tg_last_name, participants.tg_last_name),
    username = COALESCE(EXCLUDED.username, participants.username),
    -- Always update activity timestamp
    last_activity_at = NOW(),
    updated_at = NOW()
  RETURNING id, (xmax = 0) INTO v_participant_id, v_is_new_participant;

  -- Handle merged participants: get the target participant
  SELECT COALESCE(merged_into, id) INTO v_participant_id
  FROM participants
  WHERE id = v_participant_id;

  -- Step 2: Ensure participant-group link exists
  INSERT INTO participant_groups (
    participant_id,
    tg_group_id,
    is_active,
    joined_at
  ) VALUES (
    v_participant_id,
    p_tg_chat_id,
    TRUE,
    NOW()
  )
  ON CONFLICT (participant_id, tg_group_id) 
  DO UPDATE SET
    is_active = TRUE,
    left_at = NULL
    -- Only update joined_at if was inactive
    -- joined_at = CASE WHEN participant_groups.is_active = FALSE THEN NOW() ELSE participant_groups.joined_at END
  RETURNING (xmax = 0) INTO v_is_new_group_link;

  -- Step 3: Insert activity event
  INSERT INTO activity_events (
    org_id,
    event_type,
    participant_id,
    tg_user_id,
    tg_chat_id,
    message_id,
    message_thread_id,
    reply_to_message_id,
    reply_to_user_id,
    has_media,
    chars_count,
    links_count,
    mentions_count,
    reactions_count,
    meta,
    created_at
  ) VALUES (
    p_org_id,
    'message',
    v_participant_id,
    p_tg_user_id,
    p_tg_chat_id,
    p_message_id,
    p_message_thread_id,
    p_reply_to_message_id,
    p_reply_to_user_id,
    p_has_media,
    p_chars_count,
    p_links_count,
    p_mentions_count,
    p_reactions_count,
    p_meta,
    NOW()
  )
  RETURNING id INTO v_activity_event_id;

  -- Step 4: Update telegram_groups last_sync_at (fire and forget)
  UPDATE telegram_groups
  SET last_sync_at = NOW()
  WHERE tg_chat_id = p_tg_chat_id::TEXT;

  -- Return result
  RETURN jsonb_build_object(
    'participant_id', v_participant_id,
    'is_new_participant', v_is_new_participant,
    'is_new_group_link', COALESCE(v_is_new_group_link, FALSE),
    'activity_event_id', v_activity_event_id
  );

EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail completely
  RAISE WARNING 'process_webhook_message error: % %', SQLERRM, SQLSTATE;
  RETURN jsonb_build_object(
    'error', SQLERRM,
    'error_code', SQLSTATE
  );
END;
$$;


ALTER FUNCTION "public"."process_webhook_message"("p_org_id" "uuid", "p_tg_user_id" bigint, "p_tg_chat_id" bigint, "p_message_id" bigint, "p_message_thread_id" bigint, "p_reply_to_message_id" bigint, "p_reply_to_user_id" bigint, "p_username" "text", "p_first_name" "text", "p_last_name" "text", "p_full_name" "text", "p_has_media" boolean, "p_chars_count" integer, "p_links_count" integer, "p_mentions_count" integer, "p_reactions_count" integer, "p_meta" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."process_webhook_message"("p_org_id" "uuid", "p_tg_user_id" bigint, "p_tg_chat_id" bigint, "p_message_id" bigint, "p_message_thread_id" bigint, "p_reply_to_message_id" bigint, "p_reply_to_user_id" bigint, "p_username" "text", "p_first_name" "text", "p_last_name" "text", "p_full_name" "text", "p_has_media" boolean, "p_chars_count" integer, "p_links_count" integer, "p_mentions_count" integer, "p_reactions_count" integer, "p_meta" "jsonb") IS 'Optimized webhook message processing. Combines participant upsert, group link, and activity event in single transaction. Reduces 8-12 roundtrips to 1.';



CREATE OR REPLACE FUNCTION "public"."recalculate_member_count"("group_id" bigint) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_member_count INTEGER;
BEGIN
  -- Считаем активных участников
  SELECT COUNT(*) INTO v_member_count
  FROM participant_groups
  WHERE tg_group_id = group_id
  AND is_active = TRUE;
  
  -- Обновляем счетчик в группе
  UPDATE telegram_groups
  SET member_count = v_member_count
  WHERE tg_chat_id = group_id;
  
  RETURN v_member_count;
END;
$$;


ALTER FUNCTION "public"."recalculate_member_count"("group_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."recalculate_member_count"("group_id" bigint) IS 'Recalculates member_count for a specific Telegram group. Fixed in migration 073 to use v_member_count variable.';



CREATE OR REPLACE FUNCTION "public"."record_webhook_processed"("p_update_id" bigint, "p_tg_chat_id" bigint, "p_event_type" "text" DEFAULT 'message'::"text", "p_org_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO telegram_webhook_idempotency (
    update_id,
    tg_chat_id,
    event_type,
    org_id
  ) VALUES (
    p_update_id,
    p_tg_chat_id,
    p_event_type,
    p_org_id
  )
  ON CONFLICT (update_id) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."record_webhook_processed"("p_update_id" bigint, "p_tg_chat_id" bigint, "p_event_type" "text", "p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."record_webhook_processed"("p_update_id" bigint, "p_tg_chat_id" bigint, "p_event_type" "text", "p_org_id" "uuid") IS 'Record successful webhook processing for idempotency.';



CREATE OR REPLACE FUNCTION "public"."register_for_event"("p_event_id" "uuid", "p_participant_id" "uuid", "p_registration_data" "jsonb" DEFAULT '{}'::"jsonb", "p_quantity" integer DEFAULT 1) RETURNS TABLE("registration_id" "uuid", "registration_event_id" "uuid", "registration_participant_id" "uuid", "registration_status" "text", "registration_source" "text", "registration_data" "jsonb", "registration_quantity" integer, "registration_registered_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_org_id UUID;
  v_event_org_id UUID;
  v_registration_id UUID;
  v_registration RECORD;
BEGIN
  RAISE NOTICE '[RPC] Starting register_for_event for event % participant %', p_event_id, p_participant_id;
  
  -- SECURITY DEFINER functions run with the privileges of the function owner
  -- If RLS is still applied, we need to use direct SQL execution
  RAISE NOTICE '[RPC] Step 1: Fetching participant org_id';
  -- Verify participant and event belong to same organization using direct SQL
  EXECUTE format('SELECT org_id FROM %I.participants WHERE id = $1', 'public')
    INTO v_org_id
    USING p_participant_id;
  
  RAISE NOTICE '[RPC] Step 1 complete: participant org_id = %', v_org_id;
  
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;
  
  RAISE NOTICE '[RPC] Step 2: Fetching event org_id';
  EXECUTE format('SELECT org_id FROM %I.events WHERE id = $1', 'public')
    INTO v_event_org_id
    USING p_event_id;
  
  RAISE NOTICE '[RPC] Step 2 complete: event org_id = %', v_event_org_id;
  
  IF v_event_org_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  
  IF v_org_id != v_event_org_id THEN
    RAISE EXCEPTION 'Participant and event must belong to the same organization';
  END IF;
  
  RAISE NOTICE '[RPC] Step 3: Inserting registration';
  -- Insert registration using EXECUTE to bypass RLS
  EXECUTE format('
    INSERT INTO %I.event_registrations (
      event_id,
      participant_id,
      registration_source,
      status,
      registration_data,
      quantity
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *',
    'public'
  )
  INTO v_registration
  USING p_event_id, p_participant_id, 'web', 'registered', p_registration_data, p_quantity;
  
  RAISE NOTICE '[RPC] Step 3 complete: registration created with id = %', v_registration.id;
  
  RAISE NOTICE '[RPC] Step 4: Preparing return data';
  -- Return the created registration
  registration_id := v_registration.id;
  registration_event_id := v_registration.event_id;
  registration_participant_id := v_registration.participant_id;
  registration_status := v_registration.status;
  registration_source := v_registration.registration_source;
  registration_data := v_registration.registration_data;
  registration_quantity := v_registration.quantity;
  registration_registered_at := v_registration.registered_at;
  
  RAISE NOTICE '[RPC] Step 4 complete: returning registration data';
  RETURN NEXT;
  
  RAISE NOTICE '[RPC] Function completed successfully';
END;
$_$;


ALTER FUNCTION "public"."register_for_event"("p_event_id" "uuid", "p_participant_id" "uuid", "p_registration_data" "jsonb", "p_quantity" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."register_for_event"("p_event_id" "uuid", "p_participant_id" "uuid", "p_registration_data" "jsonb", "p_quantity" integer) IS 'Registers a participant for an event, bypassing RLS policies. Verifies participant and event belong to same organization.';



CREATE OR REPLACE FUNCTION "public"."reset_qualification_if_needed"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only reset if user has only archived orgs
  IF user_has_only_archived_orgs(p_user_id) THEN
    -- Mark qualification as incomplete (but keep responses for reference)
    UPDATE user_qualification_responses
    SET completed_at = NULL
    WHERE user_id = p_user_id;
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."reset_qualification_if_needed"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_attention_item"("p_item_id" "uuid", "p_user_id" "uuid", "p_user_name" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE attention_zone_items
  SET 
    resolved_at = NOW(),
    resolved_by = p_user_id,
    resolved_by_name = p_user_name
  WHERE id = p_item_id
    AND resolved_at IS NULL;
  
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."resolve_attention_item"("p_item_id" "uuid", "p_user_id" "uuid", "p_user_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_notification"("p_notification_id" "uuid", "p_user_id" "uuid", "p_user_name" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE notification_logs
  SET 
    resolved_at = NOW(),
    resolved_by = p_user_id,
    resolved_by_name = p_user_name
  WHERE id = p_notification_id
    AND resolved_at IS NULL;
  
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."resolve_notification"("p_notification_id" "uuid", "p_user_id" "uuid", "p_user_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_telegram_chat_id"("p_chat_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_resolved TEXT;
BEGIN
  -- Check if this chat_id was migrated to a new one
  SELECT migrated_to INTO v_resolved
  FROM telegram_groups
  WHERE tg_chat_id = p_chat_id
  AND migrated_to IS NOT NULL;
  
  -- If found migration, return new chat_id, otherwise return original
  RETURN COALESCE(v_resolved, p_chat_id);
END;
$$;


ALTER FUNCTION "public"."resolve_telegram_chat_id"("p_chat_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."resolve_telegram_chat_id"("p_chat_id" "text") IS 'Returns the current/active chat_id for a group, resolving any migrations';



CREATE OR REPLACE FUNCTION "public"."restore_participant_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- При добавлении в группу обратно → меняем статус с 'excluded' на 'participant'
  UPDATE participants
  SET participant_status = 'participant',
      updated_at = NOW()
  WHERE id = NEW.participant_id
    AND participant_status = 'excluded';
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."restore_participant_status"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."restore_participant_status"() IS 'Автоматически восстанавливает статус participant при добавлении в группу';



CREATE OR REPLACE FUNCTION "public"."set_participant_duplicates_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_participant_duplicates_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_registration_price_from_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_default_price DECIMAL(10,2);
  v_requires_payment BOOLEAN;
BEGIN
  -- If event requires payment and no price is set, use default_price
  IF NEW.price IS NULL THEN
    -- Get event payment info using EXECUTE to bypass RLS
    -- SECURITY DEFINER ensures this runs with function owner privileges
    EXECUTE format('SELECT default_price, requires_payment FROM %I.events WHERE id = $1', 'public')
      INTO v_default_price, v_requires_payment
      USING NEW.event_id;
    
    -- If event requires payment, set price from default_price
    IF v_requires_payment = true AND v_default_price IS NOT NULL THEN
      NEW.price := v_default_price;
      NEW.payment_status := 'pending';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."set_registration_price_from_event"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_registration_price_from_event"() IS 'Auto-set price from event default_price on registration if event requires payment. Uses SECURITY DEFINER to bypass RLS.';



CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_telegram_activity_to_activity_events"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_org_id uuid;
  v_participant_id uuid;
BEGIN
  -- Получаем org_id из telegram_groups по tg_chat_id
  SELECT org_id INTO v_org_id
  FROM telegram_groups
  WHERE tg_chat_id = NEW.tg_chat_id
  LIMIT 1;
  
  -- Если группа не найдена, пропускаем
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Получаем participant_id из participants по tg_user_id и org_id
  SELECT id INTO v_participant_id
  FROM participants
  WHERE tg_user_id = NEW.tg_user_id
    AND org_id = v_org_id
  LIMIT 1;
  
  -- Вставляем событие в activity_events
  INSERT INTO activity_events (
    org_id,
    event_type,
    participant_id,
    tg_user_id,
    tg_chat_id,
    message_id,
    message_thread_id,
    reply_to_message_id,
    has_media,
    chars_count,
    links_count,
    mentions_count,
    created_at,
    meta
  ) VALUES (
    v_org_id,
    NEW.event_type,
    v_participant_id,
    NEW.tg_user_id,
    NEW.tg_chat_id,
    NEW.message_id,
    NEW.message_thread_id,
    NEW.reply_to_message_id,
    COALESCE((NEW.meta->>'has_media')::boolean, FALSE),
    COALESCE((NEW.meta->>'message_length')::integer, 0),
    COALESCE((NEW.meta->>'links_count')::integer, 0),
    COALESCE((NEW.meta->>'mentions_count')::integer, 0),
    NEW.created_at,
    NEW.meta
  )
  ON CONFLICT DO NOTHING; -- Избегаем дублирования
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_telegram_activity_to_activity_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_telegram_admins"("p_org_id" "uuid") RETURNS TABLE("tg_user_id" bigint, "action" "text", "groups_count" integer, "is_shadow" boolean, "full_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_admin_record RECORD;
  v_user_id UUID;
  v_has_email BOOLEAN;
  v_existing_membership RECORD;
  v_participant RECORD;
BEGIN
  RAISE NOTICE 'Starting sync_telegram_admins for org %', p_org_id;

  -- Process each admin from telegram_group_admins
  FOR v_admin_record IN
    SELECT 
      tga.tg_user_id,
      array_agg(DISTINCT tga.tg_chat_id) as tg_chat_ids,
      array_agg(DISTINCT tg.title) as group_titles,
      array_agg(DISTINCT tga.custom_title) as custom_titles,
      bool_or(tga.is_owner) as is_owner_in_groups
    FROM telegram_group_admins tga
    INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
    INNER JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
    WHERE 
      otg.org_id = p_org_id
      AND tga.is_admin = true
      AND tga.expires_at > NOW()
    GROUP BY tga.tg_user_id
  LOOP
    RAISE NOTICE 'Processing tg_user_id=% with % groups', v_admin_record.tg_user_id, array_length(v_admin_record.tg_chat_ids, 1);

    -- Find participant
    SELECT * INTO v_participant
    FROM participants p
    WHERE p.org_id = p_org_id 
      AND p.tg_user_id = v_admin_record.tg_user_id
      AND p.merged_into IS NULL
    LIMIT 1;

    IF v_participant IS NULL THEN
      RAISE NOTICE 'No participant found for tg_user_id=%', v_admin_record.tg_user_id;
      CONTINUE;
    END IF;

    IF v_participant.user_id IS NULL THEN
      RAISE NOTICE 'Participant has no user_id (shadow), tg_user_id=%', v_admin_record.tg_user_id;
      CONTINUE;
    END IF;

    v_user_id := v_participant.user_id;

    -- Check if user has verified email
    SELECT (email IS NOT NULL AND email_confirmed_at IS NOT NULL)
    INTO v_has_email
    FROM auth.users
    WHERE id = v_user_id;
    
    IF NOT FOUND THEN
      v_has_email := FALSE;
    END IF;

    -- Check existing membership
    SELECT * INTO v_existing_membership
    FROM memberships m
    WHERE m.org_id = p_org_id AND m.user_id = v_user_id;
    
    IF v_existing_membership IS NULL THEN
      -- Create new admin membership
      BEGIN
        INSERT INTO memberships (org_id, user_id, role, role_source, metadata)
        VALUES (
          p_org_id,
          v_user_id,
          'admin',
          'telegram_admin',
          jsonb_build_object(
            'telegram_groups', ARRAY(SELECT unnest(v_admin_record.tg_chat_ids)::TEXT),
            'telegram_group_titles', v_admin_record.group_titles,
            'custom_titles', v_admin_record.custom_titles,
            'is_owner_in_groups', v_admin_record.is_owner_in_groups,
            'shadow_profile', NOT v_has_email,
            'synced_at', NOW()
          )
        );
        
        RETURN QUERY SELECT 
          v_admin_record.tg_user_id,
          'added'::TEXT,
          array_length(v_admin_record.tg_chat_ids, 1),
          NOT v_has_email,
          COALESCE(v_participant.full_name, 'Unknown');
          
      EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'Race condition for tg_user_id=%', v_admin_record.tg_user_id;
      END;
    ELSE
      -- Update existing membership
      UPDATE memberships m
      SET 
        role = CASE 
          WHEN m.role = 'owner' AND m.role_source != 'telegram_admin' THEN 'owner'
          ELSE 'admin'
        END,
        role_source = CASE 
          WHEN m.role = 'owner' AND m.role_source != 'telegram_admin' THEN m.role_source
          ELSE 'telegram_admin'
        END,
        metadata = jsonb_build_object(
          'telegram_groups', ARRAY(SELECT unnest(v_admin_record.tg_chat_ids)::TEXT),
          'telegram_group_titles', v_admin_record.group_titles,
          'custom_titles', v_admin_record.custom_titles,
          'is_owner_in_groups', v_admin_record.is_owner_in_groups,
          'shadow_profile', NOT v_has_email,
          'synced_at', NOW()
        )
      WHERE m.org_id = p_org_id AND m.user_id = v_user_id;
      
      RETURN QUERY SELECT 
        v_admin_record.tg_user_id,
        'updated'::TEXT,
        array_length(v_admin_record.tg_chat_ids, 1),
        NOT v_has_email,
        COALESCE(v_participant.full_name, 'Unknown');
    END IF;
  END LOOP;
  
  -- ✅ NEW LOGIC: Downgrade admins who lost admin rights to 'member' instead of deleting
  RETURN QUERY
  WITH downgraded_admins AS (
    UPDATE memberships m
    SET 
      role = 'member',
      role_source = 'telegram_group',
      metadata = jsonb_build_object(
        'downgraded_from_admin', true,
        'downgraded_at', NOW(),
        'previous_telegram_groups', m.metadata->'telegram_groups'
      )
    WHERE 
      m.org_id = p_org_id
      AND m.role IN ('admin', 'owner')
      AND m.role_source = 'telegram_admin'
      AND NOT EXISTS (
        SELECT 1 
        FROM telegram_group_admins tga
        INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
        LEFT JOIN participants p ON p.tg_user_id = tga.tg_user_id AND p.org_id = p_org_id AND p.merged_into IS NULL
        WHERE 
          p.user_id = m.user_id
          AND otg.org_id = p_org_id
          AND tga.is_admin = true
          AND tga.expires_at > NOW()
      )
      -- ✅ Only downgrade if user still has a participant record (member of group)
      AND EXISTS (
        SELECT 1
        FROM participants p
        WHERE p.org_id = p_org_id
          AND p.user_id = m.user_id
          AND p.merged_into IS NULL
      )
    RETURNING m.user_id, m.role
  )
  SELECT 
    NULL::BIGINT,
    'downgraded'::TEXT,
    0::INTEGER,
    FALSE,
    'Downgraded from admin to member'::TEXT
  FROM downgraded_admins;
  
  -- ✅ DELETE memberships only if user is NO LONGER a participant in ANY group
  RETURN QUERY
  WITH deleted_admins AS (
    DELETE FROM memberships m
    WHERE 
      m.org_id = p_org_id
      AND m.role IN ('admin', 'owner')
      AND m.role_source = 'telegram_admin'
      AND NOT EXISTS (
        SELECT 1 
        FROM telegram_group_admins tga
        INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
        LEFT JOIN participants p ON p.tg_user_id = tga.tg_user_id AND p.org_id = p_org_id AND p.merged_into IS NULL
        WHERE 
          p.user_id = m.user_id
          AND otg.org_id = p_org_id
          AND tga.is_admin = true
          AND tga.expires_at > NOW()
      )
      -- ✅ Only delete if user is NO LONGER a participant
      AND NOT EXISTS (
        SELECT 1
        FROM participants p
        WHERE p.org_id = p_org_id
          AND p.user_id = m.user_id
          AND p.merged_into IS NULL
      )
    RETURNING m.user_id
  )
  SELECT 
    NULL::BIGINT,
    'removed'::TEXT,
    0::INTEGER,
    FALSE,
    'Removed (no longer in any group)'::TEXT
  FROM deleted_admins;
END;
$$;


ALTER FUNCTION "public"."sync_telegram_admins"("p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_telegram_admins"("p_org_id" "uuid") IS 'Синхронизирует админов из Telegram групп. При потере прав админа понижает до member, а не удаляет (если всё ещё участник группы).';



CREATE OR REPLACE FUNCTION "public"."trigger_create_system_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Создаём системные правила для организации, если их ещё нет
  PERFORM create_system_notification_rules(NEW.org_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_create_system_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_crm_sync_log_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_crm_sync_log_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_events_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_events_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_group_member_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_tg_group_id BIGINT;
BEGIN
  -- Получаем tg_group_id в зависимости от операции (NEW для INSERT/UPDATE, OLD для DELETE)
  v_tg_group_id := COALESCE(NEW.tg_group_id, OLD.tg_group_id);
  
  -- Обновляем счетчик участников в группе
  UPDATE telegram_groups
  SET member_count = (
    SELECT COUNT(*)
    FROM participant_groups pg
    WHERE pg.tg_group_id = v_tg_group_id
    AND pg.is_active = TRUE
  )
  WHERE tg_chat_id = v_tg_group_id;
  
  -- Возвращаем NEW для INSERT/UPDATE, OLD для DELETE
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;


ALTER FUNCTION "public"."update_group_member_count"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_group_member_count"() IS 'Trigger function that automatically updates member_count when participant_groups changes. Fixed in migration 073 to support DELETE operations.';



CREATE OR REPLACE FUNCTION "public"."update_invitations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_invitations_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_invite_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_invite_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_notification_rules_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_notification_rules_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_participant_enrichment"("p_participant_id" "uuid", "p_enrichment_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.participants
  SET 
    custom_attributes = COALESCE(custom_attributes, '{}'::jsonb) || p_enrichment_data,
    updated_at = NOW()
  WHERE id = p_participant_id;
END;
$$;


ALTER FUNCTION "public"."update_participant_enrichment"("p_participant_id" "uuid", "p_enrichment_data" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_participant_enrichment"("p_participant_id" "uuid", "p_enrichment_data" "jsonb") IS 'Merges new enrichment data into participant custom_attributes.
Preserves existing fields, only updates provided fields.';



CREATE OR REPLACE FUNCTION "public"."update_participant_from_registration_data"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  field_key_var TEXT;
  field_mapping_var TEXT;
  field_value TEXT;
  participant_full_name TEXT;
  participant_email TEXT;
  participant_phone TEXT;
  participant_bio TEXT;
  participant_custom_attrs JSONB;
  attr_key TEXT;
BEGIN
  RAISE NOTICE '[TRIGGER update_participant] Starting for participant % and event %', NEW.participant_id, NEW.event_id;
  
  -- Only process if registration_data exists and is not empty
  IF NEW.registration_data IS NULL OR NEW.registration_data = '{}'::jsonb THEN
    RAISE NOTICE '[TRIGGER update_participant] No registration_data, skipping';
    RETURN NEW;
  END IF;

  -- Get participant record using EXECUTE to bypass RLS
  RAISE NOTICE '[TRIGGER update_participant] Fetching participant data';
  EXECUTE format('SELECT full_name, email, phone, bio, custom_attributes FROM %I.participants WHERE id = $1', 'public')
    INTO participant_full_name, participant_email, participant_phone, participant_bio, participant_custom_attrs
    USING NEW.participant_id;

  IF NOT FOUND THEN
    RAISE NOTICE '[TRIGGER update_participant] Participant not found, skipping';
    RETURN NEW;
  END IF;
  
  RAISE NOTICE '[TRIGGER update_participant] Participant found, processing fields';

  -- Process each field in registration_data
  -- Get field mappings using EXECUTE to bypass RLS
  FOR field_key_var, field_mapping_var IN
    EXECUTE format('SELECT field_key, participant_field_mapping FROM %I.event_registration_fields WHERE event_id = $1 AND participant_field_mapping IS NOT NULL', 'public')
    USING NEW.event_id
  LOOP
    RAISE NOTICE '[TRIGGER update_participant] Processing field: % -> %', field_key_var, field_mapping_var;
    
    -- Get value from registration_data
    field_value := NEW.registration_data->>field_key_var;

    -- Skip if value is empty or null
    IF field_value IS NULL OR field_value = '' THEN
      CONTINUE;
    END IF;

    -- Update participant field based on mapping using EXECUTE to bypass RLS
    -- Only update if participant field is NULL or empty (don't overwrite existing values)
    CASE field_mapping_var
      WHEN 'full_name' THEN
        -- Only update if participant.full_name is empty
        IF participant_full_name IS NULL OR participant_full_name = '' THEN
          RAISE NOTICE '[TRIGGER update_participant] Updating full_name to %', field_value;
          EXECUTE format('UPDATE %I.participants SET full_name = $1 WHERE id = $2', 'public')
            USING field_value, NEW.participant_id;
        END IF;

      WHEN 'email' THEN
        -- Only update if participant.email is empty
        IF participant_email IS NULL OR participant_email = '' THEN
          RAISE NOTICE '[TRIGGER update_participant] Updating email to %', field_value;
          EXECUTE format('UPDATE %I.participants SET email = $1 WHERE id = $2', 'public')
            USING field_value, NEW.participant_id;
        END IF;

      WHEN 'phone_number' THEN
        -- Support phone_number mapping, but update 'phone' column
        -- Only update if participant.phone is empty
        IF participant_phone IS NULL OR participant_phone = '' THEN
          RAISE NOTICE '[TRIGGER update_participant] Updating phone to %', field_value;
          EXECUTE format('UPDATE %I.participants SET phone = $1 WHERE id = $2', 'public')
            USING field_value, NEW.participant_id;
        END IF;

      WHEN 'phone' THEN
        -- Support phone mapping, update 'phone' column
        -- Only update if participant.phone is empty
        IF participant_phone IS NULL OR participant_phone = '' THEN
          RAISE NOTICE '[TRIGGER update_participant] Updating phone to %', field_value;
          EXECUTE format('UPDATE %I.participants SET phone = $1 WHERE id = $2', 'public')
            USING field_value, NEW.participant_id;
        END IF;

      WHEN 'bio' THEN
        -- Only update if participant.bio is empty
        IF participant_bio IS NULL OR participant_bio = '' THEN
          RAISE NOTICE '[TRIGGER update_participant] Updating bio to %', LEFT(field_value, 60);
          EXECUTE format('UPDATE %I.participants SET bio = $1 WHERE id = $2', 'public')
            USING LEFT(field_value, 60), NEW.participant_id;
        END IF;

      ELSE
        -- Custom attribute: format is 'custom_attributes.{key}'
        IF field_mapping_var LIKE 'custom_attributes.%' THEN
          attr_key := SUBSTRING(field_mapping_var FROM 'custom_attributes\.(.+)');
          
          -- Only update if attribute doesn't exist or is empty
          IF COALESCE(participant_custom_attrs, '{}'::jsonb)->>attr_key IS NULL OR 
             COALESCE(participant_custom_attrs, '{}'::jsonb)->>attr_key = '' THEN
            RAISE NOTICE '[TRIGGER update_participant] Updating custom_attributes.% to %', attr_key, field_value;
            EXECUTE format('UPDATE %I.participants SET custom_attributes = jsonb_set(COALESCE(custom_attributes, $1), $2, $3) WHERE id = $4', 'public')
              USING '{}'::jsonb, ARRAY[attr_key], to_jsonb(field_value), NEW.participant_id;
          END IF;
        END IF;
    END CASE;
  END LOOP;

  RAISE NOTICE '[TRIGGER update_participant] Complete';
  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."update_participant_from_registration_data"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_participant_from_registration_data"() IS 'Updates participant profile from registration data. Uses SECURITY DEFINER and EXECUTE to bypass RLS. Only updates fields if they are NULL or empty (does not overwrite existing values). Uses phone column (not phone_number). Supports both phone_number and phone mappings.';



CREATE OR REPLACE FUNCTION "public"."update_participant_scores_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only recalculate if last_activity_at changed or is new insert
  IF TG_OP = 'INSERT' OR OLD.last_activity_at IS DISTINCT FROM NEW.last_activity_at THEN
    -- Calculate both scores
    NEW.activity_score := calculate_activity_score(NEW.id);
    NEW.risk_score := calculate_risk_score(NEW.id);
    
    -- Log for debugging (only in development)
    -- RAISE DEBUG 'Updated scores for participant %: activity=%, risk=%', 
    --             NEW.id, NEW.activity_score, NEW.risk_score;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_participant_scores_trigger"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_participant_scores_trigger"() IS 'Trigger function that automatically updates activity_score and risk_score when last_activity_at changes.';



CREATE OR REPLACE FUNCTION "public"."update_participant_tags_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_participant_tags_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_telegram_group_admins_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_telegram_group_admins_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."participant_traits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "trait_key" "text" NOT NULL,
    "trait_value" "text" NOT NULL,
    "value_type" "text" DEFAULT 'text'::"text",
    "source" "text" DEFAULT 'manual'::"text",
    "confidence" numeric,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
);


ALTER TABLE "public"."participant_traits" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_participant_trait"("p_participant_id" "uuid", "p_trait_key" "text", "p_trait_value" "text", "p_value_type" "text" DEFAULT 'text'::"text", "p_source" "text" DEFAULT 'manual'::"text", "p_confidence" numeric DEFAULT NULL::numeric, "p_metadata" "jsonb" DEFAULT NULL::"jsonb", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."participant_traits"
    LANGUAGE "plpgsql"
    AS $$
  declare
    v_trait public.participant_traits;
  begin
    insert into public.participant_traits (
      participant_id,
      trait_key,
      trait_value,
      value_type,
      source,
      confidence,
      metadata,
      created_by,
      updated_by
    ) values (
      p_participant_id,
      p_trait_key,
      p_trait_value,
      coalesce(p_value_type, 'text'),
      coalesce(p_source, 'manual'),
      p_confidence,
      p_metadata,
      p_user_id,
      p_user_id
    )
    on conflict (participant_id, trait_key, trait_value)
    do update set
      value_type = excluded.value_type,
      source = excluded.source,
      confidence = excluded.confidence,
      metadata = excluded.metadata,
      updated_at = now(),
      updated_by = excluded.updated_by
    returning * into v_trait;

    return v_trait;
  end;
$$;


ALTER FUNCTION "public"."upsert_participant_trait"("p_participant_id" "uuid", "p_trait_key" "text", "p_trait_value" "text", "p_value_type" "text", "p_source" "text", "p_confidence" numeric, "p_metadata" "jsonb", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_only_archived_orgs"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_total_orgs INT;
  v_active_orgs INT;
BEGIN
  -- Count total memberships
  SELECT COUNT(*) INTO v_total_orgs
  FROM memberships
  WHERE user_id = p_user_id;
  
  -- Count active memberships
  SELECT COUNT(*) INTO v_active_orgs
  FROM memberships m
  JOIN organizations o ON o.id = m.org_id
  WHERE m.user_id = p_user_id
    AND COALESCE(o.status, 'active') = 'active';
  
  -- User has only archived orgs if they have orgs but none are active
  RETURN v_total_orgs > 0 AND v_active_orgs = 0;
END;
$$;


ALTER FUNCTION "public"."user_has_only_archived_orgs"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_is_member_of_org"("check_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE org_id = check_org_id
    AND user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."user_is_member_of_org"("check_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_is_org_admin"("check_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE org_id = check_org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  );
$$;


ALTER FUNCTION "public"."user_is_org_admin"("check_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_registration_quantity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_allow_multiple BOOLEAN;
BEGIN
  RAISE NOTICE '[TRIGGER validate_quantity] Starting for event_id %', NEW.event_id;
  
  -- Get event setting using EXECUTE to bypass RLS
  EXECUTE format('SELECT allow_multiple_tickets FROM %I.events WHERE id = $1', 'public')
    INTO v_allow_multiple
    USING NEW.event_id;
  
  RAISE NOTICE '[TRIGGER validate_quantity] allow_multiple_tickets = %', v_allow_multiple;
  
  -- If multiple tickets not allowed, enforce quantity = 1
  IF v_allow_multiple = false AND NEW.quantity > 1 THEN
    RAISE EXCEPTION 'Multiple tickets are not allowed for this event. Set quantity to 1.';
  END IF;
  
  RAISE NOTICE '[TRIGGER validate_quantity] Validation passed';
  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."validate_registration_quantity"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_registration_quantity"() IS 'Validates that quantity > 1 is only allowed if event.allow_multiple_tickets = true. Uses SECURITY DEFINER and EXECUTE to bypass RLS.';



CREATE TABLE IF NOT EXISTS "public"."activity_events" (
    "id" bigint NOT NULL,
    "org_id" "uuid",
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "chars_count" integer,
    "links_count" integer,
    "mentions_count" integer,
    "event_type" "text" DEFAULT 'message'::"text" NOT NULL,
    "tg_chat_id" bigint,
    "has_media" boolean DEFAULT false,
    "message_id" bigint,
    "message_thread_id" bigint,
    "reply_to_message_id" bigint,
    "tg_user_id" bigint,
    "import_source" "text" DEFAULT 'webhook'::"text",
    "import_batch_id" "uuid",
    "reactions_count" integer DEFAULT 0,
    "reply_to_user_id" bigint,
    "platform" "public"."messenger_platform" DEFAULT 'telegram'::"public"."messenger_platform",
    CONSTRAINT "activity_events_import_source_check" CHECK (("import_source" = ANY (ARRAY['webhook'::"text", 'html_import'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."activity_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."activity_events" IS 'Stores activity events. Columns type, participant_id, tg_group_id removed as unused (migration 071)';



COMMENT ON COLUMN "public"."activity_events"."import_source" IS 'Источник события: webhook (реал-тайм из Telegram), html_import (загрузка истории), manual (ручное добавление)';



COMMENT ON COLUMN "public"."activity_events"."import_batch_id" IS 'UUID батча для группировки импортированных сообщений';



COMMENT ON COLUMN "public"."activity_events"."reactions_count" IS 'Total count of reactions on this message (for fast aggregation)';



COMMENT ON COLUMN "public"."activity_events"."reply_to_user_id" IS 'Telegram user ID of the person being replied to (for network analysis).
Extracted from reply_to_message_id by joining with original message.';



CREATE SEQUENCE IF NOT EXISTS "public"."activity_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."activity_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."activity_events_id_seq" OWNED BY "public"."activity_events"."id";



CREATE TABLE IF NOT EXISTS "public"."admin_action_log" (
    "id" bigint NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "text",
    "changes" "jsonb",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_id" "text",
    "ip_address" "inet",
    "user_agent" "text"
);


ALTER TABLE "public"."admin_action_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."admin_action_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."admin_action_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."admin_action_log_id_seq" OWNED BY "public"."admin_action_log"."id";



CREATE TABLE IF NOT EXISTS "public"."ai_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "org_id" "uuid",
    "request_type" "text" NOT NULL,
    "user_message" "text" NOT NULL,
    "ai_response" "text",
    "generated_config" "jsonb",
    "was_applied" boolean DEFAULT false,
    "model" "text",
    "tokens_used" integer,
    "cost_usd" numeric(10,6),
    "cost_rub" numeric(10,2),
    "app_id" "uuid",
    "conversation_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_requests" IS 'Logs all AI interactions for product analytics and debugging';



COMMENT ON COLUMN "public"."ai_requests"."request_type" IS 'Type of request: create_app, edit_app, chat_message';



COMMENT ON COLUMN "public"."ai_requests"."was_applied" IS 'Whether user applied the generated config';



COMMENT ON COLUMN "public"."ai_requests"."conversation_id" IS 'Groups messages in same chat session';



CREATE TABLE IF NOT EXISTS "public"."app_analytics_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "app_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "user_id" "uuid",
    "item_id" "uuid",
    "collection_id" "uuid",
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."app_analytics_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."app_analytics_events" IS 'Usage tracking for apps';



CREATE TABLE IF NOT EXISTS "public"."app_collections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "app_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "icon" "text",
    "schema" "jsonb" NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "workflows" "jsonb" DEFAULT '[]'::"jsonb",
    "views" "jsonb" DEFAULT '["list"]'::"jsonb",
    "moderation_enabled" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."app_collections" OWNER TO "postgres";


COMMENT ON TABLE "public"."app_collections" IS 'Data models (collections) within apps';



COMMENT ON COLUMN "public"."app_collections"."schema" IS 'AI-generated field schema (types, validations, labels, order, visibility)';



COMMENT ON COLUMN "public"."app_collections"."permissions" IS 'Who can create/read/edit/delete/moderate';



COMMENT ON COLUMN "public"."app_collections"."workflows" IS 'Triggers and actions (onCreate, onApprove, etc)';



CREATE TABLE IF NOT EXISTS "public"."app_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "collection_id" "uuid" NOT NULL,
    "data" "jsonb" NOT NULL,
    "images" "text"[] DEFAULT '{}'::"text"[],
    "files" "text"[] DEFAULT '{}'::"text"[],
    "location_lat" double precision,
    "location_lon" double precision,
    "location_address" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "creator_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "moderated_by" "uuid",
    "moderated_at" timestamp with time zone,
    "moderation_note" "text",
    "views_count" integer DEFAULT 0,
    "reactions_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."app_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."app_items" IS 'Universal storage for all app data (JSONB)';



COMMENT ON COLUMN "public"."app_items"."data" IS 'Flexible JSONB data matching collection schema';



COMMENT ON COLUMN "public"."app_items"."creator_id" IS 'References participants.id (NOT users.id)';



CREATE TABLE IF NOT EXISTS "public"."apps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "icon" "text",
    "app_type" "text" DEFAULT 'custom'::"text",
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "visibility" "text" DEFAULT 'members'::"text",
    "primary_color" "text" DEFAULT '#3B82F6'::"text",
    "secondary_color" "text" DEFAULT '#10B981'::"text",
    "logo_url" "text",
    "custom_css" "text",
    CONSTRAINT "apps_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'members'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."apps" OWNER TO "postgres";


COMMENT ON TABLE "public"."apps" IS 'AI-generated applications for communities';



COMMENT ON COLUMN "public"."apps"."config" IS 'AI-generated configuration (Telegram commands, notifications, features)';



COMMENT ON COLUMN "public"."apps"."primary_color" IS 'Primary brand color (hex format #RRGGBB)';



COMMENT ON COLUMN "public"."apps"."secondary_color" IS 'Secondary brand color (hex format #RRGGBB)';



COMMENT ON COLUMN "public"."apps"."logo_url" IS 'App logo URL (uploaded to Supabase Storage)';



COMMENT ON COLUMN "public"."apps"."custom_css" IS 'Custom CSS for advanced styling (optional)';



CREATE TABLE IF NOT EXISTS "public"."attention_zone_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "org_id" "uuid" NOT NULL,
    "item_type" "text" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "item_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "resolved_by_name" "text",
    "last_shown_at" timestamp with time zone DEFAULT "now"(),
    "times_shown" integer DEFAULT 1,
    CONSTRAINT "attention_zone_items_item_type_check" CHECK (("item_type" = ANY (ARRAY['churning_participant'::"text", 'inactive_newcomer'::"text", 'critical_event'::"text"])))
);


ALTER TABLE "public"."attention_zone_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."attention_zone_items" IS 'Элементы зон внимания с отслеживанием резолюции';



CREATE TABLE IF NOT EXISTS "public"."crm_sync_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "weeek_contact_id" "text",
    "weeek_deal_id" "text",
    "org_id" "uuid",
    "org_name" "text",
    "telegram_username" "text",
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "qualification_responses" "jsonb"
);


ALTER TABLE "public"."crm_sync_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."crm_sync_log" IS 'Mapping between Orbo users and Weeek CRM contacts/deals';



CREATE TABLE IF NOT EXISTS "public"."email_auth_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" character varying(64) NOT NULL,
    "email" "text" NOT NULL,
    "redirect_url" "text",
    "is_used" boolean DEFAULT false,
    "used_at" timestamp with time zone,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone NOT NULL,
    "ip_address" "text",
    "user_agent" "text"
);


ALTER TABLE "public"."email_auth_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."email_auth_tokens" IS 'Одноразовые токены для авторизации по email (magic link через Unisender Go)';



COMMENT ON COLUMN "public"."email_auth_tokens"."token" IS 'Криптографически безопасный токен для magic link URL';



COMMENT ON COLUMN "public"."email_auth_tokens"."email" IS 'Email пользователя, на который отправлен magic link';



COMMENT ON COLUMN "public"."email_auth_tokens"."expires_at" IS 'Срок действия токена (15 минут после создания)';



CREATE TABLE IF NOT EXISTS "public"."error_logs" (
    "id" bigint NOT NULL,
    "org_id" "uuid",
    "user_id" "uuid",
    "level" "text" NOT NULL,
    "message" "text" NOT NULL,
    "error_code" "text",
    "context" "jsonb",
    "stack_trace" "text",
    "fingerprint" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "request_id" "text",
    "user_agent" "text",
    CONSTRAINT "error_logs_level_check" CHECK (("level" = ANY (ARRAY['error'::"text", 'warn'::"text", 'info'::"text"])))
);


ALTER TABLE "public"."error_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."error_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."error_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."error_logs_id_seq" OWNED BY "public"."error_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."event_registration_fields" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "field_key" character varying(100) NOT NULL,
    "field_label" "text" NOT NULL,
    "field_type" character varying(20) NOT NULL,
    "required" boolean DEFAULT false,
    "field_order" integer DEFAULT 0,
    "participant_field_mapping" character varying(100),
    "options" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "event_registration_fields_field_type_check" CHECK ((("field_type")::"text" = ANY ((ARRAY['text'::character varying, 'email'::character varying, 'phone'::character varying, 'textarea'::character varying, 'select'::character varying, 'checkbox'::character varying])::"text"[])))
);


ALTER TABLE "public"."event_registration_fields" OWNER TO "postgres";


COMMENT ON TABLE "public"."event_registration_fields" IS 'Event registration field configurations with RLS enabled';



COMMENT ON COLUMN "public"."event_registration_fields"."field_key" IS 'Internal key (e.g., "full_name", "phone", "company")';



COMMENT ON COLUMN "public"."event_registration_fields"."field_label" IS 'Display label for the field';



COMMENT ON COLUMN "public"."event_registration_fields"."field_type" IS 'Input type: text, email, phone, textarea, select, checkbox';



COMMENT ON COLUMN "public"."event_registration_fields"."participant_field_mapping" IS 'Which participant field to update: full_name, email, phone, bio, or custom_attributes.{key}';



CREATE TABLE IF NOT EXISTS "public"."event_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "registered_at" timestamp with time zone DEFAULT "now"(),
    "registration_source" "text" DEFAULT 'web'::"text",
    "status" "text" DEFAULT 'registered'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "price" numeric(10,2),
    "payment_status" character varying(20) DEFAULT 'pending'::character varying,
    "payment_method" character varying(50),
    "paid_at" timestamp with time zone,
    "paid_amount" numeric(10,2) DEFAULT 0,
    "payment_notes" "text",
    "payment_updated_by" "uuid",
    "payment_updated_at" timestamp with time zone,
    "registration_data" "jsonb" DEFAULT '{}'::"jsonb",
    "quantity" integer DEFAULT 1,
    CONSTRAINT "event_registrations_payment_status_check" CHECK ((("payment_status")::"text" = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'partially_paid'::character varying, 'overdue'::character varying, 'cancelled'::character varying, 'refunded'::character varying])::"text"[]))),
    CONSTRAINT "event_registrations_quantity_check" CHECK ((("quantity" >= 1) AND ("quantity" <= 5))),
    CONSTRAINT "event_registrations_registration_source_check" CHECK (("registration_source" = ANY (ARRAY['web'::"text", 'telegram'::"text", 'telegram_miniapp'::"text", 'admin'::"text", 'import'::"text"]))),
    CONSTRAINT "event_registrations_status_check" CHECK (("status" = ANY (ARRAY['registered'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."event_registrations" OWNER TO "postgres";


COMMENT ON TABLE "public"."event_registrations" IS 'Event registrations with RLS enabled';



COMMENT ON COLUMN "public"."event_registrations"."price" IS 'Individual price for this participant (may differ from default_price)';



COMMENT ON COLUMN "public"."event_registrations"."payment_status" IS 'Payment status: pending, paid, partially_paid, overdue, cancelled, refunded';



COMMENT ON COLUMN "public"."event_registrations"."payment_method" IS 'Payment method: bank_transfer, cash, card, online, other';



COMMENT ON COLUMN "public"."event_registrations"."paid_at" IS 'When payment was received';



COMMENT ON COLUMN "public"."event_registrations"."paid_amount" IS 'Amount actually paid (for partial payments)';



COMMENT ON COLUMN "public"."event_registrations"."payment_notes" IS 'Admin notes about payment (transaction ID, comments, etc.)';



COMMENT ON COLUMN "public"."event_registrations"."payment_updated_by" IS 'User who last updated payment status';



COMMENT ON COLUMN "public"."event_registrations"."payment_updated_at" IS 'When payment status was last updated';



COMMENT ON COLUMN "public"."event_registrations"."registration_data" IS 'Custom field values collected during registration: {"full_name": "Иван Иванов", "phone": "+7..."}';



COMMENT ON COLUMN "public"."event_registrations"."quantity" IS 'Number of tickets/participants (1-5)';



CREATE TABLE IF NOT EXISTS "public"."event_telegram_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "tg_group_id" integer NOT NULL,
    "notification_type" "text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "message_id" bigint,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "event_telegram_notifications_notification_type_check" CHECK (("notification_type" = ANY (ARRAY['manual'::"text", 'day_before'::"text", 'hour_before'::"text"]))),
    CONSTRAINT "event_telegram_notifications_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'sent'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."event_telegram_notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."event_telegram_notifications" IS 'Telegram notifications for events';



CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "cover_image_url" "text",
    "event_type" "text" NOT NULL,
    "location_info" "text",
    "event_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "is_paid" boolean DEFAULT false NOT NULL,
    "price_info" "text",
    "capacity" integer,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "image_url" "text",
    "telegram_group_link" "text",
    "requires_payment" boolean DEFAULT false,
    "default_price" numeric(10,2),
    "currency" character varying(3) DEFAULT 'RUB'::character varying,
    "payment_deadline_days" integer DEFAULT 3,
    "payment_instructions" "text",
    "capacity_count_by_paid" boolean DEFAULT false,
    "show_participants_list" boolean DEFAULT true,
    "allow_multiple_tickets" boolean DEFAULT false,
    "end_date" "date",
    "registration_fields_config" "jsonb",
    "payment_link" "text",
    "map_link" "text",
    CONSTRAINT "events_currency_check" CHECK ((("currency")::"text" = ANY ((ARRAY['RUB'::character varying, 'USD'::character varying, 'EUR'::character varying, 'KZT'::character varying, 'BYN'::character varying])::"text"[]))),
    CONSTRAINT "events_end_date_check" CHECK ((("end_date" IS NULL) OR ("end_date" >= "event_date"))),
    CONSTRAINT "events_event_type_check" CHECK (("event_type" = ANY (ARRAY['online'::"text", 'offline'::"text"]))),
    CONSTRAINT "events_payment_deadline_days_check" CHECK (("payment_deadline_days" >= 0)),
    CONSTRAINT "events_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'cancelled'::"text", 'completed'::"text"]))),
    CONSTRAINT "events_time_order_check" CHECK ((((("end_date" IS NULL) OR ("end_date" = "event_date")) AND ("end_time" > "start_time")) OR (("end_date" IS NOT NULL) AND ("end_date" > "event_date"))))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


COMMENT ON TABLE "public"."events" IS 'Events organized by organizations';



COMMENT ON COLUMN "public"."events"."image_url" IS 'URL изображения события для предпросмотра (Open Graph в Telegram/социальных сетях)';



COMMENT ON COLUMN "public"."events"."telegram_group_link" IS 'Public Telegram group link for event registration (for public events)';



COMMENT ON COLUMN "public"."events"."requires_payment" IS 'Whether this event requires payment';



COMMENT ON COLUMN "public"."events"."default_price" IS 'Default price for registration (can be overridden per participant)';



COMMENT ON COLUMN "public"."events"."currency" IS 'Currency code (ISO 4217)';



COMMENT ON COLUMN "public"."events"."payment_deadline_days" IS 'Days before event when payment is due (default 3)';



COMMENT ON COLUMN "public"."events"."payment_instructions" IS 'Payment instructions for participants (bank details, etc.)';



COMMENT ON COLUMN "public"."events"."capacity_count_by_paid" IS 'If true, capacity limit counts only paid registrations. If false, counts all registered.';



COMMENT ON COLUMN "public"."events"."show_participants_list" IS 'Whether to show list of registered participants on event page';



COMMENT ON COLUMN "public"."events"."allow_multiple_tickets" IS 'If true, allows participants to register multiple tickets (quantity > 1) in a single registration';



COMMENT ON COLUMN "public"."events"."end_date" IS 'End date for multi-day events. If NULL, event ends on event_date';



COMMENT ON COLUMN "public"."events"."registration_fields_config" IS 'Configuration for registration form fields. Structure: { field_key: { status: "required"|"optional"|"disabled", label?: string } }';



COMMENT ON COLUMN "public"."events"."payment_link" IS 'External payment link URL (bank transfer page, payment processor, etc.)';



COMMENT ON COLUMN "public"."events"."map_link" IS 'Link to location on map (for offline events)';



COMMENT ON CONSTRAINT "events_end_date_check" ON "public"."events" IS 'Ensures end_date is not before event_date';



COMMENT ON CONSTRAINT "events_time_order_check" ON "public"."events" IS 'Ensures end_time > start_time for single-day events. Allows any time for multi-day events (end_date > event_date).';



CREATE TABLE IF NOT EXISTS "public"."group_metrics" (
    "id" integer NOT NULL,
    "org_id" "uuid" NOT NULL,
    "tg_chat_id" bigint NOT NULL,
    "date" "date" NOT NULL,
    "dau" integer DEFAULT 0,
    "message_count" integer DEFAULT 0,
    "reply_count" integer DEFAULT 0,
    "reply_ratio" numeric(5,2) DEFAULT 0,
    "join_count" integer DEFAULT 0,
    "leave_count" integer DEFAULT 0,
    "net_member_change" integer DEFAULT 0,
    "silent_rate" numeric(5,2) DEFAULT 0
);


ALTER TABLE "public"."group_metrics" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."group_metrics_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."group_metrics_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."group_metrics_id_seq" OWNED BY "public"."group_metrics"."id";



CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "token" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "invited_by" "uuid",
    "accepted_by" "uuid",
    "expires_at" timestamp with time zone NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chk_invitation_expiry" CHECK (("expires_at" > "created_at")),
    CONSTRAINT "chk_invitation_role" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text"]))),
    CONSTRAINT "chk_invitation_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


COMMENT ON TABLE "public"."invitations" IS 'Stores email invitations for new team members';



COMMENT ON COLUMN "public"."invitations"."token" IS 'Unique token for the invitation link';



COMMENT ON COLUMN "public"."invitations"."status" IS 'Current status of the invitation';



COMMENT ON COLUMN "public"."invitations"."invited_by" IS 'User who sent the invitation';



COMMENT ON COLUMN "public"."invitations"."accepted_by" IS 'User who accepted the invitation (created account)';



CREATE TABLE IF NOT EXISTS "public"."material_pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "title" "text" NOT NULL,
    "slug" "text",
    "content_md" "text" DEFAULT ''::"text" NOT NULL,
    "content_draft_md" "text",
    "content_json" "jsonb",
    "visibility" "text" DEFAULT 'org_members'::"text" NOT NULL,
    "is_published" boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "material_pages_visibility_check" CHECK (("visibility" = ANY (ARRAY['org_members'::"text", 'admins_only'::"text"])))
);


ALTER TABLE "public"."material_pages" OWNER TO "postgres";


COMMENT ON TABLE "public"."material_pages" IS 'New material system with tree structure and Markdown content. 
Replaces: material_folders, material_items, material_access (removed in migration 49).
Used for: knowledge base, documentation, org resources.';



CREATE TABLE IF NOT EXISTS "public"."material_search_index" (
    "page_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content_ts" "tsvector" NOT NULL
);


ALTER TABLE "public"."material_search_index" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "role_source" "text" DEFAULT 'manual'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "digest_notifications" boolean DEFAULT true,
    CONSTRAINT "memberships_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'viewer'::"text"]))),
    CONSTRAINT "memberships_role_source_check" CHECK (("role_source" = ANY (ARRAY['manual'::"text", 'telegram_admin'::"text", 'invitation'::"text", 'telegram_group'::"text"])))
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


COMMENT ON TABLE "public"."memberships" IS 'Stores organization membership with roles. Auto-created for participants during Telegram auth.';



COMMENT ON COLUMN "public"."memberships"."role_source" IS 'How the user got their role: manual (by owner), telegram_admin (from Telegram group), invitation (invited)';



COMMENT ON COLUMN "public"."memberships"."metadata" IS 'Additional metadata like telegram_groups where user is admin';



COMMENT ON COLUMN "public"."memberships"."digest_notifications" IS 'Whether user wants to receive weekly digest notifications';



CREATE TABLE IF NOT EXISTS "public"."notification_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "rule_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "rule_type" "text" NOT NULL,
    "trigger_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "sent_to_user_ids" "text"[] DEFAULT '{}'::"uuid"[],
    "sent_via" "text"[] DEFAULT '{}'::"text"[],
    "error_message" "text",
    "ai_tokens_used" integer,
    "ai_cost_usd" numeric(10,6),
    "dedup_hash" "text",
    "processed_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "resolved_by_name" "text",
    "last_activity_at" timestamp with time zone,
    CONSTRAINT "notification_logs_notification_status_check" CHECK (("notification_status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."notification_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_logs" IS 'Логи отправленных уведомлений с дедупликацией';



COMMENT ON COLUMN "public"."notification_logs"."sent_to_user_ids" IS 'Array of Telegram user IDs who received this notification';



COMMENT ON COLUMN "public"."notification_logs"."ai_cost_usd" IS 'Стоимость AI анализа в USD';



COMMENT ON COLUMN "public"."notification_logs"."dedup_hash" IS 'Хеш для дедупликации (MD5 от ключевых полей trigger_context)';



COMMENT ON COLUMN "public"."notification_logs"."resolved_at" IS 'Время отметки как решённого';



COMMENT ON COLUMN "public"."notification_logs"."resolved_by" IS 'ID пользователя, отметившего как решённое';



COMMENT ON COLUMN "public"."notification_logs"."resolved_by_name" IS 'Имя пользователя для отображения';



COMMENT ON COLUMN "public"."notification_logs"."last_activity_at" IS 'For inactivity notifications: timestamp of last activity when notification was sent. Used to prevent spam.';



CREATE TABLE IF NOT EXISTS "public"."notification_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "org_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "rule_type" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "use_ai" boolean DEFAULT false NOT NULL,
    "notify_owner" boolean DEFAULT true NOT NULL,
    "notify_admins" boolean DEFAULT false NOT NULL,
    "notify_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "is_enabled" boolean DEFAULT true NOT NULL,
    "last_check_at" timestamp with time zone,
    "last_triggered_at" timestamp with time zone,
    "trigger_count" integer DEFAULT 0 NOT NULL,
    "is_system" boolean DEFAULT false,
    "send_telegram" boolean DEFAULT true,
    CONSTRAINT "notification_rules_rule_type_check" CHECK (("rule_type" = ANY (ARRAY['negative_discussion'::"text", 'unanswered_question'::"text", 'group_inactive'::"text", 'churning_participant'::"text", 'inactive_newcomer'::"text"])))
);


ALTER TABLE "public"."notification_rules" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_rules" IS 'Правила автоматических уведомлений для организаций';



COMMENT ON COLUMN "public"."notification_rules"."rule_type" IS 'Тип правила: negative_discussion, unanswered_question, group_inactive';



COMMENT ON COLUMN "public"."notification_rules"."config" IS 'JSON конфигурация правила (группы, таймауты, рабочие часы и т.д.)';



COMMENT ON COLUMN "public"."notification_rules"."use_ai" IS 'Использовать AI для анализа (платная фича)';



COMMENT ON COLUMN "public"."notification_rules"."is_system" IS 'Системное правило (автоматически создаётся для org)';



COMMENT ON COLUMN "public"."notification_rules"."send_telegram" IS 'Отправлять ли уведомления в Telegram (false для системных)';



CREATE TABLE IF NOT EXISTS "public"."openai_api_logs" (
    "id" bigint NOT NULL,
    "org_id" "uuid",
    "request_type" "text" NOT NULL,
    "model" "text" NOT NULL,
    "prompt_tokens" integer DEFAULT 0 NOT NULL,
    "completion_tokens" integer DEFAULT 0 NOT NULL,
    "total_tokens" integer DEFAULT 0 NOT NULL,
    "cost_usd" numeric(10,6) DEFAULT 0 NOT NULL,
    "cost_rub" numeric(10,2),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."openai_api_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."openai_api_logs" IS 'Logs all OpenAI API calls for cost monitoring and optimization';



COMMENT ON COLUMN "public"."openai_api_logs"."request_type" IS 'Type of AI request: participant_enrichment, weekly_digest, custom_analysis';



COMMENT ON COLUMN "public"."openai_api_logs"."cost_usd" IS 'Cost in USD (primary currency)';



COMMENT ON COLUMN "public"."openai_api_logs"."cost_rub" IS 'Cost in RUB for convenience (optional)';



COMMENT ON COLUMN "public"."openai_api_logs"."metadata" IS 'Additional context: participant_id, feature name, digest_id, etc.';



CREATE SEQUENCE IF NOT EXISTS "public"."openai_api_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."openai_api_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."openai_api_logs_id_seq" OWNED BY "public"."openai_api_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."org_telegram_groups" (
    "org_id" "uuid" NOT NULL,
    "tg_chat_id" bigint NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_reason" "text",
    "platform" "public"."messenger_platform" DEFAULT 'telegram'::"public"."messenger_platform"
);


ALTER TABLE "public"."org_telegram_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "plan" "text" DEFAULT 'free'::"text",
    "timezone" "text" DEFAULT 'Europe/Moscow'::"text",
    "logo_url" "text",
    "goals" "jsonb" DEFAULT '{}'::"jsonb",
    "focus_areas" "text"[] DEFAULT '{}'::"text"[],
    "digest_enabled" boolean DEFAULT true,
    "digest_day" integer DEFAULT 1,
    "digest_time" time without time zone DEFAULT '09:00:00'::time without time zone,
    "last_digest_sent_at" timestamp with time zone,
    "public_description" "text",
    "telegram_group_link" "text",
    "status" "text" DEFAULT 'active'::"text",
    "archived_at" timestamp with time zone,
    "archived_by" "uuid",
    CONSTRAINT "organizations_digest_day_check" CHECK ((("digest_day" >= 0) AND ("digest_day" <= 6))),
    CONSTRAINT "organizations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON TABLE "public"."organizations" IS 'Organizations table. timezone should be set based on owner location or manual settings';



COMMENT ON COLUMN "public"."organizations"."timezone" IS 'Organization timezone (IANA format, e.g. Europe/Moscow, America/New_York)';



COMMENT ON COLUMN "public"."organizations"."logo_url" IS 'URL to organization logo stored in Supabase Storage';



COMMENT ON COLUMN "public"."organizations"."goals" IS 'Organization objectives and weights for goal-driven analytics.
Example:
{
  "retention": 0.35,
  "networking": 0.25,
  "events_attendance": 0.20,
  "content_quality": 0.10,
  "monetization": 0.10
}
Weights should sum to 1.0';



COMMENT ON COLUMN "public"."organizations"."focus_areas" IS 'Main focus areas for the organization (e.g., ["Нетворкинг", "Образование", "Мероприятия"])';



COMMENT ON COLUMN "public"."organizations"."digest_enabled" IS 'Whether weekly digest is enabled';



COMMENT ON COLUMN "public"."organizations"."digest_day" IS 'Day of week for digest (0=Sunday, 1=Monday, etc.)';



COMMENT ON COLUMN "public"."organizations"."digest_time" IS 'Time of day to send digest (org timezone)';



COMMENT ON COLUMN "public"."organizations"."last_digest_sent_at" IS 'Timestamp of last successful digest send';



COMMENT ON COLUMN "public"."organizations"."status" IS 'Organization status: active (default) or archived';



COMMENT ON COLUMN "public"."organizations"."archived_at" IS 'When the organization was archived';



COMMENT ON COLUMN "public"."organizations"."archived_by" IS 'Who archived the organization (superadmin user_id)';



CREATE TABLE IF NOT EXISTS "public"."participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "tg_user_id" bigint,
    "username" "text",
    "full_name" "text",
    "phone" "text",
    "email" "text",
    "interests" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_activity_at" timestamp with time zone,
    "activity_score" integer DEFAULT 0,
    "risk_score" integer DEFAULT 0,
    "merged_into" "uuid",
    "traits_cache" "jsonb",
    "first_name" "text",
    "last_name" "text",
    "source" "text" DEFAULT 'unknown'::"text",
    "status" "text" DEFAULT 'active'::"text",
    "deleted_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "participant_status" "public"."participant_status_enum" DEFAULT 'participant'::"public"."participant_status_enum",
    "photo_url" "text",
    "custom_attributes" "jsonb" DEFAULT '{}'::"jsonb",
    "bio" "text",
    "user_id" "uuid",
    "tg_first_name" "text",
    "tg_last_name" "text",
    "platform" "public"."messenger_platform" DEFAULT 'telegram'::"public"."messenger_platform",
    "platform_user_id" "text",
    CONSTRAINT "bio_max_length" CHECK (("char_length"("bio") <= 60))
);


ALTER TABLE "public"."participants" OWNER TO "postgres";


COMMENT ON TABLE "public"."participants" IS 'Participants table - bio and custom_attributes are org-specific (fixed in migration 066)';



COMMENT ON COLUMN "public"."participants"."tg_user_id" IS 'Telegram user ID for participant identification.
IMPORTANT: Use user_telegram_accounts table for auth.users linkage.
Do NOT use identity_id (removed in migration 42).';



COMMENT ON COLUMN "public"."participants"."full_name" IS 'Редактируемое полное имя участника (может отличаться от Telegram имени)';



COMMENT ON COLUMN "public"."participants"."participant_status" IS 'Статус участника: participant (в группах), event_attendee (только события), candidate (кандидат), excluded (исключён)';



COMMENT ON COLUMN "public"."participants"."photo_url" IS 'URL to participant profile photo stored in Supabase Storage';



COMMENT ON COLUMN "public"."participants"."custom_attributes" IS 'Flexible JSONB field for participant enrichment and custom attributes.

ENRICHMENT STRUCTURE (auto-populated):
{
  // AI-extracted (rule-based)
  "interests_keywords": ["PPC", "рекрутинг", "мероприятия"],
  "interests_weights": {"PPC": 0.45, "рекрутинг": 0.30, "мероприятия": 0.25},
  "city_inferred": "Москва",
  "city_confidence": 0.83,
  "behavioral_role": "helper",  // helper|bridge|observer|broadcaster
  "role_confidence": 0.72,
  "topics_discussed": {
    "PPC": 15,
    "дизайн": 8,
    "мероприятия": 12
  },
  "communication_style": {
    "asks_questions": 0.3,
    "gives_answers": 0.7,
    "reply_rate": 0.65,
    "avg_response_time_hours": 2.5
  },
  
  // User-defined (editable by participant or admin)
  "goals_self": "Найти подрядчика по веб-дизайну",
  "offers": ["Консультации по PPC", "Менторство"],
  "asks": ["Помощь с настройкой Яндекс Директ"],
  "city_confirmed": "Москва",  // User-confirmed city
  "bio_custom": "Специалист по контекстной рекламе",
  
  // Events behavior (auto-calculated)
  "event_attendance": {
    "online_rate": 0.6,
    "offline_rate": 0.9,
    "no_show_rate": 0.1,
    "last_attended": "2025-10-28",
    "total_events": 15
  },
  
  // Meta (system fields)
  "last_enriched_at": "2025-11-05T12:00:00Z",
  "enrichment_version": "1.0",
  "enrichment_source": "auto|manual|hybrid"
}

CUSTOM ATTRIBUTES (admin-defined):
Any additional fields can be added by admins (e.g., "department", "tenure", "badges")
';



COMMENT ON COLUMN "public"."participants"."bio" IS 'Краткое описание участника (до 60 символов): должность, интересы, специализация и т.д.';



COMMENT ON COLUMN "public"."participants"."user_id" IS 'Reference to auth.users. Links participant to authenticated user account.';



COMMENT ON COLUMN "public"."participants"."tg_first_name" IS 'Immutable Telegram first name from API (for matching).
Different from first_name which is editable.';



COMMENT ON COLUMN "public"."participants"."tg_last_name" IS 'Immutable Telegram last name from API (for matching).
Different from last_name which is editable.';



COMMENT ON COLUMN "public"."participants"."platform" IS 'Основная платформа участника';



COMMENT ON COLUMN "public"."participants"."platform_user_id" IS 'ID пользователя на платформе (строка для универсальности)';



CREATE TABLE IF NOT EXISTS "public"."user_telegram_accounts" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "telegram_user_id" bigint NOT NULL,
    "telegram_username" "text",
    "telegram_first_name" "text",
    "telegram_last_name" "text",
    "is_verified" boolean DEFAULT false,
    "verification_code" "text",
    "verification_expires_at" timestamp with time zone,
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_telegram_accounts" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_telegram_accounts" IS 'User Telegram accounts per organization. 
Replaces: profiles.telegram_user_id (removed), telegram_identities (removed in migration 42).
Used for: Telegram auth, admin rights verification, participant linking.';



CREATE OR REPLACE VIEW "public"."organization_admins" AS
 SELECT "m"."org_id",
    "m"."user_id",
    "m"."role",
    "m"."role_source",
    "m"."metadata",
    "m"."created_at",
    "email_info"."email",
    "email_info"."email_confirmed",
    "email_info"."email_confirmed_at",
    COALESCE("p"."full_name", NULLIF(TRIM(BOTH FROM "concat"("uta_any"."telegram_first_name", ' ', "uta_any"."telegram_last_name")), ''::"text"), "uta_any"."telegram_first_name", "email_info"."email", 'Администратор'::"text") AS "full_name",
    COALESCE("uta_current"."telegram_username", "uta_any"."telegram_username", "p"."username") AS "telegram_username",
    COALESCE("uta_current"."telegram_user_id", "uta_any"."telegram_user_id", "p"."tg_user_id") AS "tg_user_id",
    COALESCE("uta_current"."is_verified", "uta_any"."is_verified", false) AS "has_verified_telegram",
    COALESCE("uta_current"."telegram_first_name", "uta_any"."telegram_first_name", "p"."tg_first_name") AS "telegram_first_name",
    COALESCE("uta_current"."telegram_last_name", "uta_any"."telegram_last_name", "p"."tg_last_name") AS "telegram_last_name",
    "o"."name" AS "org_name",
    COALESCE((("m"."metadata" ->> 'shadow_profile'::"text"))::boolean, false) AS "is_shadow_profile",
    ("m"."metadata" ->> 'custom_titles'::"text") AS "custom_titles_json",
    ("m"."metadata" -> 'telegram_groups'::"text") AS "telegram_group_ids",
    ("m"."metadata" -> 'telegram_group_titles'::"text") AS "telegram_group_titles",
    (("m"."metadata" ->> 'synced_at'::"text"))::timestamp with time zone AS "last_synced_at"
   FROM ((((("public"."memberships" "m"
     LEFT JOIN LATERAL "public"."get_user_email_info"("m"."user_id") "email_info"("email", "email_confirmed", "email_confirmed_at") ON (true))
     LEFT JOIN "public"."user_telegram_accounts" "uta_current" ON ((("uta_current"."user_id" = "m"."user_id") AND ("uta_current"."org_id" = "m"."org_id"))))
     LEFT JOIN LATERAL ( SELECT "uta_global"."id",
            "uta_global"."user_id",
            "uta_global"."org_id",
            "uta_global"."telegram_user_id",
            "uta_global"."telegram_username",
            "uta_global"."telegram_first_name",
            "uta_global"."telegram_last_name",
            "uta_global"."is_verified",
            "uta_global"."verification_code",
            "uta_global"."verification_expires_at",
            "uta_global"."verified_at",
            "uta_global"."created_at",
            "uta_global"."updated_at"
           FROM "public"."user_telegram_accounts" "uta_global"
          WHERE (("uta_global"."user_id" = "m"."user_id") AND ("uta_global"."is_verified" = true))
          ORDER BY
                CASE
                    WHEN ("uta_global"."org_id" = "m"."org_id") THEN 0
                    ELSE 1
                END, "uta_global"."verified_at" DESC NULLS LAST
         LIMIT 1) "uta_any" ON (true))
     LEFT JOIN LATERAL ( SELECT "p_inner"."id",
            "p_inner"."org_id",
            "p_inner"."tg_user_id",
            "p_inner"."username",
            "p_inner"."full_name",
            "p_inner"."phone",
            "p_inner"."email",
            "p_inner"."interests",
            "p_inner"."created_at",
            "p_inner"."last_activity_at",
            "p_inner"."activity_score",
            "p_inner"."risk_score",
            "p_inner"."merged_into",
            "p_inner"."traits_cache",
            "p_inner"."first_name",
            "p_inner"."last_name",
            "p_inner"."source",
            "p_inner"."status",
            "p_inner"."deleted_at",
            "p_inner"."created_by",
            "p_inner"."updated_by",
            "p_inner"."notes",
            "p_inner"."updated_at",
            "p_inner"."participant_status",
            "p_inner"."photo_url",
            "p_inner"."custom_attributes",
            "p_inner"."bio",
            "p_inner"."user_id",
            "p_inner"."tg_first_name",
            "p_inner"."tg_last_name"
           FROM "public"."participants" "p_inner"
          WHERE (("p_inner"."user_id" = "m"."user_id") AND ("p_inner"."org_id" = "m"."org_id") AND ("p_inner"."merged_into" IS NULL))
         LIMIT 1) "p" ON (true))
     LEFT JOIN "public"."organizations" "o" ON (("o"."id" = "m"."org_id")))
  WHERE ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]));


ALTER VIEW "public"."organization_admins" OWNER TO "postgres";


COMMENT ON VIEW "public"."organization_admins" IS 'View for managing organization admins with verification status (fixed in migration 160)';



CREATE TABLE IF NOT EXISTS "public"."organization_invite_uses" (
    "id" bigint NOT NULL,
    "invite_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "telegram_user_id" bigint,
    "telegram_username" "text",
    "used_at" timestamp with time zone DEFAULT "now"(),
    "ip_address" "text",
    "user_agent" "text"
);


ALTER TABLE "public"."organization_invite_uses" OWNER TO "postgres";


COMMENT ON TABLE "public"."organization_invite_uses" IS 'Аудит использований приглашений';



CREATE SEQUENCE IF NOT EXISTS "public"."organization_invite_uses_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."organization_invite_uses_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."organization_invite_uses_id_seq" OWNED BY "public"."organization_invite_uses"."id";



CREATE TABLE IF NOT EXISTS "public"."organization_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "access_type" "text" NOT NULL,
    "allowed_materials" "uuid"[],
    "allowed_events" "uuid"[],
    "max_uses" integer,
    "current_uses" integer DEFAULT 0,
    "expires_at" timestamp with time zone,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "organization_invites_access_type_check" CHECK (("access_type" = ANY (ARRAY['full'::"text", 'events_only'::"text", 'materials_only'::"text", 'limited'::"text"]))),
    CONSTRAINT "organization_invites_uses_check" CHECK ((("max_uses" IS NULL) OR ("current_uses" <= "max_uses")))
);


ALTER TABLE "public"."organization_invites" OWNER TO "postgres";


COMMENT ON TABLE "public"."organization_invites" IS 'Приглашения для доступа участников к организациям';



COMMENT ON COLUMN "public"."organization_invites"."token" IS 'Короткий уникальный токен для ссылки (напр. abc123xyz)';



COMMENT ON COLUMN "public"."organization_invites"."access_type" IS 'Тип доступа: full (полный), events_only (только события), materials_only (только материалы), limited (ограниченный)';



COMMENT ON COLUMN "public"."organization_invites"."max_uses" IS 'Максимум использований (NULL = неограниченно)';



COMMENT ON COLUMN "public"."organization_invites"."expires_at" IS 'Дата истечения (NULL = бессрочно)';



CREATE TABLE IF NOT EXISTS "public"."participant_duplicates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "duplicate_participant_id" "uuid" NOT NULL,
    "match_reason" "text" NOT NULL,
    "similarity" numeric,
    "status" "text" DEFAULT 'pending'::"text",
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "resolved_by" "uuid"
);


ALTER TABLE "public"."participant_duplicates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."participant_external_ids" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "org_id" "uuid",
    "system_code" "text" NOT NULL,
    "external_id" "text" NOT NULL,
    "url" "text",
    "data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."participant_external_ids" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."participant_groups" (
    "participant_id" "uuid" NOT NULL,
    "tg_group_id" bigint NOT NULL,
    "joined_at" timestamp with time zone,
    "left_at" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "source" "text" DEFAULT 'webhook_join'::"text",
    CONSTRAINT "participant_groups_source_check" CHECK (("source" = ANY (ARRAY['webhook_join'::"text", 'import'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."participant_groups" OWNER TO "postgres";


COMMENT ON COLUMN "public"."participant_groups"."source" IS 'How participant was added: webhook_join, import, manual';



CREATE TABLE IF NOT EXISTS "public"."participant_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "participant_id" "uuid",
    "tg_user_id" bigint NOT NULL,
    "tg_chat_id" bigint NOT NULL,
    "message_id" bigint NOT NULL,
    "message_text" "text",
    "message_thread_id" bigint,
    "reply_to_message_id" bigint,
    "has_media" boolean DEFAULT false,
    "media_type" "text",
    "chars_count" integer,
    "words_count" integer,
    "sent_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "analyzed_at" timestamp with time zone,
    "analysis_data" "jsonb",
    "message_tsv" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"russian"'::"regconfig", COALESCE("message_text", ''::"text"))) STORED,
    "activity_event_id" integer,
    "platform" "public"."messenger_platform" DEFAULT 'telegram'::"public"."messenger_platform"
);


ALTER TABLE "public"."participant_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."participant_messages" IS 'Stores message texts for AI analysis. Column activity_event_id removed as unused (migration 071)';



COMMENT ON COLUMN "public"."participant_messages"."analysis_data" IS 'JSON с результатами AI-анализа: sentiment, topics, keywords, etc';



COMMENT ON COLUMN "public"."participant_messages"."message_tsv" IS 'Автоматически генерируемый вектор для полнотекстового поиска';



COMMENT ON COLUMN "public"."participant_messages"."activity_event_id" IS 'Links to the activity event that created this message record. Restored in migration 081.';



CREATE TABLE IF NOT EXISTS "public"."participant_tag_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "assigned_by" "uuid"
);


ALTER TABLE "public"."participant_tag_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."participant_tag_assignments" IS 'Many-to-many relationship between participants and tags';



COMMENT ON COLUMN "public"."participant_tag_assignments"."assigned_by" IS 'Admin who assigned the tag';



CREATE TABLE IF NOT EXISTS "public"."participant_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#3B82F6'::"text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."participant_tags" OWNER TO "postgres";


COMMENT ON TABLE "public"."participant_tags" IS 'Custom tags for participant segmentation and CRM (admin-only)';



COMMENT ON COLUMN "public"."participant_tags"."color" IS 'Hex color code for tag display (e.g., #3B82F6)';



CREATE TABLE IF NOT EXISTS "public"."payment_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "method_type" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "instructions" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_methods_method_type_check" CHECK (("method_type" = ANY (ARRAY['bank_transfer'::"text", 'card'::"text", 'cash'::"text", 'online'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."payment_methods" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_methods" IS 'Reusable payment methods for an organization';



CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid",
    "org_id" "uuid" NOT NULL,
    "participant_id" "uuid",
    "payment_type" "text" DEFAULT 'subscription'::"text" NOT NULL,
    "event_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'RUB'::"text" NOT NULL,
    "payment_method" "text" NOT NULL,
    "payment_method_details" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "due_date" "date",
    "paid_at" timestamp with time zone,
    "notes" "text",
    "receipt_url" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payments_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "payments_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['subscription'::"text", 'event'::"text", 'other'::"text"]))),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'failed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


COMMENT ON TABLE "public"."payments" IS 'Manual tracking of payments (subscriptions or events)';



COMMENT ON COLUMN "public"."payments"."subscription_id" IS 'Link to subscription (NULL for event payments)';



COMMENT ON COLUMN "public"."payments"."payment_type" IS 'Type of payment: subscription (membership) or event (ticket/registration)';



COMMENT ON COLUMN "public"."payments"."event_id" IS 'Link to event (NULL for subscription payments)';



CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "plan_name" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'RUB'::"text" NOT NULL,
    "billing_period" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "next_billing_date" "date",
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subscriptions_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "subscriptions_billing_period_check" CHECK (("billing_period" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'annual'::"text", 'one-time'::"text"]))),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."subscriptions" IS 'Manual tracking of membership subscriptions';



COMMENT ON COLUMN "public"."subscriptions"."billing_period" IS 'Frequency of billing: monthly, quarterly, annual, one-time';



COMMENT ON COLUMN "public"."subscriptions"."next_billing_date" IS 'Next expected payment date (NULL for one-time or cancelled)';



CREATE TABLE IF NOT EXISTS "public"."superadmins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "last_login_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."superadmins" OWNER TO "postgres";


COMMENT ON TABLE "public"."superadmins" IS 'Суперадмины платформы с доступом к технической админке';



COMMENT ON COLUMN "public"."superadmins"."user_id" IS 'ID пользователя из auth.users';



COMMENT ON COLUMN "public"."superadmins"."email" IS 'Email суперадмина';



COMMENT ON COLUMN "public"."superadmins"."created_by" IS 'Кто добавил этого суперадмина';



COMMENT ON COLUMN "public"."superadmins"."last_login_at" IS 'Дата последнего входа в админку';



COMMENT ON COLUMN "public"."superadmins"."is_active" IS 'Активен ли доступ';



CREATE TABLE IF NOT EXISTS "public"."telegram_auth_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" character varying(10) NOT NULL,
    "org_id" "uuid",
    "event_id" "uuid",
    "redirect_url" "text",
    "is_used" boolean DEFAULT false,
    "used_at" timestamp with time zone,
    "telegram_user_id" bigint,
    "telegram_username" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone NOT NULL,
    "ip_address" "text",
    "user_agent" "text",
    CONSTRAINT "telegram_auth_codes_expires_check" CHECK (("expires_at" > "created_at"))
);


ALTER TABLE "public"."telegram_auth_codes" OWNER TO "postgres";


COMMENT ON TABLE "public"."telegram_auth_codes" IS 'Telegram authorization codes. Columns ip_address, user_agent removed as unused (migration 072)';



COMMENT ON COLUMN "public"."telegram_auth_codes"."code" IS 'Одноразовый код, генерируется при запросе авторизации (6-10 символов)';



COMMENT ON COLUMN "public"."telegram_auth_codes"."org_id" IS 'ID организации, если авторизация привязана к организации';



COMMENT ON COLUMN "public"."telegram_auth_codes"."event_id" IS 'ID события, если авторизация для регистрации на событие';



COMMENT ON COLUMN "public"."telegram_auth_codes"."expires_at" IS 'Срок действия кода (обычно 10 минут после создания)';



CREATE TABLE IF NOT EXISTS "public"."telegram_chat_migrations" (
    "id" integer NOT NULL,
    "old_chat_id" bigint NOT NULL,
    "new_chat_id" bigint NOT NULL,
    "migrated_at" timestamp with time zone DEFAULT "now"(),
    "migration_result" "jsonb"
);


ALTER TABLE "public"."telegram_chat_migrations" OWNER TO "postgres";


COMMENT ON TABLE "public"."telegram_chat_migrations" IS 'Track Telegram chat_id migrations when groups become supergroups';



CREATE SEQUENCE IF NOT EXISTS "public"."telegram_chat_migrations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."telegram_chat_migrations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."telegram_chat_migrations_id_seq" OWNED BY "public"."telegram_chat_migrations"."id";



CREATE TABLE IF NOT EXISTS "public"."telegram_group_admins" (
    "id" bigint NOT NULL,
    "tg_chat_id" bigint NOT NULL,
    "tg_user_id" bigint NOT NULL,
    "is_owner" boolean DEFAULT false,
    "is_admin" boolean DEFAULT false,
    "can_manage_chat" boolean DEFAULT false,
    "can_delete_messages" boolean DEFAULT false,
    "can_manage_video_chats" boolean DEFAULT false,
    "can_restrict_members" boolean DEFAULT false,
    "can_promote_members" boolean DEFAULT false,
    "can_change_info" boolean DEFAULT false,
    "can_invite_users" boolean DEFAULT false,
    "can_pin_messages" boolean DEFAULT false,
    "verified_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval),
    "custom_title" "text",
    "can_post_messages" boolean DEFAULT false,
    "can_edit_messages" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."telegram_group_admins" OWNER TO "postgres";


COMMENT ON TABLE "public"."telegram_group_admins" IS 'ВАЖНО: После ручного обновления Тимура нужно понять, почему автоматическая деактивация не сработала';



COMMENT ON COLUMN "public"."telegram_group_admins"."expires_at" IS 'Время истечения прав (для периодической ресинхронизации)';



COMMENT ON COLUMN "public"."telegram_group_admins"."custom_title" IS 'Название должности администратора, установленное в Telegram';



CREATE SEQUENCE IF NOT EXISTS "public"."telegram_group_admins_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."telegram_group_admins_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."telegram_group_admins_id_seq" OWNED BY "public"."telegram_group_admins"."id";



CREATE TABLE IF NOT EXISTS "public"."telegram_groups" (
    "id" bigint NOT NULL,
    "tg_chat_id" bigint NOT NULL,
    "title" "text",
    "bot_status" "text",
    "last_sync_at" timestamp with time zone,
    "member_count" integer DEFAULT 0,
    "new_members_count" integer DEFAULT 0,
    "group_goals" "jsonb" DEFAULT '{}'::"jsonb",
    "keywords" "text"[] DEFAULT '{}'::"text"[],
    "description" "text",
    "migrated_to" "text",
    "migrated_from" "text",
    "platform" "public"."messenger_platform" DEFAULT 'telegram'::"public"."messenger_platform",
    CONSTRAINT "telegram_groups_bot_status_check" CHECK (("bot_status" = ANY (ARRAY['connected'::"text", 'pending'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."telegram_groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."telegram_groups" IS 'Stores Telegram group metadata. Columns org_id, invite_link, added_by_user_id removed as unused (migration 071). Use org_telegram_groups for org relationships.';



COMMENT ON COLUMN "public"."telegram_groups"."bot_status" IS 'Bot status in the chat: connected (admin), pending (no admin), inactive (removed). Updated automatically via my_chat_member webhook.';



COMMENT ON COLUMN "public"."telegram_groups"."group_goals" IS 'Group-specific goals and context for analytics.
Example:
{
  "purpose": "Networking",
  "focus": ["Deals", "Partnerships", "B2B"],
  "tone": "professional"
}';



COMMENT ON COLUMN "public"."telegram_groups"."keywords" IS 'Domain-specific keywords for this group (e.g., ["сделка", "партнёрство", "заказ", "B2B"]).
Used to boost relevance in interest extraction and topic detection.';



COMMENT ON COLUMN "public"."telegram_groups"."description" IS 'Human-readable description of the group purpose and rules (shown to participants)';



COMMENT ON COLUMN "public"."telegram_groups"."migrated_to" IS 'New chat_id after group was migrated to supergroup';



COMMENT ON COLUMN "public"."telegram_groups"."migrated_from" IS 'Old chat_id before this group was created from migration';



COMMENT ON COLUMN "public"."telegram_groups"."platform" IS 'Платформа мессенджера для этой группы';



CREATE SEQUENCE IF NOT EXISTS "public"."telegram_groups_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."telegram_groups_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."telegram_groups_id_seq" OWNED BY "public"."telegram_groups"."id";



CREATE TABLE IF NOT EXISTS "public"."telegram_health_events" (
    "id" bigint NOT NULL,
    "tg_chat_id" bigint NOT NULL,
    "org_id" "uuid",
    "event_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "message" "text",
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "telegram_health_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['webhook_success'::"text", 'webhook_failure'::"text", 'admin_check_success'::"text", 'admin_check_failure'::"text", 'sync_success'::"text", 'sync_failure'::"text", 'bot_removed'::"text", 'bot_added'::"text"]))),
    CONSTRAINT "telegram_health_events_status_check" CHECK (("status" = ANY (ARRAY['healthy'::"text", 'degraded'::"text", 'unhealthy'::"text"])))
);


ALTER TABLE "public"."telegram_health_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."telegram_health_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."telegram_health_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."telegram_health_events_id_seq" OWNED BY "public"."telegram_health_events"."id";



CREATE TABLE IF NOT EXISTS "public"."telegram_import_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "tg_chat_id" bigint NOT NULL,
    "filename" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "total_messages" integer NOT NULL,
    "imported_messages" integer DEFAULT 0,
    "new_participants" integer DEFAULT 0,
    "matched_participants" integer DEFAULT 0,
    "date_range_start" timestamp with time zone,
    "date_range_end" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "imported_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "error_message" "text",
    CONSTRAINT "telegram_import_batches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'reviewed'::"text", 'importing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."telegram_import_batches" OWNER TO "postgres";


COMMENT ON TABLE "public"."telegram_import_batches" IS 'Метаданные о батчах импорта истории чата из HTML экспорта Telegram';



CREATE TABLE IF NOT EXISTS "public"."telegram_verification_logs" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "telegram_user_id" bigint,
    "verification_code" "text",
    "action" "text" NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "success" boolean DEFAULT false,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."telegram_verification_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."telegram_verification_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."telegram_verification_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."telegram_verification_logs_id_seq" OWNED BY "public"."telegram_verification_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."telegram_webhook_idempotency" (
    "update_id" bigint NOT NULL,
    "tg_chat_id" bigint NOT NULL,
    "event_type" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."telegram_webhook_idempotency" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_admin_status" WITH ("security_invoker"='true') AS
 SELECT "m"."user_id",
    "m"."org_id",
    "m"."role",
    "m"."role_source",
        CASE
            WHEN ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) THEN true
            ELSE false
        END AS "is_admin",
    ("p"."email" IS NOT NULL) AS "has_email",
    "p"."full_name",
    ("p"."tg_user_id" IS NOT NULL) AS "has_telegram"
   FROM ("public"."memberships" "m"
     LEFT JOIN "public"."participants" "p" ON ((("p"."user_id" = "m"."user_id") AND ("p"."org_id" = "m"."org_id"))));


ALTER VIEW "public"."user_admin_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_group_admin_status" (
    "id" integer NOT NULL,
    "user_id" "uuid",
    "tg_chat_id" bigint,
    "is_admin" boolean DEFAULT false,
    "checked_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_group_admin_status" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."user_group_admin_status_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_group_admin_status_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_group_admin_status_id_seq" OWNED BY "public"."user_group_admin_status"."id";



CREATE TABLE IF NOT EXISTS "public"."user_qualification_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "responses" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "form_version" "text" DEFAULT 'v1'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_qualification_responses" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_qualification_responses" IS 'Stores user qualification/onboarding survey responses in flexible JSONB format';



COMMENT ON COLUMN "public"."user_qualification_responses"."responses" IS 'JSONB object with all qualification answers. Keys: role, community_type, groups_count, pain_points, etc.';



COMMENT ON COLUMN "public"."user_qualification_responses"."form_version" IS 'Version of the qualification form to track which questions were asked';



CREATE SEQUENCE IF NOT EXISTS "public"."user_telegram_accounts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_telegram_accounts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_telegram_accounts_id_seq" OWNED BY "public"."user_telegram_accounts"."id";



CREATE TABLE IF NOT EXISTS "public"."whatsapp_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "group_name" "text",
    "import_status" "text" DEFAULT 'completed'::"text",
    "messages_total" integer DEFAULT 0,
    "messages_imported" integer DEFAULT 0,
    "messages_duplicates" integer DEFAULT 0,
    "participants_total" integer DEFAULT 0,
    "participants_created" integer DEFAULT 0,
    "participants_existing" integer DEFAULT 0,
    "date_range_start" timestamp with time zone,
    "date_range_end" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone DEFAULT "now"(),
    "show_in_menu" boolean DEFAULT false,
    "default_tag_id" "uuid",
    "notes" "text",
    CONSTRAINT "whatsapp_imports_import_status_check" CHECK (("import_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."whatsapp_imports" OWNER TO "postgres";


COMMENT ON TABLE "public"."whatsapp_imports" IS 'Tracks WhatsApp chat import history with statistics';



COMMENT ON COLUMN "public"."whatsapp_imports"."show_in_menu" IS 'Show this WhatsApp group in the left navigation menu';



COMMENT ON COLUMN "public"."whatsapp_imports"."default_tag_id" IS 'Tag to apply to all participants from this import';



COMMENT ON COLUMN "public"."whatsapp_imports"."notes" IS 'Admin notes about this import';



ALTER TABLE ONLY "public"."activity_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."activity_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."admin_action_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."admin_action_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."error_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."error_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."group_metrics" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."group_metrics_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."openai_api_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."openai_api_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."organization_invite_uses" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."organization_invite_uses_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."telegram_chat_migrations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."telegram_chat_migrations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."telegram_group_admins" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."telegram_group_admins_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."telegram_groups" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."telegram_groups_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."telegram_health_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."telegram_health_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."telegram_verification_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."telegram_verification_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_group_admin_status" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_group_admin_status_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_telegram_accounts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_telegram_accounts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."activity_events"
    ADD CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_action_log"
    ADD CONSTRAINT "admin_action_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_requests"
    ADD CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_analytics_events"
    ADD CONSTRAINT "app_analytics_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_collections"
    ADD CONSTRAINT "app_collections_app_id_name_key" UNIQUE ("app_id", "name");



ALTER TABLE ONLY "public"."app_collections"
    ADD CONSTRAINT "app_collections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_items"
    ADD CONSTRAINT "app_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attention_zone_items"
    ADD CONSTRAINT "attention_zone_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_sync_log"
    ADD CONSTRAINT "crm_sync_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_sync_log"
    ADD CONSTRAINT "crm_sync_log_user_id_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."email_auth_tokens"
    ADD CONSTRAINT "email_auth_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_auth_tokens"
    ADD CONSTRAINT "email_auth_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."error_logs"
    ADD CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_registration_fields"
    ADD CONSTRAINT "event_registration_fields_event_id_field_key_key" UNIQUE ("event_id", "field_key");



ALTER TABLE ONLY "public"."event_registration_fields"
    ADD CONSTRAINT "event_registration_fields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_event_id_participant_id_key" UNIQUE ("event_id", "participant_id");



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_telegram_notifications"
    ADD CONSTRAINT "event_telegram_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_metrics"
    ADD CONSTRAINT "group_metrics_org_id_tg_chat_id_date_key" UNIQUE ("org_id", "tg_chat_id", "date");



ALTER TABLE ONLY "public"."group_metrics"
    ADD CONSTRAINT "group_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."material_pages"
    ADD CONSTRAINT "material_pages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."material_pages"
    ADD CONSTRAINT "material_pages_slug_unique" UNIQUE ("org_id", "slug");



ALTER TABLE ONLY "public"."material_search_index"
    ADD CONSTRAINT "material_search_index_pkey" PRIMARY KEY ("page_id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("org_id", "user_id");



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_rule_dedup_unique" UNIQUE ("rule_id", "dedup_hash");



COMMENT ON CONSTRAINT "notification_logs_rule_dedup_unique" ON "public"."notification_logs" IS 'Prevents duplicate notifications for the same rule and dedup hash';



ALTER TABLE ONLY "public"."notification_rules"
    ADD CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."openai_api_logs"
    ADD CONSTRAINT "openai_api_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_telegram_groups"
    ADD CONSTRAINT "org_telegram_groups_pkey" PRIMARY KEY ("org_id", "tg_chat_id");



ALTER TABLE ONLY "public"."organization_invite_uses"
    ADD CONSTRAINT "organization_invite_uses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_invites"
    ADD CONSTRAINT "organization_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_invites"
    ADD CONSTRAINT "organization_invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participant_duplicates"
    ADD CONSTRAINT "participant_duplicates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participant_external_ids"
    ADD CONSTRAINT "participant_external_ids_org_id_system_code_external_id_key" UNIQUE ("org_id", "system_code", "external_id");



ALTER TABLE ONLY "public"."participant_external_ids"
    ADD CONSTRAINT "participant_external_ids_participant_id_system_code_key" UNIQUE ("participant_id", "system_code");



ALTER TABLE ONLY "public"."participant_external_ids"
    ADD CONSTRAINT "participant_external_ids_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participant_groups"
    ADD CONSTRAINT "participant_groups_pkey" PRIMARY KEY ("participant_id", "tg_group_id");



ALTER TABLE ONLY "public"."participant_messages"
    ADD CONSTRAINT "participant_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participant_tag_assignments"
    ADD CONSTRAINT "participant_tag_assignments_participant_id_tag_id_key" UNIQUE ("participant_id", "tag_id");



ALTER TABLE ONLY "public"."participant_tag_assignments"
    ADD CONSTRAINT "participant_tag_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participant_tags"
    ADD CONSTRAINT "participant_tags_org_id_name_key" UNIQUE ("org_id", "name");



ALTER TABLE ONLY "public"."participant_tags"
    ADD CONSTRAINT "participant_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participant_traits"
    ADD CONSTRAINT "participant_traits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_org_tg_user_key" UNIQUE ("org_id", "tg_user_id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."telegram_auth_codes"
    ADD CONSTRAINT "telegram_auth_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_chat_migrations"
    ADD CONSTRAINT "telegram_chat_migrations_old_chat_id_new_chat_id_key" UNIQUE ("old_chat_id", "new_chat_id");



ALTER TABLE ONLY "public"."telegram_chat_migrations"
    ADD CONSTRAINT "telegram_chat_migrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_group_admins"
    ADD CONSTRAINT "telegram_group_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_group_admins"
    ADD CONSTRAINT "telegram_group_admins_tg_chat_id_tg_user_id_key" UNIQUE ("tg_chat_id", "tg_user_id");



ALTER TABLE ONLY "public"."telegram_groups"
    ADD CONSTRAINT "telegram_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_groups"
    ADD CONSTRAINT "telegram_groups_tg_chat_id_key" UNIQUE ("tg_chat_id");



ALTER TABLE ONLY "public"."telegram_health_events"
    ADD CONSTRAINT "telegram_health_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_import_batches"
    ADD CONSTRAINT "telegram_import_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_verification_logs"
    ADD CONSTRAINT "telegram_verification_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_webhook_idempotency"
    ADD CONSTRAINT "telegram_webhook_idempotency_pkey" PRIMARY KEY ("update_id");



ALTER TABLE ONLY "public"."attention_zone_items"
    ADD CONSTRAINT "unique_attention_item" UNIQUE ("org_id", "item_type", "item_id");



ALTER TABLE ONLY "public"."telegram_auth_codes"
    ADD CONSTRAINT "unique_code" UNIQUE ("code");



ALTER TABLE ONLY "public"."user_group_admin_status"
    ADD CONSTRAINT "user_group_admin_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_group_admin_status"
    ADD CONSTRAINT "user_group_admin_status_user_id_tg_chat_id_key" UNIQUE ("user_id", "tg_chat_id");



ALTER TABLE ONLY "public"."user_qualification_responses"
    ADD CONSTRAINT "user_qualification_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_qualification_responses"
    ADD CONSTRAINT "user_qualification_responses_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_telegram_accounts"
    ADD CONSTRAINT "user_telegram_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_telegram_accounts"
    ADD CONSTRAINT "user_telegram_accounts_user_id_org_id_key" UNIQUE ("user_id", "org_id");



ALTER TABLE ONLY "public"."whatsapp_imports"
    ADD CONSTRAINT "whatsapp_imports_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_activity_chat_date" ON "public"."activity_events" USING "btree" ("tg_chat_id", "created_at");



CREATE UNIQUE INDEX "idx_activity_dedup_imported" ON "public"."activity_events" USING "btree" ("tg_chat_id", "tg_user_id", "created_at", "chars_count") WHERE (("event_type" = 'message'::"text") AND ("import_source" = 'html_import'::"text") AND ("tg_user_id" IS NOT NULL));



CREATE INDEX "idx_activity_events_chat_date" ON "public"."activity_events" USING "btree" ("tg_chat_id", "created_at" DESC) WHERE ("tg_chat_id" IS NOT NULL);



CREATE INDEX "idx_activity_events_org_date" ON "public"."activity_events" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_activity_events_org_id_created_at" ON "public"."activity_events" USING "btree" ("org_id", "created_at");



CREATE INDEX "idx_activity_events_platform" ON "public"."activity_events" USING "btree" ("platform");



CREATE INDEX "idx_activity_events_reply_to_user" ON "public"."activity_events" USING "btree" ("reply_to_user_id") WHERE ("reply_to_user_id" IS NOT NULL);



CREATE INDEX "idx_activity_events_type_date" ON "public"."activity_events" USING "btree" ("event_type", "org_id", "created_at" DESC);



CREATE INDEX "idx_activity_events_user_date" ON "public"."activity_events" USING "btree" ("tg_user_id", "created_at" DESC) WHERE ("tg_user_id" IS NOT NULL);



CREATE INDEX "idx_activity_events_whatsapp_participant" ON "public"."activity_events" USING "btree" ((("meta" ->> 'participant_id'::"text"))) WHERE (("tg_chat_id" = 0) AND ("event_type" = 'message'::"text") AND (("meta" ->> 'participant_id'::"text") IS NOT NULL));



CREATE INDEX "idx_activity_import_batch" ON "public"."activity_events" USING "btree" ("import_batch_id") WHERE ("import_batch_id" IS NOT NULL);



CREATE INDEX "idx_activity_org_type_date" ON "public"."activity_events" USING "btree" ("org_id", "event_type", "created_at");



CREATE INDEX "idx_activity_tg_user_id" ON "public"."activity_events" USING "btree" ("tg_user_id");



CREATE INDEX "idx_admin_action_created" ON "public"."admin_action_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_admin_action_org" ON "public"."admin_action_log" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_admin_action_resource" ON "public"."admin_action_log" USING "btree" ("resource_type", "resource_id", "created_at" DESC);



CREATE INDEX "idx_admin_action_user" ON "public"."admin_action_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_ai_requests_applied" ON "public"."ai_requests" USING "btree" ("was_applied") WHERE ("was_applied" = true);



CREATE INDEX "idx_ai_requests_conversation" ON "public"."ai_requests" USING "btree" ("conversation_id") WHERE ("conversation_id" IS NOT NULL);



CREATE INDEX "idx_ai_requests_created" ON "public"."ai_requests" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ai_requests_org" ON "public"."ai_requests" USING "btree" ("org_id");



CREATE INDEX "idx_ai_requests_type" ON "public"."ai_requests" USING "btree" ("request_type");



CREATE INDEX "idx_ai_requests_user" ON "public"."ai_requests" USING "btree" ("user_id");



CREATE INDEX "idx_analytics_app" ON "public"."app_analytics_events" USING "btree" ("app_id", "created_at" DESC);



CREATE INDEX "idx_analytics_type" ON "public"."app_analytics_events" USING "btree" ("event_type", "created_at" DESC);



CREATE INDEX "idx_apps_org" ON "public"."apps" USING "btree" ("org_id");



CREATE INDEX "idx_apps_org_status" ON "public"."apps" USING "btree" ("org_id", "status");



CREATE INDEX "idx_apps_status" ON "public"."apps" USING "btree" ("status");



CREATE INDEX "idx_apps_visibility_status" ON "public"."apps" USING "btree" ("visibility", "status") WHERE ("status" = 'published'::"text");



CREATE INDEX "idx_attention_zone_items_org" ON "public"."attention_zone_items" USING "btree" ("org_id");



CREATE INDEX "idx_attention_zone_items_rotation" ON "public"."attention_zone_items" USING "btree" ("org_id", "last_shown_at", "times_shown");



CREATE INDEX "idx_attention_zone_items_unresolved" ON "public"."attention_zone_items" USING "btree" ("org_id", "item_type", "resolved_at") WHERE ("resolved_at" IS NULL);



CREATE INDEX "idx_collections_app" ON "public"."app_collections" USING "btree" ("app_id");



CREATE INDEX "idx_crm_sync_log_user_id" ON "public"."crm_sync_log" USING "btree" ("user_id");



CREATE INDEX "idx_crm_sync_log_weeek_contact_id" ON "public"."crm_sync_log" USING "btree" ("weeek_contact_id");



CREATE INDEX "idx_crm_sync_log_weeek_deal_id" ON "public"."crm_sync_log" USING "btree" ("weeek_deal_id");



CREATE INDEX "idx_email_auth_tokens_email" ON "public"."email_auth_tokens" USING "btree" ("email");



CREATE INDEX "idx_email_auth_tokens_expires_at" ON "public"."email_auth_tokens" USING "btree" ("expires_at");



CREATE INDEX "idx_email_auth_tokens_token" ON "public"."email_auth_tokens" USING "btree" ("token") WHERE ("is_used" = false);



CREATE INDEX "idx_error_logs_created" ON "public"."error_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_error_logs_fingerprint" ON "public"."error_logs" USING "btree" ("fingerprint", "created_at" DESC);



CREATE INDEX "idx_error_logs_level" ON "public"."error_logs" USING "btree" ("level", "created_at" DESC);



CREATE INDEX "idx_error_logs_org" ON "public"."error_logs" USING "btree" ("org_id", "created_at" DESC) WHERE ("org_id" IS NOT NULL);



CREATE INDEX "idx_error_logs_unresolved" ON "public"."error_logs" USING "btree" ("created_at" DESC) WHERE ("resolved_at" IS NULL);



CREATE INDEX "idx_event_registration_fields_event_id" ON "public"."event_registration_fields" USING "btree" ("event_id");



CREATE INDEX "idx_event_registration_fields_order" ON "public"."event_registration_fields" USING "btree" ("event_id", "field_order");



CREATE INDEX "idx_event_registrations_event_id" ON "public"."event_registrations" USING "btree" ("event_id");



CREATE INDEX "idx_event_registrations_overdue" ON "public"."event_registrations" USING "btree" ("event_id", "payment_status") WHERE (("payment_status")::"text" = ANY ((ARRAY['pending'::character varying, 'overdue'::character varying])::"text"[]));



CREATE INDEX "idx_event_registrations_participant_id" ON "public"."event_registrations" USING "btree" ("participant_id");



CREATE INDEX "idx_event_registrations_payment_status" ON "public"."event_registrations" USING "btree" ("event_id", "payment_status");



CREATE INDEX "idx_event_registrations_registration_data" ON "public"."event_registrations" USING "gin" ("registration_data");



CREATE INDEX "idx_event_registrations_status" ON "public"."event_registrations" USING "btree" ("status");



CREATE INDEX "idx_event_registrations_status_event" ON "public"."event_registrations" USING "btree" ("status", "event_id");



CREATE INDEX "idx_event_telegram_notifications_event_id" ON "public"."event_telegram_notifications" USING "btree" ("event_id");



CREATE INDEX "idx_event_telegram_notifications_scheduled" ON "public"."event_telegram_notifications" USING "btree" ("scheduled_at") WHERE ("status" = 'scheduled'::"text");



CREATE INDEX "idx_event_telegram_notifications_status" ON "public"."event_telegram_notifications" USING "btree" ("status");



CREATE INDEX "idx_events_date_range" ON "public"."events" USING "btree" ("event_date", "end_date");



CREATE INDEX "idx_events_end_date" ON "public"."events" USING "btree" ("end_date");



CREATE INDEX "idx_events_event_date" ON "public"."events" USING "btree" ("event_date");



CREATE INDEX "idx_events_org_id" ON "public"."events" USING "btree" ("org_id");



CREATE INDEX "idx_events_org_status_date" ON "public"."events" USING "btree" ("org_id", "status", "event_date");



CREATE INDEX "idx_events_requires_payment" ON "public"."events" USING "btree" ("requires_payment") WHERE ("requires_payment" = true);



CREATE INDEX "idx_events_status" ON "public"."events" USING "btree" ("status");



CREATE INDEX "idx_import_batches_chat" ON "public"."telegram_import_batches" USING "btree" ("tg_chat_id");



CREATE INDEX "idx_import_batches_org" ON "public"."telegram_import_batches" USING "btree" ("org_id");



CREATE INDEX "idx_import_batches_status" ON "public"."telegram_import_batches" USING "btree" ("status");



CREATE INDEX "idx_invitations_email" ON "public"."invitations" USING "btree" ("email");



CREATE INDEX "idx_invitations_expires_at" ON "public"."invitations" USING "btree" ("expires_at");



CREATE INDEX "idx_invitations_org_id" ON "public"."invitations" USING "btree" ("org_id");



CREATE INDEX "idx_invitations_org_status_active" ON "public"."invitations" USING "btree" ("org_id", "status", "expires_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_invitations_status" ON "public"."invitations" USING "btree" ("status");



CREATE INDEX "idx_invitations_token" ON "public"."invitations" USING "btree" ("token");



CREATE INDEX "idx_invite_uses_invite" ON "public"."organization_invite_uses" USING "btree" ("invite_id");



CREATE INDEX "idx_invite_uses_user" ON "public"."organization_invite_uses" USING "btree" ("user_id");



CREATE INDEX "idx_invites_active" ON "public"."organization_invites" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_invites_expires" ON "public"."organization_invites" USING "btree" ("expires_at") WHERE ("expires_at" IS NOT NULL);



CREATE INDEX "idx_invites_org" ON "public"."organization_invites" USING "btree" ("org_id");



CREATE INDEX "idx_invites_token" ON "public"."organization_invites" USING "btree" ("token");



CREATE INDEX "idx_items_collection" ON "public"."app_items" USING "btree" ("collection_id");



CREATE INDEX "idx_items_created" ON "public"."app_items" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_items_creator" ON "public"."app_items" USING "btree" ("creator_id");



CREATE INDEX "idx_items_data" ON "public"."app_items" USING "gin" ("data");



CREATE INDEX "idx_items_location" ON "public"."app_items" USING "btree" ("location_lat", "location_lon") WHERE (("location_lat" IS NOT NULL) AND ("location_lon" IS NOT NULL));



CREATE INDEX "idx_items_org" ON "public"."app_items" USING "btree" ("org_id");



CREATE INDEX "idx_items_status" ON "public"."app_items" USING "btree" ("status");



CREATE INDEX "idx_memberships_metadata" ON "public"."memberships" USING "gin" ("metadata");



CREATE INDEX "idx_memberships_role_source" ON "public"."memberships" USING "btree" ("role_source");



CREATE INDEX "idx_notification_logs_created" ON "public"."notification_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notification_logs_dedup" ON "public"."notification_logs" USING "btree" ("rule_id", "dedup_hash", "created_at");



CREATE INDEX "idx_notification_logs_dedup_check" ON "public"."notification_logs" USING "btree" ("rule_id", "dedup_hash", "created_at" DESC);



CREATE INDEX "idx_notification_logs_org" ON "public"."notification_logs" USING "btree" ("org_id");



CREATE INDEX "idx_notification_logs_recent_dedup" ON "public"."notification_logs" USING "btree" ("rule_id", "dedup_hash", "created_at" DESC, "notification_status");



CREATE INDEX "idx_notification_logs_resolved_recent" ON "public"."notification_logs" USING "btree" ("org_id", "resolved_at" DESC) WHERE ("resolved_at" IS NOT NULL);



CREATE INDEX "idx_notification_logs_rule" ON "public"."notification_logs" USING "btree" ("rule_id");



CREATE INDEX "idx_notification_logs_status" ON "public"."notification_logs" USING "btree" ("notification_status") WHERE ("notification_status" = 'pending'::"text");



CREATE INDEX "idx_notification_logs_unresolved" ON "public"."notification_logs" USING "btree" ("org_id", "notification_status", "resolved_at") WHERE (("resolved_at" IS NULL) AND ("notification_status" = 'sent'::"text"));



CREATE INDEX "idx_notification_rules_enabled" ON "public"."notification_rules" USING "btree" ("org_id", "is_enabled") WHERE ("is_enabled" = true);



CREATE INDEX "idx_notification_rules_org" ON "public"."notification_rules" USING "btree" ("org_id");



CREATE UNIQUE INDEX "idx_notification_rules_org_name" ON "public"."notification_rules" USING "btree" ("org_id", "name");



CREATE INDEX "idx_notification_rules_type" ON "public"."notification_rules" USING "btree" ("rule_type");



CREATE INDEX "idx_openai_logs_created" ON "public"."openai_api_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_openai_logs_org_created" ON "public"."openai_api_logs" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_openai_logs_request_type" ON "public"."openai_api_logs" USING "btree" ("request_type", "created_at" DESC);



CREATE INDEX "idx_org_telegram_groups_platform" ON "public"."org_telegram_groups" USING "btree" ("platform");



CREATE INDEX "idx_organizations_goals" ON "public"."organizations" USING "gin" ("goals");



CREATE INDEX "idx_organizations_status" ON "public"."organizations" USING "btree" ("status") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_orgs_digest_enabled" ON "public"."organizations" USING "btree" ("digest_enabled", "digest_day", "timezone") WHERE ("digest_enabled" = true);



CREATE INDEX "idx_participant_groups_joined" ON "public"."participant_groups" USING "btree" ("tg_group_id", "joined_at" DESC);



CREATE INDEX "idx_participant_groups_lookup" ON "public"."participant_groups" USING "btree" ("participant_id", "tg_group_id");



CREATE INDEX "idx_participant_messages_activity_event" ON "public"."participant_messages" USING "btree" ("activity_event_id");



CREATE INDEX "idx_participant_messages_analyzed" ON "public"."participant_messages" USING "btree" ("analyzed_at") WHERE ("analyzed_at" IS NULL);



CREATE INDEX "idx_participant_messages_chat" ON "public"."participant_messages" USING "btree" ("tg_chat_id", "sent_at" DESC);



CREATE INDEX "idx_participant_messages_org" ON "public"."participant_messages" USING "btree" ("org_id", "sent_at" DESC);



CREATE INDEX "idx_participant_messages_org_participant" ON "public"."participant_messages" USING "btree" ("org_id", "participant_id");



CREATE INDEX "idx_participant_messages_participant" ON "public"."participant_messages" USING "btree" ("participant_id", "sent_at" DESC);



CREATE INDEX "idx_participant_messages_platform" ON "public"."participant_messages" USING "btree" ("platform");



CREATE INDEX "idx_participant_messages_tsv" ON "public"."participant_messages" USING "gin" ("message_tsv");



CREATE UNIQUE INDEX "idx_participant_messages_unique" ON "public"."participant_messages" USING "btree" ("tg_chat_id", "message_id");



CREATE INDEX "idx_participant_messages_user" ON "public"."participant_messages" USING "btree" ("tg_user_id", "sent_at" DESC);



CREATE INDEX "idx_participant_tags_name" ON "public"."participant_tags" USING "btree" ("org_id", "name");



CREATE INDEX "idx_participant_tags_org" ON "public"."participant_tags" USING "btree" ("org_id");



CREATE INDEX "idx_participants_bio" ON "public"."participants" USING "gin" ("to_tsvector"('"russian"'::"regconfig", COALESCE("bio", ''::"text")));



CREATE INDEX "idx_participants_custom_attributes" ON "public"."participants" USING "gin" ("custom_attributes");



CREATE INDEX "idx_participants_email" ON "public"."participants" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE INDEX "idx_participants_last_activity" ON "public"."participants" USING "btree" ("org_id", "last_activity_at" DESC NULLS LAST);



CREATE INDEX "idx_participants_org_id" ON "public"."participants" USING "btree" ("org_id");



CREATE INDEX "idx_participants_org_status" ON "public"."participants" USING "btree" ("org_id", "participant_status");



CREATE INDEX "idx_participants_org_tg_user" ON "public"."participants" USING "btree" ("org_id", "tg_user_id") WHERE ("merged_into" IS NULL);



COMMENT ON INDEX "public"."idx_participants_org_tg_user" IS 'Быстрый поиск участников по организации и Telegram ID (только не объединенные)';



CREATE INDEX "idx_participants_org_tguser_active" ON "public"."participants" USING "btree" ("org_id", "tg_user_id") WHERE ("merged_into" IS NULL);



CREATE INDEX "idx_participants_org_user" ON "public"."participants" USING "btree" ("org_id", "user_id");



CREATE INDEX "idx_participants_photo_url" ON "public"."participants" USING "btree" ("photo_url") WHERE ("photo_url" IS NOT NULL);



CREATE INDEX "idx_participants_platform" ON "public"."participants" USING "btree" ("platform");



CREATE INDEX "idx_participants_platform_user" ON "public"."participants" USING "btree" ("platform", "platform_user_id");



CREATE INDEX "idx_participants_status" ON "public"."participants" USING "btree" ("participant_status");



CREATE INDEX "idx_participants_tg_names" ON "public"."participants" USING "btree" ("tg_first_name", "tg_last_name") WHERE ("tg_first_name" IS NOT NULL);



CREATE INDEX "idx_participants_tg_user_id" ON "public"."participants" USING "btree" ("tg_user_id");



CREATE UNIQUE INDEX "idx_participants_unique_email_per_org" ON "public"."participants" USING "btree" ("org_id", "email") WHERE (("email" IS NOT NULL) AND ("email" <> ''::"text") AND ("merged_into" IS NULL));



CREATE UNIQUE INDEX "idx_participants_unique_tg_user_per_org" ON "public"."participants" USING "btree" ("org_id", "tg_user_id") WHERE (("tg_user_id" IS NOT NULL) AND ("merged_into" IS NULL));



CREATE INDEX "idx_participants_user_id" ON "public"."participants" USING "btree" ("user_id");



CREATE INDEX "idx_payment_methods_org" ON "public"."payment_methods" USING "btree" ("org_id");



CREATE INDEX "idx_payments_due_date" ON "public"."payments" USING "btree" ("due_date") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_payments_event" ON "public"."payments" USING "btree" ("event_id") WHERE ("event_id" IS NOT NULL);



CREATE INDEX "idx_payments_org" ON "public"."payments" USING "btree" ("org_id");



CREATE INDEX "idx_payments_status" ON "public"."payments" USING "btree" ("status");



CREATE INDEX "idx_payments_subscription" ON "public"."payments" USING "btree" ("subscription_id") WHERE ("subscription_id" IS NOT NULL);



CREATE INDEX "idx_qualification_completed" ON "public"."user_qualification_responses" USING "btree" ("completed_at") WHERE ("completed_at" IS NOT NULL);



CREATE INDEX "idx_qualification_form_version" ON "public"."user_qualification_responses" USING "btree" ("form_version");



CREATE INDEX "idx_qualification_responses_gin" ON "public"."user_qualification_responses" USING "gin" ("responses");



CREATE INDEX "idx_qualification_user_id" ON "public"."user_qualification_responses" USING "btree" ("user_id");



CREATE INDEX "idx_subscriptions_next_billing" ON "public"."subscriptions" USING "btree" ("next_billing_date") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_subscriptions_org" ON "public"."subscriptions" USING "btree" ("org_id");



CREATE INDEX "idx_subscriptions_participant" ON "public"."subscriptions" USING "btree" ("participant_id");



CREATE INDEX "idx_subscriptions_status" ON "public"."subscriptions" USING "btree" ("status");



CREATE INDEX "idx_superadmins_email" ON "public"."superadmins" USING "btree" ("email");



CREATE INDEX "idx_superadmins_is_active" ON "public"."superadmins" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_superadmins_user_id" ON "public"."superadmins" USING "btree" ("user_id");



CREATE INDEX "idx_tag_assignments_assigned_at" ON "public"."participant_tag_assignments" USING "btree" ("assigned_at" DESC);



CREATE INDEX "idx_tag_assignments_participant" ON "public"."participant_tag_assignments" USING "btree" ("participant_id");



CREATE INDEX "idx_tag_assignments_tag" ON "public"."participant_tag_assignments" USING "btree" ("tag_id");



CREATE INDEX "idx_telegram_auth_codes_cleanup" ON "public"."telegram_auth_codes" USING "btree" ("expires_at", "is_used");



CREATE INDEX "idx_telegram_auth_codes_code" ON "public"."telegram_auth_codes" USING "btree" ("code") WHERE ("is_used" = false);



CREATE INDEX "idx_telegram_auth_codes_event_id" ON "public"."telegram_auth_codes" USING "btree" ("event_id");



CREATE INDEX "idx_telegram_auth_codes_expires_at" ON "public"."telegram_auth_codes" USING "btree" ("expires_at");



CREATE INDEX "idx_telegram_auth_codes_org_id" ON "public"."telegram_auth_codes" USING "btree" ("org_id");



CREATE INDEX "idx_telegram_auth_codes_telegram_user_id" ON "public"."telegram_auth_codes" USING "btree" ("telegram_user_id");



CREATE INDEX "idx_telegram_group_admins_chat" ON "public"."telegram_group_admins" USING "btree" ("tg_chat_id");



CREATE INDEX "idx_telegram_group_admins_expires" ON "public"."telegram_group_admins" USING "btree" ("expires_at") WHERE ("is_admin" = true);



CREATE INDEX "idx_telegram_group_admins_user" ON "public"."telegram_group_admins" USING "btree" ("tg_user_id");



CREATE INDEX "idx_telegram_groups_goals" ON "public"."telegram_groups" USING "gin" ("group_goals");



CREATE INDEX "idx_telegram_groups_keywords" ON "public"."telegram_groups" USING "gin" ("keywords");



CREATE INDEX "idx_telegram_groups_migrated_from" ON "public"."telegram_groups" USING "btree" ("migrated_from") WHERE ("migrated_from" IS NOT NULL);



CREATE INDEX "idx_telegram_groups_migrated_to" ON "public"."telegram_groups" USING "btree" ("migrated_to") WHERE ("migrated_to" IS NOT NULL);



CREATE INDEX "idx_telegram_groups_platform" ON "public"."telegram_groups" USING "btree" ("platform");



CREATE INDEX "idx_telegram_groups_tg_chat_id_text" ON "public"."telegram_groups" USING "btree" ((("tg_chat_id")::"text"));



CREATE UNIQUE INDEX "idx_telegram_groups_tg_chat_id_unique" ON "public"."telegram_groups" USING "btree" ("tg_chat_id");



COMMENT ON INDEX "public"."idx_telegram_groups_tg_chat_id_unique" IS 'Ensures no duplicate chat_ids in telegram_groups';



CREATE INDEX "idx_telegram_health_chat" ON "public"."telegram_health_events" USING "btree" ("tg_chat_id", "created_at" DESC);



CREATE INDEX "idx_telegram_health_created" ON "public"."telegram_health_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_telegram_health_org" ON "public"."telegram_health_events" USING "btree" ("org_id", "created_at" DESC) WHERE ("org_id" IS NOT NULL);



CREATE INDEX "idx_telegram_health_status" ON "public"."telegram_health_events" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_user_telegram_accounts_tg_id" ON "public"."user_telegram_accounts" USING "btree" ("telegram_user_id");



CREATE INDEX "idx_user_telegram_accounts_verification" ON "public"."user_telegram_accounts" USING "btree" ("verification_code", "verification_expires_at");



CREATE INDEX "idx_webhook_idempotency_created" ON "public"."telegram_webhook_idempotency" USING "btree" ("created_at");



CREATE INDEX "idx_webhook_idempotency_org" ON "public"."telegram_webhook_idempotency" USING "btree" ("org_id") WHERE ("org_id" IS NOT NULL);



CREATE INDEX "idx_whatsapp_imports_created_at" ON "public"."whatsapp_imports" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_whatsapp_imports_org_id" ON "public"."whatsapp_imports" USING "btree" ("org_id");



CREATE INDEX "idx_whatsapp_imports_show_in_menu" ON "public"."whatsapp_imports" USING "btree" ("org_id", "show_in_menu") WHERE ("show_in_menu" = true);



CREATE INDEX "material_pages_org_parent_idx" ON "public"."material_pages" USING "btree" ("org_id", "parent_id", "position");



CREATE INDEX "material_pages_org_visibility_idx" ON "public"."material_pages" USING "btree" ("org_id", "visibility", "is_published");



CREATE INDEX "org_telegram_groups_archived_at_idx" ON "public"."org_telegram_groups" USING "btree" ("archived_at");



CREATE INDEX "org_telegram_groups_status_idx" ON "public"."org_telegram_groups" USING "btree" ("status");



CREATE INDEX "org_telegram_groups_tg_chat_id_idx" ON "public"."org_telegram_groups" USING "btree" ("tg_chat_id");



CREATE INDEX "participant_duplicates_org_status_idx" ON "public"."participant_duplicates" USING "btree" ("org_id", "status", "similarity" DESC);



CREATE INDEX "participant_duplicates_participant_idx" ON "public"."participant_duplicates" USING "btree" ("participant_id");



CREATE INDEX "participant_external_ids_participant_idx" ON "public"."participant_external_ids" USING "btree" ("participant_id");



CREATE INDEX "participant_traits_key_idx" ON "public"."participant_traits" USING "btree" ("participant_id", "trait_key");



CREATE INDEX "participant_traits_source_idx" ON "public"."participant_traits" USING "btree" ("source");



CREATE UNIQUE INDEX "participant_traits_unique_key_value" ON "public"."participant_traits" USING "btree" ("participant_id", "trait_key", "trait_value");



CREATE INDEX "participant_traits_updated_at_idx" ON "public"."participant_traits" USING "btree" ("updated_at" DESC);



CREATE INDEX "participants_email_idx" ON "public"."participants" USING "btree" ("org_id", "email");



CREATE INDEX "participants_full_name_trgm_idx" ON "public"."participants" USING "gin" ((((COALESCE("full_name", ''::"text") || ' '::"text") || COALESCE("username", ''::"text"))) "public"."gin_trgm_ops");



CREATE INDEX "participants_merged_into_idx" ON "public"."participants" USING "btree" ("merged_into");



CREATE INDEX "participants_org_source_idx" ON "public"."participants" USING "btree" ("org_id", "source");



CREATE INDEX "participants_phone_idx" ON "public"."participants" USING "btree" ("org_id", "phone");



CREATE OR REPLACE TRIGGER "events_updated_at_trigger" BEFORE UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."update_events_updated_at"();



CREATE OR REPLACE TRIGGER "invitations_updated_at_trigger" BEFORE UPDATE ON "public"."invitations" FOR EACH ROW EXECUTE FUNCTION "public"."update_invitations_updated_at"();



CREATE OR REPLACE TRIGGER "material_pages_position_trigger" BEFORE INSERT ON "public"."material_pages" FOR EACH ROW EXECUTE FUNCTION "public"."material_pages_set_position"();



CREATE OR REPLACE TRIGGER "material_pages_touch_trigger" BEFORE UPDATE ON "public"."material_pages" FOR EACH ROW EXECUTE FUNCTION "public"."material_pages_touch_updated_at"();



CREATE OR REPLACE TRIGGER "material_search_index_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."material_pages" FOR EACH ROW EXECUTE FUNCTION "public"."material_search_index_refresh"();



CREATE OR REPLACE TRIGGER "notification_rules_updated_at" BEFORE UPDATE ON "public"."notification_rules" FOR EACH ROW EXECUTE FUNCTION "public"."update_notification_rules_updated_at"();



CREATE OR REPLACE TRIGGER "set_participant_duplicates_updated_at" BEFORE UPDATE ON "public"."participant_duplicates" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."set_participant_duplicates_updated_at"();



CREATE OR REPLACE TRIGGER "set_participants_updated_at" BEFORE UPDATE ON "public"."participants" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "telegram_group_admins_updated_at" BEFORE UPDATE ON "public"."telegram_group_admins" FOR EACH ROW EXECUTE FUNCTION "public"."update_telegram_group_admins_updated_at"();



CREATE OR REPLACE TRIGGER "trg_create_system_rules" AFTER INSERT ON "public"."org_telegram_groups" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_create_system_rules"();



CREATE OR REPLACE TRIGGER "trg_update_crm_sync_log_updated_at" BEFORE UPDATE ON "public"."crm_sync_log" FOR EACH ROW EXECUTE FUNCTION "public"."update_crm_sync_log_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_check_participant_exclusion" AFTER DELETE ON "public"."participant_groups" FOR EACH ROW EXECUTE FUNCTION "public"."check_participant_exclusion"();



CREATE OR REPLACE TRIGGER "trigger_participant_tags_updated_at" BEFORE UPDATE ON "public"."participant_tags" FOR EACH ROW EXECUTE FUNCTION "public"."update_participant_tags_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_restore_participant_status" AFTER INSERT ON "public"."participant_groups" FOR EACH ROW EXECUTE FUNCTION "public"."restore_participant_status"();



CREATE OR REPLACE TRIGGER "trigger_set_registration_price" BEFORE INSERT ON "public"."event_registrations" FOR EACH ROW EXECUTE FUNCTION "public"."set_registration_price_from_event"();



CREATE OR REPLACE TRIGGER "trigger_update_invite_updated_at" BEFORE UPDATE ON "public"."organization_invites" FOR EACH ROW EXECUTE FUNCTION "public"."update_invite_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_participant_from_registration" AFTER INSERT OR UPDATE OF "registration_data" ON "public"."event_registrations" FOR EACH ROW EXECUTE FUNCTION "public"."update_participant_from_registration_data"();



CREATE OR REPLACE TRIGGER "trigger_update_participant_scores" BEFORE INSERT OR UPDATE OF "last_activity_at" ON "public"."participants" FOR EACH ROW EXECUTE FUNCTION "public"."update_participant_scores_trigger"();



CREATE OR REPLACE TRIGGER "trigger_validate_registration_quantity" BEFORE INSERT OR UPDATE OF "quantity" ON "public"."event_registrations" FOR EACH ROW EXECUTE FUNCTION "public"."validate_registration_quantity"();



CREATE OR REPLACE TRIGGER "update_apps_updated_at" BEFORE UPDATE ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_collections_updated_at" BEFORE UPDATE ON "public"."app_collections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_items_updated_at" BEFORE UPDATE ON "public"."app_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_member_count_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."participant_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_group_member_count"();



CREATE OR REPLACE TRIGGER "update_payment_methods_updated_at" BEFORE UPDATE ON "public"."payment_methods" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_qualification_updated_at" BEFORE UPDATE ON "public"."user_qualification_responses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."activity_events"
    ADD CONSTRAINT "activity_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_action_log"
    ADD CONSTRAINT "admin_action_log_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_action_log"
    ADD CONSTRAINT "admin_action_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_requests"
    ADD CONSTRAINT "ai_requests_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_requests"
    ADD CONSTRAINT "ai_requests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_requests"
    ADD CONSTRAINT "ai_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."app_analytics_events"
    ADD CONSTRAINT "app_analytics_events_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_analytics_events"
    ADD CONSTRAINT "app_analytics_events_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."app_collections"("id");



ALTER TABLE ONLY "public"."app_analytics_events"
    ADD CONSTRAINT "app_analytics_events_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."app_items"("id");



ALTER TABLE ONLY "public"."app_analytics_events"
    ADD CONSTRAINT "app_analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."app_collections"
    ADD CONSTRAINT "app_collections_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_items"
    ADD CONSTRAINT "app_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."app_collections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_items"
    ADD CONSTRAINT "app_items_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."participants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."app_items"
    ADD CONSTRAINT "app_items_moderated_by_fkey" FOREIGN KEY ("moderated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."app_items"
    ADD CONSTRAINT "app_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attention_zone_items"
    ADD CONSTRAINT "attention_zone_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attention_zone_items"
    ADD CONSTRAINT "attention_zone_items_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_sync_log"
    ADD CONSTRAINT "crm_sync_log_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_sync_log"
    ADD CONSTRAINT "crm_sync_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."error_logs"
    ADD CONSTRAINT "error_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."error_logs"
    ADD CONSTRAINT "error_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_registration_fields"
    ADD CONSTRAINT "event_registration_fields_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_payment_updated_by_fkey" FOREIGN KEY ("payment_updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."event_telegram_notifications"
    ADD CONSTRAINT "event_telegram_notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_telegram_notifications"
    ADD CONSTRAINT "event_telegram_notifications_tg_group_id_fkey" FOREIGN KEY ("tg_group_id") REFERENCES "public"."telegram_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_metrics"
    ADD CONSTRAINT "group_metrics_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."material_pages"
    ADD CONSTRAINT "material_pages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."material_pages"
    ADD CONSTRAINT "material_pages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."material_pages"
    ADD CONSTRAINT "material_pages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."material_pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."material_pages"
    ADD CONSTRAINT "material_pages_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."material_search_index"
    ADD CONSTRAINT "material_search_index_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."material_search_index"
    ADD CONSTRAINT "material_search_index_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."material_pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."notification_rules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_rules"
    ADD CONSTRAINT "notification_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."notification_rules"
    ADD CONSTRAINT "notification_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."openai_api_logs"
    ADD CONSTRAINT "openai_api_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."openai_api_logs"
    ADD CONSTRAINT "openai_api_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_telegram_groups"
    ADD CONSTRAINT "org_telegram_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."org_telegram_groups"
    ADD CONSTRAINT "org_telegram_groups_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_telegram_groups"
    ADD CONSTRAINT "org_telegram_groups_tg_chat_id_fkey" FOREIGN KEY ("tg_chat_id") REFERENCES "public"."telegram_groups"("tg_chat_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_invite_uses"
    ADD CONSTRAINT "organization_invite_uses_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "public"."organization_invites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_invite_uses"
    ADD CONSTRAINT "organization_invite_uses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organization_invites"
    ADD CONSTRAINT "organization_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_invites"
    ADD CONSTRAINT "organization_invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."participant_duplicates"
    ADD CONSTRAINT "participant_duplicates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."participant_duplicates"
    ADD CONSTRAINT "participant_duplicates_duplicate_participant_id_fkey" FOREIGN KEY ("duplicate_participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_duplicates"
    ADD CONSTRAINT "participant_duplicates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_duplicates"
    ADD CONSTRAINT "participant_duplicates_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_duplicates"
    ADD CONSTRAINT "participant_duplicates_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."participant_external_ids"
    ADD CONSTRAINT "participant_external_ids_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_external_ids"
    ADD CONSTRAINT "participant_external_ids_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_groups"
    ADD CONSTRAINT "participant_groups_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_groups"
    ADD CONSTRAINT "participant_groups_tg_group_id_fkey" FOREIGN KEY ("tg_group_id") REFERENCES "public"."telegram_groups"("tg_chat_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_messages"
    ADD CONSTRAINT "participant_messages_activity_event_id_fkey" FOREIGN KEY ("activity_event_id") REFERENCES "public"."activity_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."participant_messages"
    ADD CONSTRAINT "participant_messages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_messages"
    ADD CONSTRAINT "participant_messages_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_tag_assignments"
    ADD CONSTRAINT "participant_tag_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."participant_tag_assignments"
    ADD CONSTRAINT "participant_tag_assignments_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_tag_assignments"
    ADD CONSTRAINT "participant_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."participant_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_tags"
    ADD CONSTRAINT "participant_tags_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."participant_tags"
    ADD CONSTRAINT "participant_tags_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_traits"
    ADD CONSTRAINT "participant_traits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."participant_traits"
    ADD CONSTRAINT "participant_traits_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_traits"
    ADD CONSTRAINT "participant_traits_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_merged_into_fkey" FOREIGN KEY ("merged_into") REFERENCES "public"."participants"("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."telegram_auth_codes"
    ADD CONSTRAINT "telegram_auth_codes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."telegram_auth_codes"
    ADD CONSTRAINT "telegram_auth_codes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."telegram_health_events"
    ADD CONSTRAINT "telegram_health_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."telegram_import_batches"
    ADD CONSTRAINT "telegram_import_batches_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."telegram_import_batches"
    ADD CONSTRAINT "telegram_import_batches_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."telegram_verification_logs"
    ADD CONSTRAINT "telegram_verification_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."telegram_verification_logs"
    ADD CONSTRAINT "telegram_verification_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_group_admin_status"
    ADD CONSTRAINT "user_group_admin_status_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_qualification_responses"
    ADD CONSTRAINT "user_qualification_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_telegram_accounts"
    ADD CONSTRAINT "user_telegram_accounts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_telegram_accounts"
    ADD CONSTRAINT "user_telegram_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_imports"
    ADD CONSTRAINT "whatsapp_imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."whatsapp_imports"
    ADD CONSTRAINT "whatsapp_imports_default_tag_id_fkey" FOREIGN KEY ("default_tag_id") REFERENCES "public"."participant_tags"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_imports"
    ADD CONSTRAINT "whatsapp_imports_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



CREATE POLICY "Activated admins can create materials" ON "public"."material_pages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "material_pages"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Activated admins can delete materials" ON "public"."material_pages" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "material_pages"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Activated admins can update materials" ON "public"."material_pages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "material_pages"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can create apps" ON "public"."apps" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "apps"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can create events" ON "public"."events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "events"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can create invites" ON "public"."organization_invites" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "organization_invites"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can delete events" ON "public"."events" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "events"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can delete memberships" ON "public"."memberships" FOR DELETE USING ("public"."user_is_org_admin"("org_id"));



CREATE POLICY "Admins can delete org invites" ON "public"."organization_invites" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "organization_invites"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can delete registrations" ON "public"."event_registrations" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "e"."org_id")))
  WHERE (("e"."id" = "event_registrations"."event_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can insert new memberships" ON "public"."memberships" FOR INSERT WITH CHECK ("public"."user_is_org_admin"("org_id"));



CREATE POLICY "Admins can manage participants" ON "public"."participants" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "participants"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can manage registration fields" ON "public"."event_registration_fields" USING ((EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "e"."org_id")))
  WHERE (("e"."id" = "event_registration_fields"."event_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can update apps" ON "public"."apps" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "apps"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can update events" ON "public"."events" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "events"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can update memberships" ON "public"."memberships" FOR UPDATE USING ("public"."user_is_org_admin"("org_id"));



CREATE POLICY "Admins can update org invites" ON "public"."organization_invites" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "organization_invites"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can view analytics" ON "public"."app_analytics_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."apps" "a"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "a"."org_id")))
  WHERE (("a"."id" = "app_analytics_events"."app_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can view invite uses" ON "public"."organization_invite_uses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."organization_invites" "oi"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "oi"."org_id")))
  WHERE (("oi"."id" = "organization_invite_uses"."invite_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can view org imports" ON "public"."whatsapp_imports" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "whatsapp_imports"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can view org invites" ON "public"."organization_invites" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "organization_invites"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Apps viewable by org members" ON "public"."apps" FOR SELECT USING ((("visibility" = 'public'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "apps"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Collections viewable by org members" ON "public"."app_collections" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."apps" "a"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "a"."org_id")))
  WHERE (("a"."id" = "app_collections"."app_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."apps" "a"
  WHERE (("a"."id" = "app_collections"."app_id") AND ("a"."visibility" = 'public'::"text"))))));



CREATE POLICY "Items viewable by org members" ON "public"."app_items" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM (("public"."app_collections" "c"
     JOIN "public"."apps" "a" ON (("a"."id" = "c"."app_id")))
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "a"."org_id")))
  WHERE (("c"."id" = "app_items"."collection_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."app_collections" "c"
     JOIN "public"."apps" "a" ON (("a"."id" = "c"."app_id")))
  WHERE (("c"."id" = "app_items"."collection_id") AND ("a"."visibility" = 'public'::"text"))))));



CREATE POLICY "Members can create items" ON "public"."app_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."app_collections" "c"
     JOIN "public"."apps" "a" ON (("a"."id" = "c"."app_id")))
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "a"."org_id")))
  WHERE (("c"."id" = "app_items"."collection_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Members can view their organizations" ON "public"."organizations" FOR SELECT USING ("public"."user_is_member_of_org"("id"));



CREATE POLICY "Org admins can create event notifications" ON "public"."event_telegram_notifications" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "e"."org_id")))
  WHERE (("e"."id" = "event_telegram_notifications"."event_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Org admins can manage invitations" ON "public"."invitations" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "invitations"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Org admins can update their groups" ON "public"."telegram_groups" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."org_telegram_groups" "otg"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "otg"."org_id")))
  WHERE (("otg"."tg_chat_id" = "telegram_groups"."tg_chat_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Org admins can view event notifications" ON "public"."event_telegram_notifications" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "e"."org_id")))
  WHERE (("e"."id" = "event_telegram_notifications"."event_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Org admins can view participant traits" ON "public"."participant_traits" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."participants" "p"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "p"."org_id")))
  WHERE (("p"."id" = "participant_traits"."participant_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Org members can view materials" ON "public"."material_pages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "material_pages"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Org members can view their groups" ON "public"."telegram_groups" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."org_telegram_groups" "otg"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "otg"."org_id")))
  WHERE (("otg"."tg_chat_id" = "telegram_groups"."tg_chat_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Organization members can view their org events" ON "public"."events" FOR SELECT USING ((("is_public" = true) OR (EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "events"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Organization owners can view their API logs" ON "public"."openai_api_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "openai_api_logs"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = 'owner'::"text")))));



CREATE POLICY "Owners and admins can update organization" ON "public"."organizations" FOR UPDATE USING ("public"."user_is_org_admin"("id"));



CREATE POLICY "Owners can delete their items" ON "public"."app_items" FOR DELETE USING ((("creator_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM (("public"."app_collections" "c"
     JOIN "public"."apps" "a" ON (("a"."id" = "c"."app_id")))
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "a"."org_id")))
  WHERE (("c"."id" = "app_items"."collection_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "Owners can update their items" ON "public"."app_items" FOR UPDATE USING ((("creator_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM (("public"."app_collections" "c"
     JOIN "public"."apps" "a" ON (("a"."id" = "c"."app_id")))
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "a"."org_id")))
  WHERE (("c"."id" = "app_items"."collection_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "Public events are viewable by everyone" ON "public"."events" FOR SELECT USING ((("status" = 'published'::"text") AND ("is_public" = true)));



CREATE POLICY "Service role can insert API logs" ON "public"."openai_api_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can manage auth codes" ON "public"."telegram_auth_codes" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage email auth tokens" ON "public"."email_auth_tokens" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to crm_sync_log" ON "public"."crm_sync_log" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to material_search_index" ON "public"."material_search_index" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to participant_duplicates" ON "public"."participant_duplicates" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to participant_external_ids" ON "public"."participant_external_ids" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to participant_traits" ON "public"."participant_traits" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to qualification" ON "public"."user_qualification_responses" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role full access to telegram_chat_migrations" ON "public"."telegram_chat_migrations" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to telegram_groups" ON "public"."telegram_groups" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to telegram_import_batches" ON "public"."telegram_import_batches" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to telegram_webhook_idempotency" ON "public"."telegram_webhook_idempotency" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Superadmins can insert superadmins" ON "public"."superadmins" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."superadmins" "sa"
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Superadmins can update superadmins" ON "public"."superadmins" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."superadmins" "sa"
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Superadmins can view all AI requests" ON "public"."ai_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."superadmins" "sa"
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Superadmins can view all API logs" ON "public"."openai_api_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."superadmins" "sa"
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Superadmins can view all superadmins" ON "public"."superadmins" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."superadmins" "sa"
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can create organizations" ON "public"."organizations" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "Users can insert own qualification" ON "public"."user_qualification_responses" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can register for events" ON "public"."event_registrations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_registrations"."event_id") AND ("e"."status" = 'published'::"text")))));



CREATE POLICY "Users can update own qualification" ON "public"."user_qualification_responses" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own registrations" ON "public"."event_registrations" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM ("public"."participants" "p"
     JOIN "public"."user_telegram_accounts" "uta" ON (("uta"."telegram_user_id" = "p"."tg_user_id")))
  WHERE (("p"."id" = "event_registrations"."participant_id") AND ("uta"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "e"."org_id")))
  WHERE (("e"."id" = "event_registrations"."event_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "Users can view memberships of their organizations" ON "public"."memberships" FOR SELECT USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."user_is_member_of_org"("org_id")));



CREATE POLICY "Users can view own qualification" ON "public"."user_qualification_responses" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view participants in their organization" ON "public"."participants" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "participants"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can view registration fields" ON "public"."event_registration_fields" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "e"."org_id")))
  WHERE (("e"."id" = "event_registration_fields"."event_id") AND ("m"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_registration_fields"."event_id") AND ("e"."is_public" = true))))));



CREATE POLICY "Users can view registrations in their org" ON "public"."event_registrations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "e"."org_id")))
  WHERE (("e"."id" = "event_registrations"."event_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their invitations" ON "public"."invitations" FOR SELECT USING (("email" = ( SELECT ("auth"."jwt"() ->> 'email'::"text"))));



CREATE POLICY "Users can view their organizations" ON "public"."organizations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "organizations"."id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."activity_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_events_delete_policy" ON "public"."activity_events" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "activity_events"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "activity_events_insert_policy" ON "public"."activity_events" FOR INSERT WITH CHECK (true);



CREATE POLICY "activity_events_select_policy" ON "public"."activity_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "activity_events"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "activity_events_update_policy" ON "public"."activity_events" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "activity_events"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."admin_action_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_action_select" ON "public"."admin_action_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."superadmins" "sa"
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."ai_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_analytics_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_collections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attention_zone_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attention_zone_items_select" ON "public"."attention_zone_items" FOR SELECT USING (("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "attention_zone_items_update" ON "public"."attention_zone_items" FOR UPDATE USING (("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."crm_sync_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_auth_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."error_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "error_logs_select" ON "public"."error_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."superadmins" "sa"
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."event_registration_fields" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_telegram_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_metrics_delete_policy" ON "public"."group_metrics" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "group_metrics"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "group_metrics_insert_policy" ON "public"."group_metrics" FOR INSERT WITH CHECK (true);



CREATE POLICY "group_metrics_select_policy" ON "public"."group_metrics" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "group_metrics"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "group_metrics_update_policy" ON "public"."group_metrics" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "group_metrics"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."material_pages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."material_search_index" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_logs_insert_service" ON "public"."notification_logs" FOR INSERT WITH CHECK (false);



CREATE POLICY "notification_logs_select" ON "public"."notification_logs" FOR SELECT USING (("org_id" IN ( SELECT "memberships"."org_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "notification_logs_update_service" ON "public"."notification_logs" FOR UPDATE USING (false);



ALTER TABLE "public"."notification_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_rules_delete" ON "public"."notification_rules" FOR DELETE USING (("org_id" IN ( SELECT "memberships"."org_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "notification_rules_insert" ON "public"."notification_rules" FOR INSERT WITH CHECK (("org_id" IN ( SELECT "memberships"."org_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "notification_rules_select" ON "public"."notification_rules" FOR SELECT USING (("org_id" IN ( SELECT "memberships"."org_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "notification_rules_update" ON "public"."notification_rules" FOR UPDATE USING (("org_id" IN ( SELECT "memberships"."org_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."openai_api_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_telegram_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_telegram_groups_read" ON "public"."org_telegram_groups" FOR SELECT USING ("public"."is_org_member"("org_id"));



CREATE POLICY "org_telegram_groups_write" ON "public"."org_telegram_groups" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "org_telegram_groups"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."organization_invite_uses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."participant_duplicates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."participant_external_ids" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."participant_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "participant_groups_insert_policy" ON "public"."participant_groups" FOR INSERT WITH CHECK (true);



CREATE POLICY "participant_groups_select_policy" ON "public"."participant_groups" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."participants" "p"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "p"."org_id")))
  WHERE (("p"."id" = "participant_groups"."participant_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."participant_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "participant_messages_delete_policy" ON "public"."participant_messages" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."participants" "p"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "p"."org_id")))
  WHERE (("p"."id" = "participant_messages"."participant_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "participant_messages_insert_policy" ON "public"."participant_messages" FOR INSERT WITH CHECK (true);



CREATE POLICY "participant_messages_select_policy" ON "public"."participant_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."participants" "p"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "p"."org_id")))
  WHERE (("p"."id" = "participant_messages"."participant_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "participant_messages_update_policy" ON "public"."participant_messages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."participants" "p"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "p"."org_id")))
  WHERE (("p"."id" = "participant_messages"."participant_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."participant_tag_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "participant_tag_assignments_delete_policy" ON "public"."participant_tag_assignments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."participant_tags" "pt"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "pt"."org_id")))
  WHERE (("pt"."id" = "participant_tag_assignments"."tag_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "participant_tag_assignments_insert_policy" ON "public"."participant_tag_assignments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."participant_tags" "pt"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "pt"."org_id")))
  WHERE (("pt"."id" = "participant_tag_assignments"."tag_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "participant_tag_assignments_select_policy" ON "public"."participant_tag_assignments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."participant_tags" "pt"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "pt"."org_id")))
  WHERE (("pt"."id" = "participant_tag_assignments"."tag_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."participant_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "participant_tags_delete_policy" ON "public"."participant_tags" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "participant_tags"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "participant_tags_insert_policy" ON "public"."participant_tags" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "participant_tags"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "participant_tags_select_policy" ON "public"."participant_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "participant_tags"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "participant_tags_update_policy" ON "public"."participant_tags" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "participant_tags"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."participant_traits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_methods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_methods_delete" ON "public"."payment_methods" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "payment_methods"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "payment_methods_insert" ON "public"."payment_methods" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "payment_methods"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "payment_methods_select" ON "public"."payment_methods" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "payment_methods"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "payment_methods_update" ON "public"."payment_methods" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "payment_methods"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_delete" ON "public"."payments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."subscriptions" "s"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "s"."org_id")))
  WHERE (("s"."id" = "payments"."subscription_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "payments_insert" ON "public"."payments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."subscriptions" "s"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "s"."org_id")))
  WHERE (("s"."id" = "payments"."subscription_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "payments_select" ON "public"."payments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."subscriptions" "s"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "s"."org_id")))
  WHERE (("s"."id" = "payments"."subscription_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "payments_update" ON "public"."payments" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."subscriptions" "s"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "s"."org_id")))
  WHERE (("s"."id" = "payments"."subscription_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscriptions_delete" ON "public"."subscriptions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "subscriptions"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "subscriptions_insert" ON "public"."subscriptions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "subscriptions"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "subscriptions_select" ON "public"."subscriptions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "subscriptions"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "subscriptions_update" ON "public"."subscriptions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "subscriptions"."org_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."superadmins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."telegram_auth_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."telegram_chat_migrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."telegram_group_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "telegram_group_admins_insert_policy" ON "public"."telegram_group_admins" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."org_telegram_groups" "otg"
     JOIN "public"."memberships" "m" ON (("m"."org_id" = "otg"."org_id")))
  WHERE (("otg"."tg_chat_id" = "telegram_group_admins"."tg_chat_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."telegram_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."telegram_health_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "telegram_health_select" ON "public"."telegram_health_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."superadmins" "sa"
  WHERE ("sa"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."telegram_import_batches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."telegram_verification_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "telegram_verification_logs_insert_policy" ON "public"."telegram_verification_logs" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "telegram_verification_logs_select_policy" ON "public"."telegram_verification_logs" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."telegram_webhook_idempotency" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_group_admin_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_qualification_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_telegram_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_telegram_accounts_insert_policy" ON "public"."user_telegram_accounts" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_telegram_accounts_select_policy" ON "public"."user_telegram_accounts" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_telegram_accounts_update_policy" ON "public"."user_telegram_accounts" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."whatsapp_imports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Сервер может создавать организаци" ON "public"."organizations" FOR INSERT TO "service_role" WITH CHECK (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_activity_score"("p_participant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_activity_score"("p_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_activity_score"("p_participant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_risk_score"("p_participant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_risk_score"("p_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_risk_score"("p_participant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_item_permission"("p_item_id" "uuid", "p_user_id" "uuid", "p_action" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_item_permission"("p_item_id" "uuid", "p_user_id" "uuid", "p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_item_permission"("p_item_id" "uuid", "p_user_id" "uuid", "p_action" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_notification_duplicate"("p_rule_id" "uuid", "p_dedup_hash" "text", "p_hours" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_notification_duplicate"("p_rule_id" "uuid", "p_dedup_hash" "text", "p_hours" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_notification_duplicate"("p_rule_id" "uuid", "p_dedup_hash" "text", "p_hours" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_participant_exclusion"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_participant_exclusion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_participant_exclusion"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_user_admin_status"("p_tg_chat_id" bigint, "p_tg_user_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."check_user_admin_status"("p_tg_chat_id" bigint, "p_tg_user_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_user_admin_status"("p_tg_chat_id" bigint, "p_tg_user_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_webhook_processed"("p_update_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."check_webhook_processed"("p_update_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_webhook_processed"("p_update_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_admin_action_log"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_admin_action_log"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_admin_action_log"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_all_expired_auth_tokens"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_all_expired_auth_tokens"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_all_expired_auth_tokens"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_error_logs"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_error_logs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_error_logs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_auth_codes"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_auth_codes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_auth_codes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_email_auth_tokens"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_email_auth_tokens"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_email_auth_tokens"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_verifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_verifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_verifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_health_events"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_health_events"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_health_events"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_notification_logs"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_notification_logs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_notification_logs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_participant_messages"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_participant_messages"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_participant_messages"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_webhook_idempotency"("p_retention_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_webhook_idempotency"("p_retention_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_webhook_idempotency"("p_retention_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_get_participants_function"("org_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_get_participants_function"("org_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_get_participants_function"("org_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_system_notification_rules"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_system_notification_rules"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_system_notification_rules"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."debug_find_group"("chat_id_param" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."debug_find_group"("chat_id_param" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."debug_find_group"("chat_id_param" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_counter"("row_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_counter"("row_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_counter"("row_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_participant_data"("p_participant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_participant_data"("p_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_participant_data"("p_participant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."exec_sql"("sql" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."exec_sql"("sql" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exec_sql"("sql" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_old_invitations"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_old_invitations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_old_invitations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."find_duplicate_participants"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."find_duplicate_participants"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_duplicate_participants"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_group_by_chat_id"("chat_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."find_group_by_chat_id"("chat_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_group_by_chat_id"("chat_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."find_user_id_by_telegram"("p_tg_user_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."find_user_id_by_telegram"("p_tg_user_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_user_id_by_telegram"("p_tg_user_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_invite_token"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invite_token"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invite_token"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_verification_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_verification_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_verification_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_weekly_digest_data"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_weekly_digest_data"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_weekly_digest_data"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_activity_gini"("org_id_param" "uuid", "tg_chat_id_param" bigint, "days_ago" integer, "timezone_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_activity_gini"("org_id_param" "uuid", "tg_chat_id_param" bigint, "days_ago" integer, "timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_activity_gini"("org_id_param" "uuid", "tg_chat_id_param" bigint, "days_ago" integer, "timezone_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_activity_heatmap"("p_org_id" "uuid", "p_days" integer, "p_tg_chat_id" bigint, "p_timezone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_activity_heatmap"("p_org_id" "uuid", "p_days" integer, "p_tg_chat_id" bigint, "p_timezone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_activity_heatmap"("p_org_id" "uuid", "p_days" integer, "p_tg_chat_id" bigint, "p_timezone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_activity_timeline"("p_org_id" "uuid", "p_days" integer, "p_tg_chat_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_activity_timeline"("p_org_id" "uuid", "p_days" integer, "p_tg_chat_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_activity_timeline"("p_org_id" "uuid", "p_days" integer, "p_tg_chat_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_app_theme"("p_app_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_app_theme"("p_app_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_theme"("p_app_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_churning_participants"("p_org_id" "uuid", "p_days_silent" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_churning_participants"("p_org_id" "uuid", "p_days_silent" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_churning_participants"("p_org_id" "uuid", "p_days_silent" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_date_in_timezone"("timestamp_value" timestamp with time zone, "timezone_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_date_in_timezone"("timestamp_value" timestamp with time zone, "timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_date_in_timezone"("timestamp_value" timestamp with time zone, "timezone_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_engagement_breakdown"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_engagement_breakdown"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_engagement_breakdown"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_enriched_participants"("p_org_id" "uuid", "p_include_tags" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_enriched_participants"("p_org_id" "uuid", "p_include_tags" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_enriched_participants"("p_org_id" "uuid", "p_include_tags" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_event_available_spots"("event_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_event_available_spots"("event_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_event_available_spots"("event_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_event_payment_stats"("p_event_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_event_payment_stats"("p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_event_payment_stats"("p_event_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_event_registered_count"("event_uuid" "uuid", "count_by_paid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_event_registered_count"("event_uuid" "uuid", "count_by_paid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_event_registered_count"("event_uuid" "uuid", "count_by_paid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inactive_newcomers"("p_org_id" "uuid", "p_days_since_first" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_inactive_newcomers"("p_org_id" "uuid", "p_days_since_first" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inactive_newcomers"("p_org_id" "uuid", "p_days_since_first" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_key_metrics"("p_org_id" "uuid", "p_period_days" integer, "p_tg_chat_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_key_metrics"("p_org_id" "uuid", "p_period_days" integer, "p_tg_chat_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_key_metrics"("p_org_id" "uuid", "p_period_days" integer, "p_tg_chat_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_newcomer_activation"("org_id_param" "uuid", "tg_chat_id_param" bigint, "hours_ago" integer, "timezone_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_newcomer_activation"("org_id_param" "uuid", "tg_chat_id_param" bigint, "hours_ago" integer, "timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_newcomer_activation"("org_id_param" "uuid", "tg_chat_id_param" bigint, "hours_ago" integer, "timezone_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_openai_api_logs"("p_org_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_openai_api_logs"("p_org_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_openai_api_logs"("p_org_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_openai_cost_summary"("p_org_id" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_openai_cost_summary"("p_org_id" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_openai_cost_summary"("p_org_id" "uuid", "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_notifications"("p_org_id" "uuid", "p_limit" integer, "p_include_resolved" boolean, "p_hours_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_notifications"("p_org_id" "uuid", "p_limit" integer, "p_include_resolved" boolean, "p_hours_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_notifications"("p_org_id" "uuid", "p_limit" integer, "p_include_resolved" boolean, "p_hours_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_participant_enrichment"("p_participant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_participant_enrichment"("p_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_participant_enrichment"("p_participant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_participant_messages_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_participant_messages_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_participant_messages_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_participant_tags"("p_participant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_participant_tags"("p_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_participant_tags"("p_participant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_participants_by_tag"("p_tag_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_participants_by_tag"("p_tag_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_participants_by_tag"("p_tag_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_participants_with_group_count"("org_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_participants_with_group_count"("org_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_participants_with_group_count"("org_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_prime_time"("org_id_param" "uuid", "tg_chat_id_param" bigint, "days_ago" integer, "timezone_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_prime_time"("org_id_param" "uuid", "tg_chat_id_param" bigint, "days_ago" integer, "timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_prime_time"("org_id_param" "uuid", "tg_chat_id_param" bigint, "days_ago" integer, "timezone_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_qualification_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_qualification_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_qualification_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_qualification_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_qualification_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_qualification_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_reactions_replies_stats"("p_org_id" "uuid", "p_period_days" integer, "p_tg_chat_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_reactions_replies_stats"("p_org_id" "uuid", "p_period_days" integer, "p_tg_chat_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_reactions_replies_stats"("p_org_id" "uuid", "p_period_days" integer, "p_tg_chat_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_risk_radar"("org_id_param" "uuid", "tg_chat_id_param" bigint, "min_risk_score" double precision, "limit_param" integer, "timezone_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_risk_radar"("org_id_param" "uuid", "tg_chat_id_param" bigint, "min_risk_score" double precision, "limit_param" integer, "timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_risk_radar"("org_id_param" "uuid", "tg_chat_id_param" bigint, "min_risk_score" double precision, "limit_param" integer, "timezone_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_risk_score"("org_id_param" "uuid", "tg_chat_id_param" bigint, "user_id_param" bigint, "days_ago" integer, "timezone_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_risk_score"("org_id_param" "uuid", "tg_chat_id_param" bigint, "user_id_param" bigint, "days_ago" integer, "timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_risk_score"("org_id_param" "uuid", "tg_chat_id_param" bigint, "user_id_param" bigint, "days_ago" integer, "timezone_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_silent_rate"("org_id_param" "uuid", "tg_chat_id_param" bigint, "days_ago" integer, "timezone_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_silent_rate"("org_id_param" "uuid", "tg_chat_id_param" bigint, "days_ago" integer, "timezone_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_silent_rate"("org_id_param" "uuid", "tg_chat_id_param" bigint, "days_ago" integer, "timezone_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tag_stats"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tag_stats"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tag_stats"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_telegram_group"("p_chat_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_telegram_group"("p_chat_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_telegram_group"("p_chat_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_telegram_health_status"("p_tg_chat_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_telegram_health_status"("p_tg_chat_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_telegram_health_status"("p_tg_chat_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_telegram_message_link"("p_chat_id" "text", "p_message_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_telegram_message_link"("p_chat_id" "text", "p_message_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_telegram_message_link"("p_chat_id" "text", "p_message_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_contributors"("p_org_id" "uuid", "p_limit" integer, "p_tg_chat_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_contributors"("p_org_id" "uuid", "p_limit" integer, "p_tg_chat_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_contributors"("p_org_id" "uuid", "p_limit" integer, "p_tg_chat_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_by_email"("user_email" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_by_email"("user_email" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_by_email"("user_email" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_display_name"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_display_name"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_display_name"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_email_info"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_email_info"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_email_info"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role_in_org"("p_user_id" "uuid", "p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role_in_org"("p_user_id" "uuid", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role_in_org"("p_user_id" "uuid", "p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_telegram_id"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_telegram_id"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_telegram_id"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_users_by_ids"("user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_users_by_ids"("user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_by_ids"("user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_attention_item_shown"("p_org_id" "uuid", "p_item_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_attention_item_shown"("p_org_id" "uuid", "p_item_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_attention_item_shown"("p_org_id" "uuid", "p_item_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_counter"("row_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_counter"("row_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_counter"("row_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_notification_trigger_count"("p_rule_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_notification_trigger_count"("p_rule_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_notification_trigger_count"("p_rule_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_reactions_count"("p_org_id" "uuid", "p_tg_chat_id" bigint, "p_message_id" bigint, "p_delta" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_reactions_count"("p_org_id" "uuid", "p_tg_chat_id" bigint, "p_message_id" bigint, "p_delta" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_reactions_count"("p_org_id" "uuid", "p_tg_chat_id" bigint, "p_message_id" bigint, "p_delta" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_telegram_group"("p_org_id" "uuid", "p_chat_id" bigint, "p_title" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_telegram_group"("p_org_id" "uuid", "p_chat_id" bigint, "p_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_telegram_group"("p_org_id" "uuid", "p_chat_id" bigint, "p_title" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_activated_admin"("p_user_id" "uuid", "p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_activated_admin"("p_user_id" "uuid", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_activated_admin"("p_user_id" "uuid", "p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_invite_valid"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_invite_valid"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_invite_valid"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_member"("_org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_member"("_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("_org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_member_rpc"("_org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_member_rpc"("_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member_rpc"("_org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_user_registered_for_event"("event_id_param" "uuid", "participant_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_registered_for_event"("event_id_param" "uuid", "participant_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_registered_for_event"("event_id_param" "uuid", "participant_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_user_superadmin"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_superadmin"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_superadmin"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_admin_action"("p_org_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "text", "p_changes" "jsonb", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_admin_action"("p_org_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "text", "p_changes" "jsonb", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_admin_action"("p_org_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "text", "p_changes" "jsonb", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_app_event"("p_app_id" "uuid", "p_event_type" "text", "p_user_id" "uuid", "p_item_id" "uuid", "p_collection_id" "uuid", "p_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_app_event"("p_app_id" "uuid", "p_event_type" "text", "p_user_id" "uuid", "p_item_id" "uuid", "p_collection_id" "uuid", "p_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_app_event"("p_app_id" "uuid", "p_event_type" "text", "p_user_id" "uuid", "p_item_id" "uuid", "p_collection_id" "uuid", "p_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_error"("p_level" "text", "p_message" "text", "p_error_code" "text", "p_context" "jsonb", "p_stack_trace" "text", "p_org_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."log_error"("p_level" "text", "p_message" "text", "p_error_code" "text", "p_context" "jsonb", "p_stack_trace" "text", "p_org_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_error"("p_level" "text", "p_message" "text", "p_error_code" "text", "p_context" "jsonb", "p_stack_trace" "text", "p_org_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_telegram_health"("p_tg_chat_id" bigint, "p_event_type" "text", "p_status" "text", "p_message" "text", "p_details" "jsonb", "p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."log_telegram_health"("p_tg_chat_id" bigint, "p_event_type" "text", "p_status" "text", "p_message" "text", "p_details" "jsonb", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_telegram_health"("p_tg_chat_id" bigint, "p_event_type" "text", "p_status" "text", "p_message" "text", "p_details" "jsonb", "p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_overdue_payments"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_overdue_payments"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_overdue_payments"() TO "service_role";



GRANT ALL ON FUNCTION "public"."material_pages_set_position"() TO "anon";
GRANT ALL ON FUNCTION "public"."material_pages_set_position"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."material_pages_set_position"() TO "service_role";



GRANT ALL ON FUNCTION "public"."material_pages_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."material_pages_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."material_pages_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."material_search_index_refresh"() TO "anon";
GRANT ALL ON FUNCTION "public"."material_search_index_refresh"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."material_search_index_refresh"() TO "service_role";



GRANT ALL ON FUNCTION "public"."merge_duplicate_participants"("p_canonical_id" "uuid", "p_duplicate_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_duplicate_participants"("p_canonical_id" "uuid", "p_duplicate_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_duplicate_participants"("p_canonical_id" "uuid", "p_duplicate_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."merge_duplicate_telegram_groups"() TO "anon";
GRANT ALL ON FUNCTION "public"."merge_duplicate_telegram_groups"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_duplicate_telegram_groups"() TO "service_role";



GRANT ALL ON FUNCTION "public"."merge_participants"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_participants"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_participants"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."merge_participants_extended"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_participants_extended"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_participants_extended"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."merge_participants_smart"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_participants_smart"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_participants_smart"("p_target" "uuid", "p_duplicates" "uuid"[], "p_actor" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."migrate_telegram_chat_id"("old_chat_id" bigint, "new_chat_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."migrate_telegram_chat_id"("old_chat_id" bigint, "new_chat_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_telegram_chat_id"("old_chat_id" bigint, "new_chat_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."org_dashboard_stats"("_org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."org_dashboard_stats"("_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."org_dashboard_stats"("_org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_webhook_message"("p_org_id" "uuid", "p_tg_user_id" bigint, "p_tg_chat_id" bigint, "p_message_id" bigint, "p_message_thread_id" bigint, "p_reply_to_message_id" bigint, "p_reply_to_user_id" bigint, "p_username" "text", "p_first_name" "text", "p_last_name" "text", "p_full_name" "text", "p_has_media" boolean, "p_chars_count" integer, "p_links_count" integer, "p_mentions_count" integer, "p_reactions_count" integer, "p_meta" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."process_webhook_message"("p_org_id" "uuid", "p_tg_user_id" bigint, "p_tg_chat_id" bigint, "p_message_id" bigint, "p_message_thread_id" bigint, "p_reply_to_message_id" bigint, "p_reply_to_user_id" bigint, "p_username" "text", "p_first_name" "text", "p_last_name" "text", "p_full_name" "text", "p_has_media" boolean, "p_chars_count" integer, "p_links_count" integer, "p_mentions_count" integer, "p_reactions_count" integer, "p_meta" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_webhook_message"("p_org_id" "uuid", "p_tg_user_id" bigint, "p_tg_chat_id" bigint, "p_message_id" bigint, "p_message_thread_id" bigint, "p_reply_to_message_id" bigint, "p_reply_to_user_id" bigint, "p_username" "text", "p_first_name" "text", "p_last_name" "text", "p_full_name" "text", "p_has_media" boolean, "p_chars_count" integer, "p_links_count" integer, "p_mentions_count" integer, "p_reactions_count" integer, "p_meta" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_member_count"("group_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_member_count"("group_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_member_count"("group_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."record_webhook_processed"("p_update_id" bigint, "p_tg_chat_id" bigint, "p_event_type" "text", "p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_webhook_processed"("p_update_id" bigint, "p_tg_chat_id" bigint, "p_event_type" "text", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_webhook_processed"("p_update_id" bigint, "p_tg_chat_id" bigint, "p_event_type" "text", "p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."register_for_event"("p_event_id" "uuid", "p_participant_id" "uuid", "p_registration_data" "jsonb", "p_quantity" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."register_for_event"("p_event_id" "uuid", "p_participant_id" "uuid", "p_registration_data" "jsonb", "p_quantity" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_for_event"("p_event_id" "uuid", "p_participant_id" "uuid", "p_registration_data" "jsonb", "p_quantity" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_qualification_if_needed"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reset_qualification_if_needed"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_qualification_if_needed"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_attention_item"("p_item_id" "uuid", "p_user_id" "uuid", "p_user_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_attention_item"("p_item_id" "uuid", "p_user_id" "uuid", "p_user_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_attention_item"("p_item_id" "uuid", "p_user_id" "uuid", "p_user_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_notification"("p_notification_id" "uuid", "p_user_id" "uuid", "p_user_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_notification"("p_notification_id" "uuid", "p_user_id" "uuid", "p_user_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_notification"("p_notification_id" "uuid", "p_user_id" "uuid", "p_user_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_telegram_chat_id"("p_chat_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_telegram_chat_id"("p_chat_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_telegram_chat_id"("p_chat_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_participant_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."restore_participant_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_participant_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_participant_duplicates_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_participant_duplicates_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_participant_duplicates_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_registration_price_from_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_registration_price_from_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_registration_price_from_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_telegram_activity_to_activity_events"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_telegram_activity_to_activity_events"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_telegram_activity_to_activity_events"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_telegram_admins"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_telegram_admins"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_telegram_admins"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_create_system_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_create_system_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_create_system_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_crm_sync_log_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_crm_sync_log_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_crm_sync_log_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_events_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_events_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_events_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_group_member_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_group_member_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_group_member_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_invitations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_invitations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_invitations_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_invite_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_invite_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_invite_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_notification_rules_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_notification_rules_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_notification_rules_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_participant_enrichment"("p_participant_id" "uuid", "p_enrichment_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_participant_enrichment"("p_participant_id" "uuid", "p_enrichment_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_participant_enrichment"("p_participant_id" "uuid", "p_enrichment_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_participant_from_registration_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_participant_from_registration_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_participant_from_registration_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_participant_scores_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_participant_scores_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_participant_scores_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_participant_tags_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_participant_tags_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_participant_tags_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_telegram_group_admins_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_telegram_group_admins_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_telegram_group_admins_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."participant_traits" TO "anon";
GRANT ALL ON TABLE "public"."participant_traits" TO "authenticated";
GRANT ALL ON TABLE "public"."participant_traits" TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_participant_trait"("p_participant_id" "uuid", "p_trait_key" "text", "p_trait_value" "text", "p_value_type" "text", "p_source" "text", "p_confidence" numeric, "p_metadata" "jsonb", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_participant_trait"("p_participant_id" "uuid", "p_trait_key" "text", "p_trait_value" "text", "p_value_type" "text", "p_source" "text", "p_confidence" numeric, "p_metadata" "jsonb", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_participant_trait"("p_participant_id" "uuid", "p_trait_key" "text", "p_trait_value" "text", "p_value_type" "text", "p_source" "text", "p_confidence" numeric, "p_metadata" "jsonb", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_only_archived_orgs"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_only_archived_orgs"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_only_archived_orgs"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_is_member_of_org"("check_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_is_member_of_org"("check_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_is_member_of_org"("check_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_is_org_admin"("check_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_is_org_admin"("check_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_is_org_admin"("check_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_registration_quantity"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_registration_quantity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_registration_quantity"() TO "service_role";



GRANT ALL ON TABLE "public"."activity_events" TO "anon";
GRANT ALL ON TABLE "public"."activity_events" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."activity_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."activity_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."activity_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."admin_action_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_action_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_action_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."admin_action_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."admin_action_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."admin_action_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ai_requests" TO "anon";
GRANT ALL ON TABLE "public"."ai_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_requests" TO "service_role";



GRANT ALL ON TABLE "public"."app_analytics_events" TO "anon";
GRANT ALL ON TABLE "public"."app_analytics_events" TO "authenticated";
GRANT ALL ON TABLE "public"."app_analytics_events" TO "service_role";



GRANT ALL ON TABLE "public"."app_collections" TO "anon";
GRANT ALL ON TABLE "public"."app_collections" TO "authenticated";
GRANT ALL ON TABLE "public"."app_collections" TO "service_role";



GRANT ALL ON TABLE "public"."app_items" TO "anon";
GRANT ALL ON TABLE "public"."app_items" TO "authenticated";
GRANT ALL ON TABLE "public"."app_items" TO "service_role";



GRANT ALL ON TABLE "public"."apps" TO "anon";
GRANT ALL ON TABLE "public"."apps" TO "authenticated";
GRANT ALL ON TABLE "public"."apps" TO "service_role";



GRANT ALL ON TABLE "public"."attention_zone_items" TO "anon";
GRANT ALL ON TABLE "public"."attention_zone_items" TO "authenticated";
GRANT ALL ON TABLE "public"."attention_zone_items" TO "service_role";



GRANT ALL ON TABLE "public"."crm_sync_log" TO "anon";
GRANT ALL ON TABLE "public"."crm_sync_log" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_sync_log" TO "service_role";



GRANT ALL ON TABLE "public"."email_auth_tokens" TO "anon";
GRANT ALL ON TABLE "public"."email_auth_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."email_auth_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."error_logs" TO "anon";
GRANT ALL ON TABLE "public"."error_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."error_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."error_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."error_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."error_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."event_registration_fields" TO "authenticated";
GRANT ALL ON TABLE "public"."event_registration_fields" TO "service_role";



GRANT ALL ON TABLE "public"."event_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."event_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."event_telegram_notifications" TO "anon";
GRANT ALL ON TABLE "public"."event_telegram_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."event_telegram_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."group_metrics" TO "anon";
GRANT ALL ON TABLE "public"."group_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."group_metrics" TO "service_role";



GRANT ALL ON SEQUENCE "public"."group_metrics_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."group_metrics_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."group_metrics_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."material_pages" TO "anon";
GRANT ALL ON TABLE "public"."material_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."material_pages" TO "service_role";



GRANT ALL ON TABLE "public"."material_search_index" TO "anon";
GRANT ALL ON TABLE "public"."material_search_index" TO "authenticated";
GRANT ALL ON TABLE "public"."material_search_index" TO "service_role";



GRANT ALL ON TABLE "public"."memberships" TO "anon";
GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";



GRANT ALL ON TABLE "public"."notification_logs" TO "anon";
GRANT ALL ON TABLE "public"."notification_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_logs" TO "service_role";



GRANT ALL ON TABLE "public"."notification_rules" TO "anon";
GRANT ALL ON TABLE "public"."notification_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_rules" TO "service_role";



GRANT ALL ON TABLE "public"."openai_api_logs" TO "anon";
GRANT ALL ON TABLE "public"."openai_api_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."openai_api_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."openai_api_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."openai_api_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."openai_api_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."org_telegram_groups" TO "anon";
GRANT ALL ON TABLE "public"."org_telegram_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."org_telegram_groups" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."participants" TO "anon";
GRANT ALL ON TABLE "public"."participants" TO "authenticated";
GRANT ALL ON TABLE "public"."participants" TO "service_role";



GRANT ALL ON TABLE "public"."user_telegram_accounts" TO "anon";
GRANT ALL ON TABLE "public"."user_telegram_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."user_telegram_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."organization_admins" TO "anon";
GRANT ALL ON TABLE "public"."organization_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_admins" TO "service_role";



GRANT ALL ON TABLE "public"."organization_invite_uses" TO "anon";
GRANT ALL ON TABLE "public"."organization_invite_uses" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_invite_uses" TO "service_role";



GRANT ALL ON SEQUENCE "public"."organization_invite_uses_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."organization_invite_uses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."organization_invite_uses_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."organization_invites" TO "anon";
GRANT ALL ON TABLE "public"."organization_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_invites" TO "service_role";



GRANT ALL ON TABLE "public"."participant_duplicates" TO "anon";
GRANT ALL ON TABLE "public"."participant_duplicates" TO "authenticated";
GRANT ALL ON TABLE "public"."participant_duplicates" TO "service_role";



GRANT ALL ON TABLE "public"."participant_external_ids" TO "anon";
GRANT ALL ON TABLE "public"."participant_external_ids" TO "authenticated";
GRANT ALL ON TABLE "public"."participant_external_ids" TO "service_role";



GRANT ALL ON TABLE "public"."participant_groups" TO "anon";
GRANT ALL ON TABLE "public"."participant_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."participant_groups" TO "service_role";



GRANT ALL ON TABLE "public"."participant_messages" TO "anon";
GRANT ALL ON TABLE "public"."participant_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."participant_messages" TO "service_role";



GRANT ALL ON TABLE "public"."participant_tag_assignments" TO "anon";
GRANT ALL ON TABLE "public"."participant_tag_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."participant_tag_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."participant_tags" TO "anon";
GRANT ALL ON TABLE "public"."participant_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."participant_tags" TO "service_role";



GRANT ALL ON TABLE "public"."payment_methods" TO "anon";
GRANT ALL ON TABLE "public"."payment_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_methods" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."superadmins" TO "anon";
GRANT ALL ON TABLE "public"."superadmins" TO "authenticated";
GRANT ALL ON TABLE "public"."superadmins" TO "service_role";



GRANT ALL ON TABLE "public"."telegram_auth_codes" TO "anon";
GRANT ALL ON TABLE "public"."telegram_auth_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."telegram_auth_codes" TO "service_role";



GRANT ALL ON TABLE "public"."telegram_chat_migrations" TO "anon";
GRANT ALL ON TABLE "public"."telegram_chat_migrations" TO "authenticated";
GRANT ALL ON TABLE "public"."telegram_chat_migrations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."telegram_chat_migrations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."telegram_chat_migrations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."telegram_chat_migrations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."telegram_group_admins" TO "anon";
GRANT ALL ON TABLE "public"."telegram_group_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."telegram_group_admins" TO "service_role";



GRANT ALL ON SEQUENCE "public"."telegram_group_admins_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."telegram_group_admins_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."telegram_group_admins_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."telegram_groups" TO "anon";
GRANT ALL ON TABLE "public"."telegram_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."telegram_groups" TO "service_role";



GRANT ALL ON SEQUENCE "public"."telegram_groups_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."telegram_groups_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."telegram_groups_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."telegram_health_events" TO "anon";
GRANT ALL ON TABLE "public"."telegram_health_events" TO "authenticated";
GRANT ALL ON TABLE "public"."telegram_health_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."telegram_health_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."telegram_health_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."telegram_health_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."telegram_import_batches" TO "anon";
GRANT ALL ON TABLE "public"."telegram_import_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."telegram_import_batches" TO "service_role";



GRANT ALL ON TABLE "public"."telegram_verification_logs" TO "anon";
GRANT ALL ON TABLE "public"."telegram_verification_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."telegram_verification_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."telegram_verification_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."telegram_verification_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."telegram_verification_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."telegram_webhook_idempotency" TO "anon";
GRANT ALL ON TABLE "public"."telegram_webhook_idempotency" TO "authenticated";
GRANT ALL ON TABLE "public"."telegram_webhook_idempotency" TO "service_role";



GRANT ALL ON TABLE "public"."user_admin_status" TO "anon";
GRANT ALL ON TABLE "public"."user_admin_status" TO "authenticated";
GRANT ALL ON TABLE "public"."user_admin_status" TO "service_role";



GRANT ALL ON TABLE "public"."user_group_admin_status" TO "anon";
GRANT ALL ON TABLE "public"."user_group_admin_status" TO "authenticated";
GRANT ALL ON TABLE "public"."user_group_admin_status" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_group_admin_status_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_group_admin_status_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_group_admin_status_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_qualification_responses" TO "anon";
GRANT ALL ON TABLE "public"."user_qualification_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."user_qualification_responses" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_telegram_accounts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_telegram_accounts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_telegram_accounts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_imports" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_imports" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







