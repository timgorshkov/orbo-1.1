# Message Storage Unification Plan (Nov 4, 2025)

## 🔍 Текущая ситуация

### Что есть в БД:

**1. Таблица `activity_events`** (для аналитики)
- Хранит: метаданные, метрики (chars_count, links_count, mentions_count)
- **НЕ** хранит: полный текст сообщения
- Используется для: дашборды, графики активности

**2. Таблица `participant_messages`** (миграция 38)
- Создана для: хранения полных текстов сообщений
- **НЕ используется:** ни webhook, ни import не пишут в неё
- Имеет: полнотекстовый поиск (GIN индекс), AI analysis fields, retention policy (90 дней)

### Проблема сейчас:

**Webhook (пример ID 465):**
```json
{
  "meta": {
    "user": {"name": "Tim Gorshkov", "username": "timgorshkov"},
    "message_id": 181,
    "message_length": 7
  },
  "chars_count": 7,
  "event_type": "message",
  "tg_user_id": 154588486,
  // ❌ НЕТ ТЕКСТА!
}
```

**Import (пример ID 464):**
```json
{
  "meta": {
    "author_name": "Tim Gorshkov",
    "text_preview": "амыамаым",  // ❌ Только первые 50 символов!
    "import_format": "json"
  },
  "chars_count": 8,
  "event_type": "message",
  "tg_user_id": 154588486,
  // ❌ НЕТ ПОЛНОГО ТЕКСТА!
}
```

---

## 🎯 Цели унификации

### 1. Унифицировать структуру `meta` в `activity_events`

**Общая структура:**
```json
{
  "user": {
    "name": "Tim Gorshkov",
    "username": "timgorshkov",
    "tg_user_id": 154588486
  },
  "message": {
    "id": 181,
    "thread_id": null,
    "reply_to_id": null,
    "text_length": 7,
    "has_media": false,
    "media_type": null
  },
  "source": {
    "type": "webhook" | "import",
    "format": "json" | "html",  // только для import
    "batch_id": "uuid"  // только для import
  }
}
```

### 2. Начать использовать `participant_messages` для хранения текстов

**Зачем:**
- ✅ Аналитика тональности, тем, ключевых слов (AI)
- ✅ Полнотекстовый поиск по сообщениям
- ✅ Обогащение профилей участников
- ✅ Экспорт историй для пользователей
- ✅ Retention policy (90 дней автоматически)

**Что писать:**
- `message_text` - полный текст
- `message_id` - ID сообщения Telegram
- `reply_to_message_id` - ответ на сообщение
- `has_media`, `media_type` - медиа контент
- `chars_count`, `words_count` - метрики
- `sent_at` - реальная дата отправки (не created_at)

**Связь с `activity_events`:**
```sql
activity_event_id INTEGER REFERENCES activity_events(id) ON DELETE SET NULL
```
Каждое сообщение в `participant_messages` → ссылка на событие в `activity_events`.

---

## 📊 Telegram API: Что можно получить

### Webhooks:

**1. Обычное сообщение:**
```json
{
  "message": {
    "message_id": 123,
    "from": {...},
    "chat": {...},
    "date": 1699000000,
    "text": "Hello World",  // ✅ ПОЛНЫЙ ТЕКСТ
    "reply_to_message": {...},  // ✅ ОТВЕТ
    "entities": [...]  // ссылки, упоминания
  }
}
```

**2. Реакции (`message_reaction`):**
```json
{
  "message_reaction": {
    "chat": {...},
    "message_id": 123,
    "user": {...},
    "date": 1699000000,
    "old_reaction": [],
    "new_reaction": [
      {"type": "emoji", "emoji": "👍"}
    ]
  }
}
```
❌ **НЕ обрабатываем сейчас!**

**3. Редактирование (`edited_message`):**
```json
{
  "edited_message": {
    "message_id": 123,
    "text": "Updated text",
    "edit_date": 1699000000
  }
}
```
❌ **НЕ обрабатываем сейчас!**

### JSON Export (Telegram):

**Структура:**
```json
{
  "messages": [
    {
      "id": 58,
      "from_id": "user154588486",
      "text": "амыамаым",  // ✅ ПОЛНЫЙ ТЕКСТ
      "date": "2025-11-04T19:25:34",
      "reply_to_message_id": 57,  // ✅ ОТВЕТ
      "reactions": [  // ✅ РЕАКЦИИ ЕСТЬ!
        {"emoji": "👍", "count": 2}
      ]
    }
  ]
}
```

### HTML Export (старый формат):

```html
<div class="message">
  <div class="text">Hello World</div>  <!-- ✅ ПОЛНЫЙ ТЕКСТ -->
  <div class="reply_to">...</div>  <!-- ✅ ОТВЕТ -->
</div>
```

---

## 🚀 План реализации

### Phase 1: Унификация метаданных (1-2 часа)

**Файлы:**
- `lib/services/eventProcessingService.ts` - webhook обработка
- `app/api/telegram/import-history/[id]/import/route.ts` - import обработка

**Задачи:**
1. ✅ Унифицировать структуру `meta` в `activity_events`
2. ✅ Сохранять `text` в `meta.message.text` (первые 500 символов для превью)

**Результат:**
```json
// activity_events.meta (унифицированная структура)
{
  "user": {...},
  "message": {
    "text_preview": "первые 500 символов..."
  },
  "source": {...}
}
```

---

### Phase 2: Подключение `participant_messages` (2-3 часа)

**Задачи:**

**2.1. Webhook (`lib/services/eventProcessingService.ts`)**
- После создания записи в `activity_events`
- Вставить полный текст в `participant_messages`
- Связать через `activity_event_id`

**2.2. Import (`app/api/telegram/import-history/[id]/import/route.ts`)**
- После создания записи в `activity_events`
- Вставить полный текст в `participant_messages`
- Связать через `activity_event_id`

**2.3. Код:**
```typescript
// После insert в activity_events:
const activityEventId = insertedEvent.id;

await supabase
  .from('participant_messages')
  .insert({
    org_id: orgId,
    participant_id: participantId,
    tg_user_id: tgUserId,
    tg_chat_id: tgChatId,
    activity_event_id: activityEventId,
    message_id: messageId,
    message_text: fullText,  // ✅ ПОЛНЫЙ ТЕКСТ
    message_thread_id: threadId,
    reply_to_message_id: replyToId,
    has_media: hasMedia,
    media_type: mediaType,
    chars_count: fullText.length,
    words_count: fullText.split(/\s+/).length,
    sent_at: sentAt
  })
  .onConflict('tg_chat_id,message_id')  // идемпотентность
  .doNothing();  // ignore duplicates
```

**Результат:**
- ✅ Полные тексты сохраняются в `participant_messages`
- ✅ Связь с `activity_events` через `activity_event_id`
- ✅ Идемпотентность (уникальный индекс по `tg_chat_id, message_id`)

---

### Phase 3: Реакции и редактирование (опционально, 1-2 часа)

**3.1. Webhook: Реакции (`message_reaction`)**
- Новая таблица `message_reactions` или
- Хранить в `participant_messages.meta` как JSONB

**3.2. Webhook: Редактирование (`edited_message`)**
- UPDATE `participant_messages.message_text`
- Сохранять историю правок в `participant_messages.meta`

**3.3. Import: Реакции из JSON**
- Парсить `reactions` из JSON экспорта
- Сохранять в `participant_messages.meta`

**Результат:**
```json
// participant_messages.meta (расширенная)
{
  "reactions": [
    {"emoji": "👍", "count": 2},
    {"emoji": "❤️", "count": 1}
  ],
  "edit_history": [
    {"date": "2025-11-04T20:00:00", "text": "old version"}
  ]
}
```

---

## 📋 Детальный Checklist

### Phase 1: Унификация (приоритет: ВЫСОКИЙ)

- [ ] Определить финальную структуру `meta` (общая для webhook и import)
- [ ] Обновить `eventProcessingService.ts`:
  - [ ] Унифицировать `meta.user`
  - [ ] Добавить `meta.message.text_preview` (первые 500 символов)
  - [ ] Добавить `meta.source.type = 'webhook'`
- [ ] Обновить `import/route.ts`:
  - [ ] Унифицировать `meta.user`
  - [ ] Добавить `meta.message.text_preview` (первые 500 символов)
  - [ ] Добавить `meta.source.type = 'import'`
  - [ ] Добавить `meta.source.format = 'json' | 'html'`
- [ ] Протестировать:
  - [ ] Webhook создаёт правильный `meta`
  - [ ] Import создаёт правильный `meta`
  - [ ] Структура совместима с существующими записями

### Phase 2: `participant_messages` (приоритет: ВЫСОКИЙ)

- [ ] Проверить RLS политики на `participant_messages` (INSERT разрешён для service_role)
- [ ] Обновить `eventProcessingService.ts`:
  - [ ] После insert в `activity_events` → insert в `participant_messages`
  - [ ] Передать полный текст `body.message.text`
  - [ ] Связать через `activity_event_id`
  - [ ] Обработать `reply_to_message_id`
  - [ ] Обработать медиа (`has_media`, `media_type`)
- [ ] Обновить `import/route.ts`:
  - [ ] После insert в `activity_events` → insert в `participant_messages`
  - [ ] Передать полный текст из парсера
  - [ ] Связать через `activity_event_id`
  - [ ] Обработать `reply_to_message_id`
- [ ] Протестировать:
  - [ ] Webhook сохраняет тексты в `participant_messages`
  - [ ] Import сохраняет тексты в `participant_messages`
  - [ ] Идемпотентность работает (дубли не создаются)
  - [ ] `activity_event_id` правильно связывает таблицы

### Phase 3: Реакции и редактирование (приоритет: СРЕДНИЙ)

- [ ] Webhook: Обработка `message_reaction`
  - [ ] Сохранить в `participant_messages.meta` или новую таблицу
  - [ ] Создать событие в `activity_events` с `event_type='reaction'`
- [ ] Webhook: Обработка `edited_message`
  - [ ] UPDATE `participant_messages.message_text`
  - [ ] Сохранить историю правок в `meta.edit_history`
- [ ] Import: Парсинг реакций из JSON
  - [ ] Извлечь `reactions` из JSON
  - [ ] Сохранить в `participant_messages.meta`
- [ ] Протестировать:
  - [ ] Реакции сохраняются
  - [ ] Редактирование обновляет текст
  - [ ] История правок доступна

---

## 🔗 Связанные файлы

- `db/migrations/38_participant_messages_table.sql` - схема таблицы
- `lib/services/eventProcessingService.ts` - webhook обработка
- `app/api/telegram/import-history/[id]/import/route.ts` - import обработка
- `lib/services/telegramJsonParser.ts` - парсинг JSON экспорта
- `lib/services/telegramHistoryParser.ts` - парсинг HTML экспорта

---

## ⏱️ Оценка времени

| Phase | Задача | Время |
|-------|--------|-------|
| 1 | Унификация метаданных | 1-2 часа |
| 2 | Подключение `participant_messages` | 2-3 часа |
| 3 | Реакции и редактирование | 1-2 часа (опционально) |
| **ИТОГО** | **Базовая функциональность** | **3-5 часов** |

---

## 📊 Результат

**После Phase 1+2:**
- ✅ Единая структура `meta` в `activity_events` (webhook + import)
- ✅ Полные тексты сообщений в `participant_messages`
- ✅ Идемпотентность (дубли не создаются)
- ✅ Связь между `activity_events` и `participant_messages`
- ✅ Готовность к AI-анализу, полнотекстовому поиску, обогащению профилей

**После Phase 3 (опционально):**
- ✅ Реакции на сообщения
- ✅ История редактирования
- ✅ Полная совместимость с Telegram API

---

## 🚀 Следующие шаги

1. **Обсудить с пользователем:**
   - Приоритет Phase 3 (реакции/редактирование)?
   - Начать с Phase 1+2?

2. **Реализовать Phase 1:**
   - Унифицировать `meta` структуру
   - Протестировать на webhook и import

3. **Реализовать Phase 2:**
   - Подключить `participant_messages`
   - Протестировать сохранение текстов

4. **Деплой и верификация:**
   - Проверить что тексты сохраняются
   - Проверить что связи корректны
   - Проверить идемпотентность

5. **Документация:**
   - Обновить схему БД
   - Обновить API docs

