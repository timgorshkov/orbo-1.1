# 🔍 Debugging Weekly Digest Cron Job

## Проблема
Еженедельный дайджест не приходит в понедельник утром.

## Исправления (17 ноября 2025)

### 1. ❌ Критическая ошибка: Неправильная связь participants → users
**Файл:** `app/api/cron/send-weekly-digests/route.ts`

**Было:**
```typescript
// ❌ WRONG: participants.id !== users.id
const { data: participants } = await supabaseAdmin
  .from('participants')
  .select('id, tg_user_id, full_name, username')
  .eq('org_id', org.id)
  .in('id', userIds);  // userIds содержит users.id, а не participants.id!
```

**Стало:**
```typescript
// ✅ CORRECT: через user_telegram_accounts
const { data: telegramAccounts } = await supabaseAdmin
  .from('user_telegram_accounts')
  .select('user_id, telegram_user_id')
  .eq('org_id', org.id)
  .in('user_id', userIds);  // Правильная связь users → telegram → participants

const tgUserIds = telegramAccounts.map(ta => ta.telegram_user_id);

const { data: participants } = await supabaseAdmin
  .from('participants')
  .select('tg_user_id, full_name, username')
  .eq('org_id', org.id)
  .in('tg_user_id', tgUserIds);  // Правильный lookup
```

### 2. 📝 Улучшенное логирование
Добавлены детальные логи для диагностики:
- Настройки каждой организации (день, время, timezone)
- Результат проверки `shouldSendDigestNow`
- Детали сравнения дня и времени
- Информация о последней отправке

---

## Как проверить настройки дайджеста в БД

### SQL запрос для проверки:
```sql
SELECT 
  id,
  name,
  digest_enabled,
  digest_day,  -- 0=Sunday, 1=Monday, 2=Tuesday, etc.
  digest_time,
  timezone,
  last_digest_sent_at
FROM organizations
WHERE digest_enabled = true;
```

### Проверить подписки админов:
```sql
SELECT 
  m.org_id,
  m.user_id,
  m.role,
  m.digest_notifications,
  uta.telegram_user_id,
  p.full_name,
  p.username
FROM memberships m
LEFT JOIN user_telegram_accounts uta ON uta.user_id = m.user_id AND uta.org_id = m.org_id
LEFT JOIN participants p ON p.tg_user_id = uta.telegram_user_id AND p.org_id = m.org_id
WHERE m.org_id = 'YOUR_ORG_ID'
  AND m.role IN ('owner', 'admin')
  AND m.digest_notifications = true;
```

---

## Как протестировать cron job вручную

### 1. **Локальный тест (через localhost):**
```bash
# В браузере или curl:
http://localhost:3000/api/cron/send-weekly-digests
```

### 2. **Production тест (с CRON_SECRET):**
```bash
curl -X GET https://app.orbo.ru/api/cron/send-weekly-digests \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### 3. **Vercel Logs (проверить выполнение cron):**
```bash
vercel logs --app orbo-1-1 --follow
```

Или через Vercel Dashboard:
1. Открыть проект в Vercel
2. Перейти в "Logs"
3. Фильтр: "Functions" → `/api/cron/send-weekly-digests`
4. Проверить логи за последние 24 часа

---

## Расписание Cron (из vercel.json)

```json
{
  "path": "/api/cron/send-weekly-digests",
  "schedule": "0 6 * * *"
}
```

**Расшифровка:** Запускается **каждый день в 06:00 UTC**.

### Перевод в местное время:
- **Москва (MSK):** 06:00 UTC = **09:00 MSK**
- **Екатеринбург (YEKT):** 06:00 UTC = **11:00 YEKT**

### Логика проверки времени:
1. Cron запускается в 06:00 UTC
2. Для каждой организации проверяется:
   - Текущий день недели в timezone организации
   - Текущий час в timezone организации
3. Если `org.digest_day === текущий_день` И `org.digest_time.hour === текущий_час`, то отправляется дайджест

---

## Типичные причины отсутствия дайджеста

### ❌ 1. Неправильный день недели
```
digest_day = 1 (Понедельник)
Сегодня: Вторник
→ Дайджест не отправится
```

**Решение:** Проверить `digest_day` в БД.

### ❌ 2. Неправильное время
```
digest_time = '09:00:00'
Cron запускается в 06:00 UTC = 09:00 MSK
Но организация настроена на timezone = 'America/New_York'
→ 06:00 UTC = 01:00 EST (не совпадает с 09:00)
```

**Решение:** Проверить `timezone` и `digest_time`.

### ❌ 3. Дайджест уже отправлен сегодня
```
last_digest_sent_at = '2025-11-17T06:00:00Z' (сегодня)
→ Дайджест пропускается
```

**Решение:** Это нормально. Дайджест отправляется только 1 раз в день.

### ❌ 4. Нет Telegram аккаунтов у админов
```
Админы есть (memberships с role=admin)
Но у них нет записей в user_telegram_accounts
→ Нет получателей для отправки
```

**Решение:** Админы должны авторизоваться через Telegram и подтвердить аккаунт.

### ❌ 5. digest_notifications = false
```
Админ есть, telegram есть
Но digest_notifications = false в memberships
→ Админ не получит дайджест
```

**Решение:** Админ должен включить получение дайджестов в настройках профиля.

---

## Примеры логов

### ✅ Успешная отправка:
```
[Cron] Weekly digest job started
[Cron] Current UTC: Day=1, Hour=6
[Cron] Found 2 orgs with digest enabled
[Cron] Checking Test Org: {digest_day: 1, digest_time: '09:00:00', timezone: 'Europe/Moscow', ...}
[Cron] shouldSendDigestNow check: {orgDay: 1, orgHour: 9, digestDay: 1, digestHour: 9, dayMatch: true, hourMatch: true}
[Cron] ✅ Should send digest NOW
[Cron] ✅ Processing Test Org...
[Cron] Test Org: 3/3 sent, cost $0.0012
[Cron] Job complete: 1/2 orgs processed, total cost $0.0012
```

### ❌ День не совпадает:
```
[Cron] Checking Test Org: {digest_day: 1, digest_time: '09:00:00', ...}
[Cron] shouldSendDigestNow check: {orgDay: 2, digestDay: 1, dayMatch: false}
[Cron] Day mismatch: org day 2 !== digest day 1
[Cron] Skipping Test Org (not scheduled for now)
```

### ❌ Час не совпадает:
```
[Cron] shouldSendDigestNow check: {orgHour: 10, digestHour: 9, hourMatch: false}
[Cron] Hour mismatch: org hour 10 !== digest hour 9
[Cron] Skipping Test Org (not scheduled for now)
```

### ❌ Нет Telegram аккаунтов:
```
[Cron] ✅ Processing Test Org...
[Cron] No telegram accounts found for Test Org
```

---

## Как включить дайджест для организации

### 1. Через API (PATCH `/api/organizations/[id]`):
```json
{
  "digest_enabled": true,
  "digest_day": 1,       // 0=Sunday, 1=Monday, etc.
  "digest_time": "09:00:00",
  "timezone": "Europe/Moscow"
}
```

### 2. Напрямую в БД:
```sql
UPDATE organizations
SET 
  digest_enabled = true,
  digest_day = 1,  -- Понедельник
  digest_time = '09:00:00',
  timezone = 'Europe/Moscow'
WHERE id = 'YOUR_ORG_ID';
```

### 3. Включить уведомления для админа:
```sql
UPDATE memberships
SET digest_notifications = true
WHERE org_id = 'YOUR_ORG_ID'
  AND user_id = 'USER_ID'
  AND role IN ('owner', 'admin');
```

---

## Чеклист для диагностики

- [ ] Проверить настройки организации в БД (`digest_enabled`, `digest_day`, `digest_time`, `timezone`)
- [ ] Проверить, что сегодня правильный день недели для отправки
- [ ] Проверить, что текущее время (в timezone организации) совпадает с `digest_time`
- [ ] Проверить, что есть админы с `digest_notifications = true`
- [ ] Проверить, что у админов есть Telegram аккаунты (`user_telegram_accounts`)
- [ ] Проверить, что у админов есть `participants` записи с `tg_user_id`
- [ ] Проверить логи Vercel на момент запуска cron (06:00 UTC)
- [ ] Протестировать cron job вручную через `/api/cron/send-weekly-digests`

---

## Контакты для отладки

**Основные файлы:**
- `app/api/cron/send-weekly-digests/route.ts` - Cron job
- `lib/services/weeklyDigestService.ts` - Генерация дайджеста
- `lib/templates/weeklyDigest.ts` - Форматирование текста
- `vercel.json` - Расписание cron

**База данных:**
- Таблица: `organizations` (настройки дайджеста)
- Таблица: `memberships` (подписки админов)
- Таблица: `user_telegram_accounts` (связь users → telegram)
- Таблица: `participants` (данные для имен)

