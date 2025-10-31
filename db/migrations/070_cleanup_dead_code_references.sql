-- Migration 070: Финальная очистка после удаления мёртвого кода
-- Цель: Добавить комментарии в БД для документирования изменений

-- =====================================================
-- 1. Обновить комментарии для таблиц-заменителей
-- =====================================================

COMMENT ON TABLE activity_events IS 
'All activity events (messages, joins, leaves). 
Replaces: telegram_activity_events (removed in migration 42).
Used for: participant timeline, analytics, group metrics.';

COMMENT ON TABLE user_telegram_accounts IS 
'User Telegram accounts per organization. 
Replaces: profiles.telegram_user_id (removed), telegram_identities (removed in migration 42).
Used for: Telegram auth, admin rights verification, participant linking.';

COMMENT ON TABLE material_pages IS 
'New material system with tree structure and Markdown content. 
Replaces: material_folders, material_items, material_access (removed in migration 49).
Used for: knowledge base, documentation, org resources.';

-- =====================================================
-- 2. Добавить комментарии для важных колонок
-- =====================================================

COMMENT ON COLUMN participants.tg_user_id IS 
'Telegram user ID for participant identification.
IMPORTANT: Use user_telegram_accounts table for auth.users linkage.
Do NOT use identity_id (removed in migration 42).';

COMMENT ON COLUMN participants.tg_first_name IS 
'Immutable Telegram first name from API (for matching).
Different from first_name which is editable.';

COMMENT ON COLUMN participants.tg_last_name IS 
'Immutable Telegram last name from API (for matching).
Different from last_name which is editable.';

-- =====================================================
-- 3. Проверка целостности
-- =====================================================

-- Проверяем, что старые таблицы действительно удалены
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telegram_updates') THEN
    RAISE WARNING 'telegram_updates still exists! Check migration 42.';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telegram_identities') THEN
    RAISE WARNING 'telegram_identities still exists! Check migration 42.';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telegram_activity_events') THEN
    RAISE WARNING 'telegram_activity_events still exists! Check migration 42.';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'material_folders') THEN
    RAISE WARNING 'material_folders still exists! Check migration 49.';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'participants' AND column_name = 'identity_id') THEN
    RAISE WARNING 'participants.identity_id still exists! Check migration 42.';
  END IF;
  
  RAISE NOTICE '✅ Migration 070: Comments updated successfully';
END $$;

