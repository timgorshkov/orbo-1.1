-- Диагностика: почему анонсы не отправляются для пользователя p.karasev@digital4pharma.ru
-- Запуск: docker exec -i orbo_postgres psql -U orbo -d orbo < app/scripts/diagnose-announcement-access.sql

\echo '=== 1. Ищем пользователя ==='
SELECT id, email, name FROM users WHERE email = 'p.karasev@digital4pharma.ru';

\echo ''
\echo '=== 2. Организации пользователя (memberships) ==='
SELECT m.org_id, m.role, o.name AS org_name
FROM memberships m
JOIN organizations o ON o.id = m.org_id
WHERE m.user_id = (SELECT id FROM users WHERE email = 'p.karasev@digital4pharma.ru');

\echo ''
\echo '=== 3. Привязанные Telegram-аккаунты пользователя (user_telegram_accounts) ==='
SELECT uta.org_id, uta.telegram_user_id, uta.telegram_username, uta.is_verified, uta.verified_at,
       o.name AS org_name
FROM user_telegram_accounts uta
JOIN organizations o ON o.id = uta.org_id
WHERE uta.user_id = (SELECT id FROM users WHERE email = 'p.karasev@digital4pharma.ru');

\echo ''
\echo '=== 4. Все админы/владельцы этой организации ==='
SELECT m.user_id, m.role, u.email, u.name
FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE m.org_id IN (
    SELECT org_id FROM memberships WHERE user_id = (SELECT id FROM users WHERE email = 'p.karasev@digital4pharma.ru')
)
AND m.role IN ('owner', 'admin')
ORDER BY m.role, u.email;

\echo ''
\echo '=== 5. TG-аккаунты ВСЕХ админов/владельцев организации ==='
SELECT uta.user_id, u.email, uta.telegram_user_id, uta.telegram_username, uta.is_verified, uta.org_id
FROM user_telegram_accounts uta
JOIN users u ON u.id = uta.user_id
WHERE uta.user_id IN (
    SELECT m.user_id FROM memberships m
    WHERE m.org_id IN (
        SELECT org_id FROM memberships WHERE user_id = (SELECT id FROM users WHERE email = 'p.karasev@digital4pharma.ru')
    )
    AND m.role IN ('owner', 'admin')
)
AND uta.org_id IN (
    SELECT org_id FROM memberships WHERE user_id = (SELECT id FROM users WHERE email = 'p.karasev@digital4pharma.ru')
);

\echo ''
\echo '=== 6. Telegram-группы организации (org_telegram_groups) ==='
SELECT otg.tg_chat_id, otg.status, tg.title, tg.bot_status, tg.member_count
FROM org_telegram_groups otg
JOIN telegram_groups tg ON tg.tg_chat_id = otg.tg_chat_id
WHERE otg.org_id IN (
    SELECT org_id FROM memberships WHERE user_id = (SELECT id FROM users WHERE email = 'p.karasev@digital4pharma.ru')
);

\echo ''
\echo '=== 7. Записи telegram_group_admins для этих групп ==='
SELECT tga.tg_chat_id, tga.tg_user_id, tga.is_admin, tga.is_owner,
       tga.verified_at, tga.expires_at,
       CASE WHEN tga.expires_at > NOW() THEN 'ACTIVE' ELSE 'EXPIRED' END AS status,
       tga.updated_at
FROM telegram_group_admins tga
WHERE tga.tg_chat_id IN (
    SELECT otg.tg_chat_id FROM org_telegram_groups otg
    WHERE otg.org_id IN (
        SELECT org_id FROM memberships WHERE user_id = (SELECT id FROM users WHERE email = 'p.karasev@digital4pharma.ru')
    )
)
ORDER BY tga.tg_chat_id, tga.is_owner DESC, tga.is_admin DESC;

\echo ''
\echo '=== 8. КЛЮЧЕВАЯ ПРОВЕРКА: пересечение TG-аккаунтов админов орг с админами группы ==='
SELECT
    uta.telegram_user_id,
    uta.telegram_username,
    u.email,
    tga.tg_chat_id,
    tga.is_admin,
    tga.expires_at,
    CASE WHEN tga.expires_at > NOW() AND tga.is_admin THEN 'OK' ELSE 'FAIL' END AS access_check
FROM user_telegram_accounts uta
JOIN users u ON u.id = uta.user_id
JOIN memberships m ON m.user_id = uta.user_id AND m.org_id = uta.org_id
LEFT JOIN telegram_group_admins tga ON tga.tg_user_id = uta.telegram_user_id
    AND tga.tg_chat_id IN (
        SELECT otg.tg_chat_id FROM org_telegram_groups otg WHERE otg.org_id = uta.org_id
    )
WHERE uta.org_id IN (
    SELECT org_id FROM memberships WHERE user_id = (SELECT id FROM users WHERE email = 'p.karasev@digital4pharma.ru')
)
AND uta.is_verified = true
AND m.role IN ('owner', 'admin');

\echo ''
\echo '=== 9. Последние анонсы организации (статус, send_results) ==='
SELECT a.id, a.title, a.status, a.retry_count, a.scheduled_at, a.sent_at,
       a.send_results::text,
       array_length(a.target_groups, 1) AS target_groups_count
FROM announcements a
WHERE a.org_id IN (
    SELECT org_id FROM memberships WHERE user_id = (SELECT id FROM users WHERE email = 'p.karasev@digital4pharma.ru')
)
ORDER BY a.scheduled_at DESC
LIMIT 10;
