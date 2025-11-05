# Инструкция по диагностике аналитики

**Дата:** 5 ноября 2025

## 🐛 Проблемы

1. ✅ **Аналитика групп пустая** - ИСПРАВЛЕНО
2. ⚠️ **Все сообщения в одной дате** - ТРЕБУЕТ ДИАГНОСТИКИ
3. ⚠️ **13 участников вместо 3** - ТРЕБУЕТ ДИАГНОСТИКИ

---

## ✅ Исправление #1: Аналитика групп

**Проблема:** Пустые графики на `/telegram/groups/[id]/analytics` и вкладке "Аналитика"

**Причина:** `params.id` (строка) передавался вместо `group.tg_chat_id` (число)

**Решение:** 
- `app/app/[org]/telegram/groups/[id]/analytics/page.tsx` - изменено на `group.tg_chat_id.toString()`
- `app/app/[org]/telegram/groups/[id]/page.tsx` - изменено на `group.tg_chat_id.toString()`

---

## 🔍 Диагностика #2: Все сообщения в одной дате

### Шаг 1: Найди свой org_id

```sql
SELECT 
  otg.org_id,
  o.name as org_name,
  COUNT(DISTINCT pg.participant_id) as participant_count
FROM participant_groups pg
JOIN org_telegram_groups otg ON otg.tg_chat_id = pg.tg_group_id
JOIN organizations o ON o.id = otg.org_id
WHERE pg.is_active = TRUE
GROUP BY otg.org_id, o.name;
```

Скопируй свой `org_id` (формат: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

### Шаг 2: Проверь распределение по датам

```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as message_count,
  import_source,
  COUNT(DISTINCT tg_user_id) as unique_users
FROM activity_events
WHERE event_type = 'message'
  AND created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND org_id = 'ТВОЙ_ORG_ID' -- ⚠️ ЗАМЕНИ!
GROUP BY DATE(created_at), import_source
ORDER BY date DESC;
```

**Ожидаемый результат:** Несколько дат с разным количеством сообщений

**Если все в одной дате:** Проверь следующий запрос

### Шаг 3: Проверь импортированные сообщения

```sql
SELECT 
  id,
  created_at,
  import_source,
  meta->'source'->>'format' as import_format,
  meta->'message'->>'date' as original_message_date,
  tg_user_id
FROM activity_events
WHERE import_source = 'html_import'
  AND org_id = 'ТВОЙ_ORG_ID' -- ⚠️ ЗАМЕНИ!
ORDER BY id DESC
LIMIT 20;
```

**Проверь:**
- `created_at` - должна быть дата из сообщения
- `original_message_date` - должна совпадать с `created_at`

**Если даты одинаковые:** Проблема в самом экспорте (все сообщения действительно были в один день)

**Если даты разные:** Проблема в RPC функции `get_activity_timeline`

---

## 🔍 Диагностика #3: 13 участников вместо 3

### Шаг 1: Подсчитай участников вручную

```sql
SELECT 
  p.id as participant_id,
  p.full_name,
  p.username,
  p.tg_user_id,
  pg.tg_group_id,
  tg.title as group_title,
  pg.is_active,
  pg.source,
  pg.joined_at
FROM participants p
JOIN participant_groups pg ON pg.participant_id = p.id
JOIN org_telegram_groups otg ON otg.tg_chat_id = pg.tg_group_id
JOIN telegram_groups tg ON tg.tg_chat_id = pg.tg_group_id
WHERE otg.org_id = 'ТВОЙ_ORG_ID' -- ⚠️ ЗАМЕНИ!
  AND pg.is_active = TRUE
ORDER BY p.id, pg.tg_group_id;
```

**Посчитай уникальные `participant_id`**

**Если 3 участника:** Проблема в RPC функции `get_engagement_breakdown`

**Если больше 3:** Проверь на дубли:

```sql
SELECT 
  p.tg_user_id,
  p.username,
  COUNT(DISTINCT p.id) as participant_records,
  array_agg(DISTINCT p.id) as ids
FROM participants p
JOIN participant_groups pg ON pg.participant_id = p.id
JOIN org_telegram_groups otg ON otg.tg_chat_id = pg.tg_group_id
WHERE otg.org_id = 'ТВОЙ_ORG_ID' -- ⚠️ ЗАМЕНИ!
  AND pg.is_active = TRUE
GROUP BY p.tg_user_id, p.username
HAVING COUNT(DISTINCT p.id) > 1;
```

**Если есть дубли:** Нужно их объединить (создам скрипт)

### Шаг 2: Проверь RPC функцию напрямую

```sql
SELECT * FROM get_engagement_breakdown('ТВОЙ_ORG_ID'::UUID);
```

**Сравни результат с ручным подсчётом**

---

## 📊 Полный диагностический скрипт

Скопируй и выполни: `db/diagnose_analytics_issues.sql`

**Важно:** Замени все `REPLACE_WITH_YOUR_ORG_ID` на свой org_id!

---

## 🚀 Деплой исправлений

```bash
git add .
git commit -m "fix: Group analytics tgChatId parameter"
git push origin master
```

После деплоя:
1. Открой `/app/[org]/telegram/groups/[id]` → вкладка "Аналитика"
2. Проверь, что графики заполнены
3. Если всё ещё пусто → запусти диагностические SQL скрипты

---

## 📝 Следующие шаги

После диагностики сообщи результаты:
1. Сколько дат с сообщениями на самом деле?
2. Сколько уникальных участников находит SQL?
3. Есть ли дубли участников?

Тогда я смогу точно определить, где проблема и как её исправить.

