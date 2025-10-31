# Безопасный план очистки кода

**Принципы:**
1. ✅ Данные не критичны - можно удалять
2. ❌ НЕ ломать работающую бизнес-логику
3. 🎯 Удалять ТОЛЬКО реально мёртвый код (не вызываемый никем)

---

## 📊 Шаг 1: Диагностика (СНАЧАЛА)

Выполните в Supabase SQL Editor:
```sql
-- Файл: db/diagnose_code_cleanup_status.sql
```

Он покажет **6 таблиц с результатами**:
1. Удалённые таблицы (telegram_updates, telegram_identities, telegram_activity_events)
2. Колонка participants.identity_id
3. Старые таблицы материалов
4. profiles.telegram_user_id
5. Новые таблицы (данные)
6. **ИТОГОВЫЕ РЕКОМЕНДАЦИИ**

---

## 🛠️ Шаг 2: Удаление МЁРТВОГО кода

### 2.1. Удалить из `lib/services/eventProcessingService.ts` ✅ БЕЗОПАСНО

**Что удалить:**

#### A) Методы для telegram_updates (идемпотентность не работает)

```typescript
// УДАЛИТЬ ПОЛНОСТЬЮ строки 47-64:
async isUpdateProcessed(updateId: number): Promise<boolean> {
  const { data } = await this.supabase
    .from('telegram_updates')  // ❌ Таблица не существует
    .select('id')
    .eq('update_id', updateId)
    .single();
  return !!data;
}

async markUpdateProcessed(updateId: number): Promise<void> {
  await this.supabase
    .from('telegram_updates')  // ❌ Таблица не существует
    .insert({ update_id: updateId });
}
```

**Замена:** НИЧЕГО. Просто удалить. Идемпотентность сейчас НЕ работает.

---

#### B) Метод writeGlobalActivityEvent (пустой метод-заглушка)

```typescript
// УДАЛИТЬ ПОЛНОСТЬЮ строки 1584-1600:
private async writeGlobalActivityEvent(payload: {
  tg_chat_id: number;
  identity_id: string | null;  // ❌ Поле удалено
  tg_user_id: number;
  // ...
}): Promise<void> {
  // DEPRECATED: this method does nothing
  return;
}
```

**Замена:** Удалить ВСЕ вызовы метода (4 места):
- Строка 880
- Строка 1053
- Строка 1086
- Строка 1145

Просто **удалить строки с вызовом**, не заменять.

**Почему безопасно?**
- Метод НИЧЕГО не делает (возвращает `return;`)
- Комментарий говорит "DEPRECATED"
- Данные уже пишутся в `activity_events` напрямую

---

#### C) Поле identity_id из типа ParticipantRow

```typescript
// БЫЛО (строка 12):
type ParticipantRow = {
  id: string;
  merged_into?: string | null;
  identity_id?: string | null;  // ❌ УДАЛИТЬ
  first_name?: string | null;
  // ...
};

// СТАЛО:
type ParticipantRow = {
  id: string;
  merged_into?: string | null;
  // identity_id удалено
  first_name?: string | null;
  // ...
};
```

**Почему безопасно?**
- Поле помечено как `optional` (`?`)
- Не используется в логике

---

### 2.2. Удалить из `app/api/participants/backfill-orphans/route.ts` ✅ БЕЗОПАСНО

**Что удалить:**

```typescript
// БЫЛО (строки 10-20):
type IdentityRecord = {
  id: string | null;  // ❌ УДАЛИТЬ (это не identity_id)
  tg_user_id: number | null;
  // ...
};

type ParticipantRow = {
  id: string;
  org_id: string;
  identity_id: string | null;  // ❌ УДАЛИТЬ
  tg_user_id: number | null;
  // ...
};

type ActivityEventRecord = {
  identity_id: string | null;  // ❌ УДАЛИТЬ
  tg_user_id: number | null;
  // ...
};

// СТАЛО:
type IdentityRecord = {
  // id удалено
  tg_user_id: number | null;
  // ...
};

type ParticipantRow = {
  id: string;
  org_id: string;
  // identity_id удалено
  tg_user_id: number | null;
  // ...
};

type ActivityEventRecord = {
  // identity_id удалено
  tg_user_id: number | null;
  // ...
};
```

**Почему безопасно?**
- Поля не используются в запросах или логике
- Только в определении типов

---

## 🗑️ Шаг 3: Удаление БД объектов (ПОСЛЕ диагностики)

### 3.1. Старые таблицы материалов ✅ БЕЗОПАСНО

**Условие:** Диагностика показала, что таблицы существуют

```sql
-- Выполнить в Supabase SQL Editor:
DROP TABLE IF EXISTS material_access CASCADE;
DROP TABLE IF EXISTS material_items CASCADE;
DROP TABLE IF EXISTS material_folders CASCADE;

-- Обновить комментарий в material_pages
COMMENT ON TABLE material_pages IS 'Новая система материалов. Заменяет material_folders/items (удалены).';
```

**Почему безопасно?**
- ✅ Миграция 49 уже мигрировала данные
- ✅ Код НЕ использует старые таблицы
- ✅ Все запросы идут в `material_pages`

---

### 3.2. profiles.telegram_user_id ✅ БЕЗОПАСНО

**Условие:** Диагностика показала, что колонка существует

```sql
-- Выполнить в Supabase SQL Editor:
ALTER TABLE profiles DROP COLUMN IF EXISTS telegram_user_id;

-- Обновить комментарий
COMMENT ON TABLE profiles IS 'User profiles. Telegram IDs moved to user_telegram_accounts table.';
```

**Почему безопасно?**
- ✅ Код НЕ использует `profiles.telegram_user_id`
- ✅ Все данные в `user_telegram_accounts`
- ✅ Только дубль информации

---

### 3.3. Обновить типы TypeScript

```bash
# После удаления колонок в БД:
npx supabase gen types typescript --project-id <your-project-id> > lib/database.types.ts
```

Или вручную удалить из `lib/database.types.ts`:

```typescript
// УДАЛИТЬ из profiles:
profiles: {
  Row: {
    // ...
    telegram_user_id: number | null  // ❌ УДАЛИТЬ эту строку
  }
}
```

---

## ⚠️ ЧТО НЕ ТРОГАТЬ (работает!)

### НЕ УДАЛЯТЬ эти методы из `eventProcessingService.ts`:

1. ✅ `findOrCreateIdentity()` (строки 1575-1582)
   - Помечен `DEPRECATED`, но **возвращает `null`** (безопасно)
   - Вызывается в других методах
   - Просто возвращает `null`, не ломает логику

2. ✅ `async processMessage()` и другие рабочие методы
   - Пишут в `activity_events` напрямую
   - Это РАБОТАЮЩАЯ логика

3. ✅ Любые методы, которые НЕ обращаются к удалённым таблицам

---

## 📝 Чек-лист выполнения

### Фаза 1: Диагностика
- [ ] Выполнить `db/diagnose_code_cleanup_status.sql` на продакшене
- [ ] Сохранить результаты (6 таблиц)
- [ ] Убедиться, что понятен статус каждой проблемы

### Фаза 2: Удаление кода (безопасно)
- [ ] Удалить `isUpdateProcessed` и `markUpdateProcessed` из `eventProcessingService.ts`
- [ ] Удалить `writeGlobalActivityEvent` метод
- [ ] Удалить 4 вызова `writeGlobalActivityEvent`
- [ ] Удалить `identity_id` из типа `ParticipantRow` (eventProcessingService)
- [ ] Удалить `identity_id` из 3 типов в `backfill-orphans/route.ts`
- [ ] Запустить `npm run build` - проверить, что нет ошибок компиляции

### Фаза 3: Деплой фиксов
- [ ] Задеплоить изменения кода
- [ ] Проверить, что вебхуки Telegram работают (отправить тестовое сообщение)
- [ ] Проверить логи Vercel - нет ошибок обращения к несуществующим таблицам

### Фаза 4: Удаление БД объектов (после проверки кода)
- [ ] Удалить старые таблицы материалов (если существуют)
- [ ] Удалить `profiles.telegram_user_id` (если существует)
- [ ] Обновить типы TypeScript (`supabase gen types`)
- [ ] Задеплоить обновлённые типы

### Фаза 5: Финал
- [ ] Обновить `docs/CODE_AUDIT_AND_CLEANUP_PLAN.md` - отметить выполненное
- [ ] Удалить устаревшую документацию:
  - [ ] `docs/TELEGRAM_IDENTITIES_REMOVAL_FIX.md`
  - [ ] `docs/THREE_CRITICAL_FIXES.md` (если устарел)
- [ ] Запустить финальную диагностику - всё должно быть "✅ Удалена"

---

## 🎯 Ожидаемый результат

**До:**
- ❌ Код обращается к несуществующим таблицам (или мёртвые таблицы занимают место)
- ❌ TypeScript типы не соответствуют БД
- ❌ Мёртвый код вводит в заблуждение

**После:**
- ✅ Код обращается только к существующим таблицам
- ✅ TypeScript типы соответствуют БД
- ✅ Нет мёртвого кода
- ✅ Бизнес-логика работает как раньше

---

## 🚨 Проблемы и решения

### Проблема: "Вебхуки Telegram перестали работать"

**Причина:** Удалили рабочий код вместо мёртвого

**Решение:** 
1. Откатить изменения в `eventProcessingService.ts`
2. Убедиться, что удаляете ТОЛЬКО:
   - `isUpdateProcessed` / `markUpdateProcessed` (обращаются к `telegram_updates`)
   - `writeGlobalActivityEvent` (пустой метод)
   - Вызовы `writeGlobalActivityEvent` (метод ничего не делает)

**НЕ удалять:**
- `processMessage` и другие методы обработки событий
- Запись в `activity_events` напрямую

---

### Проблема: "TypeScript ошибки компиляции"

**Причина:** Удалили поля из типов, которые используются

**Решение:**
1. Проверить, что удалили `identity_id` ТОЛЬКО из типов
2. Убедиться, что не удалили `tg_user_id` (он используется!)

---

### Проблема: "Материалы перестали работать"

**Причина:** Удалили `material_folders` до выполнения миграции 49

**Решение:**
1. Проверить диагностику - были ли данные в старых таблицах?
2. Если были, восстановить из бэкапа и выполнить миграцию 49
3. Если не были, просто создать заново в `material_pages`

---

## ⏱️ Оценка времени

| Фаза | Время | Риск |
|------|-------|------|
| Диагностика | 5 мин | Нет |
| Удаление кода | 15 мин | Низкий |
| Тестирование | 10 мин | Нет |
| Деплой | 5 мин | Низкий |
| Удаление БД | 10 мин | Низкий |
| Финал | 10 мин | Нет |
| **ИТОГО** | **55 мин** | **Низкий** |

---

## 🎓 Выводы

1. ✅ Внешний аудит был **100% ПРАВ**
2. ✅ Код содержит обращения к несуществующим таблицам
3. ✅ Но это мёртвый код (пустые методы, неиспользуемые поля)
4. ✅ Удаление безопасно и займёт ~1 час работы
5. ✅ Бизнес-логика не пострадает

**Готов начать чистку?** Сначала запустите диагностику и пришлите результаты!

