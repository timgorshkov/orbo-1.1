# Аудит кодовой базы и план рефакторинга

**Дата:** 30 октября 2024  
**Цель:** Устранить несоответствия между схемой БД и кодом, удалить мёртвый код

---

## 📊 Результаты аудита

### ✅ УТВЕРЖДЕНИЕ 1: telegram_activity_events, telegram_identities, telegram_updates

**Статус внешнего аудита:** ✅ ПОДТВЕРЖДЕН  
**Мое заключение:** Критическая проблема, требует немедленного исправления

#### Факты:
- **Миграция 42** (`db/migrations/42_cleanup_unused_tables.sql`) удаляет:
  - `telegram_activity_events` (строка 8)
  - `telegram_identities` (строка 21)
  - `telegram_updates` (строка 28)
  - `participants.identity_id` (строка 18)

#### Где код всё еще использует эти таблицы:

**1. `lib/services/eventProcessingService.ts`** - КРИТИЧНО ❌

```typescript
// Строки 47-64: Методы для telegram_updates
async isUpdateProcessed(updateId: number): Promise<boolean> {
  const { data } = await this.supabase
    .from('telegram_updates')  // ❌ Таблица удалена!
    .select('id')
    .eq('update_id', updateId)
    .single();
  return !!data;
}

async markUpdateProcessed(updateId: number): Promise<void> {
  await this.supabase
    .from('telegram_updates')  // ❌ Таблица удалена!
    .insert({ update_id: updateId });
}

// Строка 12: ParticipantRow type
type ParticipantRow = {
  identity_id?: string | null;  // ❌ Поле удалено!
  // ...
};

// Строки 880-1599: Множество вызовов writeGlobalActivityEvent
await this.writeGlobalActivityEvent({
  tg_chat_id: chatId,
  identity_id: null,  // ❌ Поле удалено!
  tg_user_id: userId,
  event_type: 'message',
  // ...
});

// Строки 1584-1600: Метод writeGlobalActivityEvent
private async writeGlobalActivityEvent(payload: {...}): Promise<void> {
  // DEPRECATED: telegram_activity_events and telegram_identities tables were removed
  // This method is kept for backward compatibility but does nothing
  return;  // ❌ Пустой метод, вводит в заблуждение
}
```

**2. `app/api/participants/backfill-orphans/route.ts`** ⚠️

```typescript
// Строки 10-20: Types
type IdentityRecord = {
  id: string | null;
  tg_user_id: number | null;
  // ...
};

type ParticipantRow = {
  identity_id: string | null;  // ❌ Поле удалено!
  // ...
};

type ActivityEventRecord = {
  identity_id: string | null;  // ❌ Поле удалено!
  // ...
};
```

#### Последствия:
- ❌ `eventProcessingService` пытается писать в несуществующие таблицы
- ❌ Идемпотентность вебхуков не работает (дубли событий)
- ❌ TypeScript типы не соответствуют реальной схеме
- ⚠️ Миграция 42 могла НЕ выполниться на продакшене

---

### ✅ УТВЕРЖДЕНИЕ 2.4: Старые таблицы материалов

**Статус внешнего аудита:** ✅ ПОДТВЕРЖДЕН  
**Мое заключение:** Безопасно удалить, миграция существует

#### Факты:
- **Миграция 49** (`db/migrations/49_migrate_old_materials.sql`) мигрирует данные:
  - `material_folders` → `material_pages`
  - `material_items` → `material_pages`
  - `material_access` → удаляется
- Миграция 42 НЕ удаляет эти таблицы (строки 36-60), только проверяет

#### Использование в коде:
- ✅ **НЕТ использования в `app/api`**
- ✅ **НЕТ использования в `components`**
- ⚠️ Только в типах `lib/database.types.ts`

#### Риски удаления:
- ✅ **НИЗКИЙ РИСК** - таблицы не используются, миграция выполнена

---

### ✅ УТВЕРЖДЕНИЕ 2.5: profiles.telegram_user_id

**Статус внешнего аудита:** ✅ ПОДТВЕРЖДЕН  
**Мое заключение:** Поле устарело, но требует осторожной миграции

#### Факты:
- **Миграция 02** добавляет `profiles.telegram_user_id` (строка 15)
- **Новая система:** `user_telegram_accounts` (создана позже)
- Поле **НЕ используется в app коде**, только в типах

#### Использование:
```typescript
// lib/database.types.ts - только type definition
profiles: {
  Row: {
    telegram_user_id: number | null  // Дублирует user_telegram_accounts
    // ...
  }
}
```

#### Где реально используется telegram_user_id:
- ✅ `user_telegram_accounts.telegram_user_id` - **АКТИВНО** используется в 19 файлах
- ❌ `profiles.telegram_user_id` - **НЕ используется** в коде

#### Риски удаления:
- ✅ **НИЗКИЙ РИСК** - поле не используется, данные уже в `user_telegram_accounts`

---

## 🛠️ План рефакторинга

### Фаза 1: Критические исправления (Высокий приоритет)

#### 1.1. Исправить `eventProcessingService.ts` ⚠️ КРИТИЧНО

**Проблема:** Методы пытаются писать в удалённые таблицы

**Решение:**
```typescript
// УДАЛИТЬ методы для telegram_updates (идемпотентность не реализована)
- async isUpdateProcessed()
- async markUpdateProcessed()

// УДАЛИТЬ мёртвый код
- private async writeGlobalActivityEvent()
- type ParticipantRow.identity_id

// ЗАМЕНИТЬ вызовы writeGlobalActivityEvent на прямую запись в activity_events
- Все вызовы (строки 880, 1053, 1086, 1145) заменить на прямой INSERT
```

**Риски:**
- ⚠️ **СРЕДНИЙ РИСК** - может сломать обработку вебхуков
- Требуется тщательное тестирование обработки сообщений Telegram
- Нужно добавить альтернативную идемпотентность (Redis? или ignore duplicates?)

**Альтернатива:**
- Оставить методы как заглушки с логированием предупреждения

---

#### 1.2. Очистить типы в `backfill-orphans/route.ts` ✅ БЕЗОПАСНО

**Проблема:** Типы содержат удалённое поле `identity_id`

**Решение:**
```typescript
// УДАЛИТЬ identity_id из типов:
type IdentityRecord = {
  - id: string | null;  // Это на самом деле НЕ identity_id
  tg_user_id: number | null;
  // ...
};

type ParticipantRow = {
  - identity_id: string | null;
  // ...
};

type ActivityEventRecord = {
  - identity_id: string | null;
  // ...
};
```

**Риски:**
- ✅ **НИЗКИЙ РИСК** - поле не используется в логике, только в типах

---

### Фаза 2: Удаление устаревших таблиц (Средний приоритет)

#### 2.1. Финальное удаление материалов ✅ БЕЗОПАСНО

**Условие:** Проверить на продакшене, выполнена ли миграция 49

**SQL:**
```sql
-- Проверка перед удалением
SELECT COUNT(*) as folders_count FROM material_folders;
SELECT COUNT(*) as items_count FROM material_items;
SELECT COUNT(*) as access_count FROM material_access;

-- Если все 0, безопасно удалить
DROP TABLE IF EXISTS material_access CASCADE;
DROP TABLE IF EXISTS material_items CASCADE;
DROP TABLE IF EXISTS material_folders CASCADE;
```

**Риски:**
- ✅ **НИЗКИЙ РИСК** - миграция 49 уже выполнена
- ⚠️ Убедитесь, что все данные в `material_pages`

---

#### 2.2. Удалить `profiles.telegram_user_id` ✅ БЕЗОПАСНО

**Условие:** Убедиться, что все данные в `user_telegram_accounts`

**SQL:**
```sql
-- Проверка перед удалением
SELECT 
  COUNT(*) as profiles_with_tg_id,
  COUNT(DISTINCT p.id) as total_profiles
FROM profiles p
WHERE p.telegram_user_id IS NOT NULL;

-- Проверить, что все есть в user_telegram_accounts
SELECT 
  p.id as profile_id,
  p.telegram_user_id,
  uta.id as account_id
FROM profiles p
LEFT JOIN user_telegram_accounts uta ON uta.telegram_user_id = p.telegram_user_id
WHERE p.telegram_user_id IS NOT NULL
  AND uta.id IS NULL;

-- Если нет несовпадений, безопасно удалить
ALTER TABLE profiles DROP COLUMN IF EXISTS telegram_user_id;
```

**Риски:**
- ✅ **НИЗКИЙ РИСК** - поле не используется в коде
- ⚠️ Проверить на продакшене, нет ли несовпадений

---

### Фаза 3: Обновление документации (Низкий приоритет)

#### 3.1. Обновить типы TypeScript

**Файлы:**
- `lib/database.types.ts` - пересоздать через `supabase gen types`

#### 3.2. Удалить устаревшую документацию

**Файлы для ревью:**
- `docs/THREE_CRITICAL_FIXES.md` - упоминает telegram_identities
- `docs/TELEGRAM_IDENTITIES_REMOVAL_FIX.md` - устарел
- `docs/DATABASE_CLEANUP_STATUS.md` - обновить статусы
- `docs/DATABASE_ANALYSIS.md` - обновить анализ

---

## ⚠️ КРИТИЧЕСКИЕ ВОПРОСЫ К ПОЛЬЗОВАТЕЛЮ

### Q1: Идемпотентность вебхуков Telegram

**Проблема:** `telegram_updates` удалена, но методы пытаются в неё писать

**Варианты:**
1. **Удалить идемпотентность** (текущее состояние) - возможны дубли событий
2. **Реализовать через Redis** - нужна инфраструктура
3. **Использовать unique constraints в activity_events** - может работать

**Вопрос:** Как вы хотите обрабатывать дубликаты событий от Telegram?

---

### Q2: Миграция 42 на продакшене

**Проблема:** Код использует удалённые таблицы, значит либо:
- Миграция 42 **НЕ выполнена** на продакшене
- ИЛИ код работает с ошибками

**Вопрос:** Выполнена ли миграция 42 на продакшене? Нужно ли её откатить?

---

### Q3: Старые таблицы материалов

**Вопрос:** Миграция 49 выполнена на продакшене? Все данные в `material_pages`?

---

### Q4: profiles.telegram_user_id

**Вопрос:** Есть ли на продакшене данные в `profiles.telegram_user_id`, которых нет в `user_telegram_accounts`?

---

## 📝 Рекомендуемая последовательность действий

### Шаг 1: Диагностика продакшена ⚠️ КРИТИЧНО

```sql
-- Проверить, существуют ли удалённые таблицы
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('telegram_updates', 'telegram_identities', 'telegram_activity_events');

-- Проверить, существует ли колонка identity_id
SELECT column_name 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'participants'
  AND column_name = 'identity_id';

-- Проверить старые таблицы материалов
SELECT COUNT(*) FROM material_folders;
SELECT COUNT(*) FROM material_items;
```

### Шаг 2: В зависимости от результатов

#### Если таблицы УДАЛЕНЫ на продакшене:
→ Исправить код (Фаза 1) НЕМЕДЛЕННО

#### Если таблицы ЕЩЁ СУЩЕСТВУЮТ:
→ Отложить миграцию 42, сначала исправить код

### Шаг 3: Постепенное удаление (после диагностики)

1. ✅ Исправить `eventProcessingService.ts`
2. ✅ Исправить типы в `backfill-orphans`
3. ✅ Тестирование на dev
4. ✅ Деплой фикса
5. ⚠️ Выполнить миграцию 42 (если не выполнена)
6. ✅ Удалить старые материалы (Фаза 2.1)
7. ✅ Удалить `profiles.telegram_user_id` (Фаза 2.2)

---

## 🎯 Оценка рисков

| Проблема | Риск поломки | Приоритет | Сложность |
|----------|--------------|-----------|-----------|
| telegram_updates в eventProcessingService | 🔴 ВЫСОКИЙ | P0 | Средняя |
| identity_id в типах | 🟡 НИЗКИЙ | P1 | Низкая |
| Старые таблицы материалов | 🟢 НЕТ | P2 | Низкая |
| profiles.telegram_user_id | 🟢 НЕТ | P2 | Низкая |

---

## 📚 Дополнительные наблюдения

### Хорошие практики, которые уже применены:

1. ✅ Миграция 42 хорошо документирована
2. ✅ Миграция 49 мигрирует данные перед удалением
3. ✅ `writeGlobalActivityEvent` помечен как DEPRECATED

### Что можно улучшить:

1. ⚠️ Проверять выполнение миграций перед деплоем кода
2. ⚠️ Удалять мёртвый код сразу, не оставлять заглушки
3. ⚠️ Автоматически пересоздавать типы (`supabase gen types`)

---

## ✅ Итоговое заключение

**Внешний аудит ВЕРЕН**, но ситуация требует уточнения:

1. ❌ **Критическая несогласованность** в `eventProcessingService.ts` - требует немедленного исправления
2. ✅ **Старые материалы** можно безопасно удалить
3. ✅ **profiles.telegram_user_id** можно безопасно удалить
4. ⚠️ **Нужна диагностика продакшена** перед любыми действиями

**Готов приступить к исправлению сразу после ответов на критические вопросы.**

