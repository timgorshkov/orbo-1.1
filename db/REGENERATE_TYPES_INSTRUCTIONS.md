# Инструкция по регенерации database.types.ts

## Проблема

Файл `lib/database.types.ts` содержит **устаревшие типы** для таблицы `activity_events`:
- ❌ `type` (должно быть `event_type`)
- ❌ `participant_id` (удалено в миграции 71)
- ❌ `tg_group_id` (должно быть `tg_chat_id`)

Отсутствуют актуальные поля:
- `message_id`, `message_thread_id`, `reply_to_message_id`
- `has_media`, `chars_count`, `links_count`, `mentions_count`

## Решение

### Вариант 1: Supabase CLI (рекомендуется)

```bash
# 1. Установить Supabase CLI (если не установлен)
npm install -g supabase

# 2. Войти в Supabase
supabase login

# 3. Регенерировать типы
npx supabase gen types typescript --project-id vbrmhfggddgqshysfgae > lib/database.types.ts
```

### Вариант 2: Через Dashboard (альтернатива)

1. Перейти в [Supabase Dashboard](https://supabase.com/dashboard/project/vbrmhfggddgqshysfgae)
2. Settings → API → Generate Types → TypeScript
3. Скопировать сгенерированный код
4. Заменить содержимое `lib/database.types.ts`

### Вариант 3: Через API (если нет CLI)

```bash
curl "https://api.supabase.com/v1/projects/vbrmhfggddgqshysfgae/types/typescript" \
  -H "apikey: YOUR_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  > lib/database.types.ts
```

## Когда регенерировать?

Регенерируйте типы **после каждой миграции**, которая изменяет схему БД:
- Добавление/удаление таблиц
- Добавление/удаление/переименование колонок
- Изменение типов данных

## Проверка корректности

После регенерации проверьте, что `activity_events` содержит:

```typescript
activity_events: {
  Row: {
    event_type: string        // НЕ type
    tg_chat_id: number        // НЕ tg_group_id
    tg_user_id: number | null // есть
    message_id: number | null // есть
    // ...
  }
}
```

## Связанные миграции

- **042** — удалена `telegram_updates`, `telegram_identities`
- **071** — удалены колонки `type`, `participant_id`, `tg_group_id` из `activity_events`
- **072** — удалена `participant_audit_log`

---

**ВАЖНО:** Пока типы не регенерированы, избегайте использования Typed Supabase Client для `activity_events`.

