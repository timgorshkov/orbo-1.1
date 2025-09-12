-- ДЕМО ДАННЫЕ ДЛЯ ТЕСТИРОВАНИЯ
-- Этот скрипт создает тестовые данные для проекта Orbo
-- ВНИМАНИЕ: Запускайте этот скрипт только в тестовой среде!

BEGIN;

-- 1. Создаем демо-организацию
INSERT INTO public.organizations (id, name, plan)
VALUES ('11111111-1111-1111-1111-111111111111', 'Demo Organization', 'free');

-- 2. Добавляем текущего пользователя как owner
-- ВАЖНО: Замените значение user_id на ID вашего пользователя в Supabase Auth
-- Для получения ID вы можете проверить текущую сессию или выполнить:
-- SELECT auth.uid()
INSERT INTO public.memberships (org_id, user_id, role)
VALUES ('11111111-1111-1111-1111-111111111111', 'a2b9012b-6154-4fed-a053-289b7d51bdd2', 'owner');

-- 3. Создаем тестовую Telegram группу
INSERT INTO public.telegram_groups (org_id, tg_chat_id, title, bot_status)
VALUES ('11111111-1111-1111-1111-111111111111', 12345678, 'Test Telegram Group', 'connected');

-- 4. Добавляем тестовых участников
INSERT INTO public.participants (id, org_id, tg_user_id, username, full_name, email)
VALUES 
  ('aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 111111, 'user1', 'Иван Петров', 'ivan@example.com'),
  ('bbbbbbbb-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 222222, 'user2', 'Мария Сидорова', 'maria@example.com'),
  ('cccccccc-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 333333, 'user3', 'Алексей Кузнецов', 'alex@example.com');

-- 5. Связываем участников с группой
INSERT INTO public.participant_groups (participant_id, tg_group_id, joined_at)
VALUES 
  ('aaaaaaaa-1111-1111-1111-111111111111', 12345678, now() - interval '10 days'),
  ('bbbbbbbb-1111-1111-1111-111111111111', 12345678, now() - interval '5 days'),
  ('cccccccc-1111-1111-1111-111111111111', 12345678, now() - interval '2 days');

-- 6. Добавляем несколько событий активности
INSERT INTO public.activity_events (org_id, type, participant_id, tg_group_id, created_at)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'join', 'aaaaaaaa-1111-1111-1111-111111111111', 12345678, now() - interval '10 days'),
  ('11111111-1111-1111-1111-111111111111', 'join', 'bbbbbbbb-1111-1111-1111-111111111111', 12345678, now() - interval '5 days'),
  ('11111111-1111-1111-1111-111111111111', 'join', 'cccccccc-1111-1111-1111-111111111111', 12345678, now() - interval '2 days'),
  ('11111111-1111-1111-1111-111111111111', 'message', 'aaaaaaaa-1111-1111-1111-111111111111', 12345678, now() - interval '1 day'),
  ('11111111-1111-1111-1111-111111111111', 'message', 'bbbbbbbb-1111-1111-1111-111111111111', 12345678, now() - interval '12 hours'),
  ('11111111-1111-1111-1111-111111111111', 'message', 'cccccccc-1111-1111-1111-111111111111', 12345678, now() - interval '6 hours');

-- 7. Создаем папку для материалов
INSERT INTO public.material_folders (id, org_id, name)
VALUES ('dddddddd-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Общие материалы');

-- 8. Добавляем тестовые материалы
INSERT INTO public.material_items (org_id, folder_id, kind, title, content, created_by)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'dddddddd-1111-1111-1111-111111111111', 'doc', 'Правила сообщества', 'Это пример документа с правилами сообщества.', 'a2b9012b-6154-4fed-a053-289b7d51bdd2'),
  ('11111111-1111-1111-1111-111111111111', 'dddddddd-1111-1111-1111-111111111111', 'link', 'Полезная ссылка', null, 'a2b9012b-6154-4fed-a053-289b7d51bdd2');

UPDATE public.material_items SET url = 'https://example.com/useful-resource' WHERE title = 'Полезная ссылка';

-- 9. Создаем тестовые события
INSERT INTO public.events (id, org_id, title, description, starts_at, ends_at, visibility, created_by)
VALUES 
  ('eeeeeeee-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Мастер-класс по TailwindCSS', 'Практический мастер-класс по созданию современных интерфейсов с помощью TailwindCSS.', now() + interval '3 days', now() + interval '3 days' + interval '2 hours', 'public', 'a2b9012b-6154-4fed-a053-289b7d51bdd2'),
  ('ffffffff-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Закрытая встреча участников', 'Встреча только для участников сообщества.', now() + interval '7 days', now() + interval '7 days' + interval '3 hours', 'members', 'a2b9012b-6154-4fed-a053-289b7d51bdd2');

-- 10. Создаем регистрации на события
INSERT INTO public.event_registrations (org_id, event_id, participant_id, status, qr_token)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 'registered', 'token1'),
  ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-1111-1111-1111-111111111111', 'bbbbbbbb-1111-1111-1111-111111111111', 'registered', 'token2'),
  ('11111111-1111-1111-1111-111111111111', 'ffffffff-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 'registered', 'token3');

-- Активируем первого пользователя как checked_in
UPDATE public.event_registrations SET status = 'checked_in' WHERE qr_token = 'token1';

COMMIT;

-- Проверить, что все данные успешно добавлены:
-- SELECT * FROM public.organizations;
-- SELECT * FROM public.memberships;
-- SELECT * FROM public.participants;
-- SELECT * FROM public.events;
