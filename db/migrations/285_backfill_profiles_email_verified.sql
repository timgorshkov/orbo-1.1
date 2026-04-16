-- Migration 285: backfill profiles.email_verified_at from users.email_verified
-- Date: 2026-04-16
-- Purpose:
--   View organization_admins (миграция 182) читает has_verified_email и
--   email_verified_at именно из profiles. Исторически email верифицировался
--   только в users.email_verified — из-за чего часть админов (в т.ч. новые
--   приглашённые) отображались как «email не подтверждён» и могли скрываться
--   при фильтрации в UI.
--
--   Синхронизация в коде добавлена в /api/auth/email/verify и
--   /api/invite/[token]/accept. Эта миграция — одноразовое восстановление
--   для уже существующих пользователей.
--
--   Дополнительно — создаёт отсутствующие profiles для пользователей из
--   memberships (у кого не было записи).

-- 1. Создать profiles для user'ов, у которых их нет (insert-if-missing)
INSERT INTO public.profiles (id, email, email_verified_at, created_at, updated_at)
SELECT
  u.id,
  u.email,
  u.email_verified,
  COALESCE(u.created_at, NOW()),
  NOW()
FROM public.users u
WHERE u.id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- 2. Обновить уже существующие profiles: подставить email и email_verified_at
--    из users, если они там есть, а в profiles ещё нет.
UPDATE public.profiles p
   SET email             = COALESCE(p.email, u.email),
       email_verified_at = COALESCE(p.email_verified_at, u.email_verified),
       updated_at        = NOW()
  FROM public.users u
 WHERE p.id = u.id
   AND (
        (p.email IS NULL AND u.email IS NOT NULL)
     OR (p.email_verified_at IS NULL AND u.email_verified IS NOT NULL)
   );

DO $$
DECLARE
  v_profiles_total INTEGER;
  v_with_email     INTEGER;
  v_verified       INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_profiles_total FROM public.profiles;
  SELECT COUNT(*) INTO v_with_email FROM public.profiles WHERE email IS NOT NULL;
  SELECT COUNT(*) INTO v_verified FROM public.profiles WHERE email_verified_at IS NOT NULL;
  RAISE NOTICE 'Migration 285 complete: profiles=%, with_email=%, email_verified=%.',
    v_profiles_total, v_with_email, v_verified;
END $$;
