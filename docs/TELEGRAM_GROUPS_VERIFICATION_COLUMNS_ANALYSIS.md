# Telegram Groups Verification Columns - Анализ (Nov 4, 2025)

## 🔍 Проблема

В таблице `telegram_groups` есть несколько столбцов:
1. **`bot_status`** - текущий статус бота в группе (`'pending'`, `'connected'`, `'inactive'`)
2. **`verification_status`** - legacy статус верификации (`'pending'`, `'verified'`)
3. **`verified_by_user_id`** - кто верифицировал группу
4. **`last_verification_at`** - когда верифицирована
5. **`analytics_enabled`** - включена ли аналитика (bool)

**Симптомы:**
- В суперадминке красные крестики в столбце "права админа" совпадают с `verification_status`, а не с реальными правами бота
- У новых групп (добавленных за последнюю неделю) `verification_status='pending'`, хотя `bot_status='connected'`
- Функционально для владельца организации всё работает одинаково

---

## 📊 Примеры из базы

```json
// Группа 1: старая, с верификацией
{
  "tg_chat_id": -1003082332279,
  "bot_status": "connected",          // ✅ Бот имеет права админа
  "verification_status": "verified",   // ✅ Верифицирована
  "verified_by_user_id": "d6495527-fda7-45f5-a113-ff43ee6a8145",
  "last_verification_at": "2025-10-28 17:06:10.317+00",
  "analytics_enabled": false
}

// Группа 2: старая, с верификацией и аналитикой
{
  "tg_chat_id": -4987441578,
  "bot_status": "connected",          // ✅ Бот имеет права админа
  "verification_status": "verified",   // ✅ Верифицирована
  "verified_by_user_id": "d6495527-fda7-45f5-a113-ff43ee6a8145",
  "last_verification_at": "2025-10-28 17:06:10.571+00",
  "analytics_enabled": true
}

// Группа 3: новая, без верификации
{
  "tg_chat_id": -5020240850,
  "bot_status": "connected",          // ✅ Бот имеет права админа
  "verification_status": "pending",    // ❌ Не верифицирована (устарело!)
  "verified_by_user_id": null,
  "last_verification_at": null,
  "analytics_enabled": false
}
```

---

## 🔍 Где используются эти столбцы в коде

### 1. `analytics_enabled`

**Добавлен:** Migration 04 (`db/migrations/04_telegram_analytics.sql`)
```sql
ALTER TABLE telegram_groups 
ADD COLUMN IF NOT EXISTS analytics_enabled BOOLEAN DEFAULT TRUE;
```

**Где используется:**

#### a) `app/api/telegram/webhook/route.ts:163`
При создании новой группы через webhook:
```typescript
analytics_enabled: false, // Аналитика будет включена при добавлении в организацию
```

#### b) `app/app/[org]/telegram/actions.ts:191`
При проверке статуса группы (кнопка "Проверить статус"):
```typescript
analytics_enabled: true // Включаем аналитику
```

**Вывод:** 
- `analytics_enabled` изначально был задуман для отключения аналитики по группе
- **Нигде не читается!** Только устанавливается при создании/обновлении
- **НЕ ВЛИЯЕТ** на работу аналитики (все группы обрабатываются одинаково)
- **LEGACY COLUMN** - можно удалить

---

### 2. `verification_status`, `verified_by_user_id`, `last_verification_at`

**Где используются:**

#### a) `app/superadmin/groups/page.tsx:91`
**ПРОБЛЕМНОЕ МЕСТО!**
```typescript
has_admin_rights: group.verification_status === 'verified',
```
❌ **Неправильно!** Должно быть: `group.bot_status === 'connected'`

#### b) `app/api/telegram/groups/for-user/route.ts:376`
Передаётся в UI (но не используется):
```typescript
verification_status: groupAny.verification_status
```

#### c) `app/api/telegram/groups/update-admins/route.ts:212`
Устанавливается при синхронизации админов:
```typescript
verification_status: 'verified',
verified_by_user_id: accounts[0].user_id,
last_verification_at: new Date().toISOString()
```

#### d) `app/api/telegram/groups/sync/route.ts:295`
Устанавливается при ручной синхронизации:
```typescript
verification_status: 'verified',
verified_by_user_id: user.id,
last_verification_at: new Date().toISOString()
```

#### e) `app/api/telegram/groups/verify-admin/route.ts:127`
Устанавливается при верификации админ-прав:
```typescript
verification_status: 'verified',
verified_by_user_id: user.id,
last_verification_at: new Date().toISOString()
```

**Вывод:**
- `verification_status` - это **дублирование** `bot_status`
- Исторически использовался до того, как появился `bot_status`
- Сейчас `bot_status` обновляется автоматически через `my_chat_member` webhook
- `verification_status` НЕ обновляется автоматически → **отстаёт от реальности**
- **LEGACY COLUMNS** - можно удалить

---

## 🎯 Правильная логика

### Текущая (НЕПРАВИЛЬНАЯ):
```typescript
// Суперадминка (app/superadmin/groups/page.tsx:91)
has_admin_rights: group.verification_status === 'verified',
```

### Правильная (ДОЛЖНА БЫТЬ):
```typescript
// Используем bot_status, который обновляется автоматически
has_admin_rights: group.bot_status === 'connected',
```

---

## 📋 Рекомендации

### Вариант 1: Исправить суперадминку (быстрое решение)
Заменить проверку `verification_status` на `bot_status` в суперадминке.

### Вариант 2: Удалить legacy столбцы (правильное решение)
1. Обновить все эндпоинты, чтобы не устанавливали `verification_status`
2. Удалить столбцы через миграцию:
   - `analytics_enabled`
   - `verification_status`
   - `verified_by_user_id`
   - `last_verification_at`

3. Использовать только `bot_status` для всех проверок

---

## 🚀 Исправление

**Migration 080:** Удалить legacy столбцы
**Fix:** Исправить суперадминку (использовать `bot_status`)

---

## 🔗 Связанные файлы

- `app/superadmin/groups/page.tsx` - суперадминка (ПРОБЛЕМНОЕ МЕСТО)
- `app/api/telegram/groups/update-admins/route.ts` - синхронизация админов
- `app/api/telegram/groups/sync/route.ts` - ручная синхронизация
- `app/api/telegram/groups/verify-admin/route.ts` - верификация админ-прав
- `app/api/telegram/webhook/route.ts` - webhook (обновляет `bot_status`)
- `db/migrations/04_telegram_analytics.sql` - создание `analytics_enabled`

---

## ✅ Итог

**Столбцы `verification_status`, `verified_by_user_id`, `last_verification_at`, `analytics_enabled`:**
- ❌ Legacy код
- ❌ Не используются для функциональности
- ❌ Отстают от реальности (не обновляются автоматически)
- ❌ Вводят в заблуждение в суперадминке
- ✅ Можно безопасно удалить

**Правильный источник истины:**
- ✅ `bot_status` - обновляется автоматически через webhook `my_chat_member`
- ✅ `bot_status='connected'` → бот имеет права админа
- ✅ `bot_status='pending'` → бот НЕ имеет права админа (или ещё не проверено)
- ✅ `bot_status='inactive'` → бот был удалён из группы

