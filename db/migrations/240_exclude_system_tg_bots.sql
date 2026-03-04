-- =====================================================
-- Migration 240: Exclude system Telegram bot accounts
-- =====================================================
-- Системные аккаунты Telegram, которые не являются реальными участниками:
--   777000      — Telegram Service Notifications
--   136817688   — @Channel_Bot (анонимные сообщения из каналов)
--   1087968824  — @GroupAnonymousBot
--
-- Помечаем их как excluded, чтобы они не отображались
-- в списке участников ни в одном контексте.
-- =====================================================

UPDATE participants
SET participant_status = 'excluded'
WHERE tg_user_id IN (777000, 136817688, 1087968824)
  AND participant_status != 'excluded';

DO $$
DECLARE
  v_count int;
BEGIN
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '✅ Migration 240: excluded % system Telegram bot participant(s)', v_count;
END $$;
