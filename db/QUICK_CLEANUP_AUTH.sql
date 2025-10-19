-- ==========================================
-- БЫСТРАЯ ОЧИСТКА AUTH (1 минута)
-- ==========================================
-- Используйте этот скрипт, если у вас:
-- - 0 пользователей
-- - 0 identities
-- - НО есть sessions/tokens

-- Удаляем все sessions
DELETE FROM auth.sessions;

-- Удаляем все refresh_tokens
DELETE FROM auth.refresh_tokens;

-- Удаляем все identities (на всякий случай)
DELETE FROM auth.identities;

-- Проверяем результат
SELECT 
  (SELECT COUNT(*) FROM auth.users) as "Пользователей",
  (SELECT COUNT(*) FROM auth.identities) as "Identities",
  (SELECT COUNT(*) FROM auth.sessions) as "Sessions",
  (SELECT COUNT(*) FROM auth.refresh_tokens) as "Tokens";

-- Должно показать все 0!

