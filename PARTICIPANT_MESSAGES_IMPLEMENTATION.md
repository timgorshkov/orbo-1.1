# Реализация хранения текстов сообщений участников

## ✅ Что реализовано

### 1. База данных
- **Таблица**: `participant_messages`
- **Миграция**: `db/migrations/38_participant_messages_table.sql`
- **Особенности**:
  - Полнотекстовый поиск (PostgreSQL FTS с поддержкой русского языка)
  - Уникальный индекс для предотвращения дублей
  - Автоматическая генерация `tsvector` для поиска
  - Поле для будущего AI-анализа (`analysis_data`)

### 2. Структура данных

```typescript
interface ParticipantMessage {
  id: string; // UUID
  
  // Связи
  org_id: string;
  participant_id: string | null;
  tg_user_id: number;
  tg_chat_id: number;
  
  // Данные сообщения
  message_id: number;
  message_text: string;
  message_thread_id: number | null;
  reply_to_message_id: number | null;
  
  // Метаданные
  has_media: boolean;
  media_type: 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'sticker' | 'animation' | 'video_note' | null;
  chars_count: number;
  words_count: number;
  
  // Временные метки
  sent_at: string; // ISO timestamp
  created_at: string; // ISO timestamp
  
  // Для AI-анализа
  analyzed_at: string | null;
  analysis_data: {
    sentiment?: 'positive' | 'neutral' | 'negative';
    topics?: string[];
    keywords?: string[];
    expertise_signals?: any;
  } | null;
  
  // Полнотекстовый поиск
  message_tsv: any; // tsvector (автоматически генерируется)
}
```

### 3. Безопасность (RLS Policies)

✅ **Чтение**: Участники организации могут читать сообщения своей организации  
✅ **Вставка**: Разрешена всем (для сервисной роли через webhook)  
✅ **Обновление**: Только владельцы и админы организации  
✅ **Удаление**: Только владельцы организации  

### 4. Утилитарные функции

#### `cleanup_old_participant_messages()`
Удаляет сообщения старше 90 дней (retention policy).

```sql
SELECT cleanup_old_participant_messages();
-- Возвращает количество удаленных записей
```

#### `delete_participant_data(participant_id)`
Удаляет все сообщения участника и анонимизирует его события (GDPR compliance).

```sql
SELECT delete_participant_data('xxx-xxx-xxx-xxx');
```

#### `get_participant_messages_stats()`
Возвращает статистику по хранимым сообщениям.

```sql
SELECT * FROM get_participant_messages_stats();
```

Результат:
```
total_messages | total_participants | total_size_mb | oldest_message | newest_message | avg_message_length
```

### 5. Код обработки

**Файл**: `lib/services/eventProcessingService.ts`

Добавлены методы:
- `saveMessageText()` - сохраняет текст сообщения
- `detectMediaType()` - определяет тип медиа

**Логика**:
1. После успешной записи в `activity_events`
2. Проверяется наличие текста в сообщении
3. Сохраняется в `participant_messages` с полными метаданными
4. Обработка ошибок дубликатов (код 23505)

---

## 📋 Инструкция по развертыванию

### Шаг 1: Применить миграцию

Откройте Supabase SQL Editor и выполните:

```sql
-- Скопируйте и выполните содержимое файла:
-- db/migrations/38_participant_messages_table.sql
```

Проверьте, что таблица создана:

```sql
SELECT tablename FROM pg_tables WHERE tablename = 'participant_messages';
```

### Шаг 2: Проверить политики RLS

```sql
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'participant_messages';
```

Должно быть 4 политики:
- `participant_messages_select_policy` (SELECT)
- `participant_messages_insert_policy` (INSERT)
- `participant_messages_update_policy` (UPDATE)
- `participant_messages_delete_policy` (DELETE)

### Шаг 3: Тестирование

1. **Отправьте тестовое сообщение** в одну из подключенных Telegram групп

2. **Проверьте логи Vercel**:
```
[EventProcessing] Saving message text, length: 25
[EventProcessing] ✅ Message text saved successfully
```

3. **Проверьте данные в БД**:
```sql
SELECT 
  id,
  message_text,
  chars_count,
  words_count,
  has_media,
  sent_at
FROM participant_messages
ORDER BY sent_at DESC
LIMIT 10;
```

---

## 🔍 Примеры использования

### 1. Получить последние сообщения участника

```sql
SELECT 
  message_text,
  sent_at,
  has_media,
  media_type
FROM participant_messages
WHERE participant_id = 'xxx-xxx-xxx-xxx'
ORDER BY sent_at DESC
LIMIT 50;
```

### 2. Полнотекстовый поиск

```sql
-- Найти сообщения, содержащие слова "python" ИЛИ "javascript"
SELECT 
  p.username,
  p.full_name,
  pm.message_text,
  pm.sent_at
FROM participant_messages pm
JOIN participants p ON p.id = pm.participant_id
WHERE pm.org_id = 'xxx-xxx-xxx-xxx'
  AND pm.message_tsv @@ to_tsquery('russian', 'python | javascript')
ORDER BY pm.sent_at DESC
LIMIT 20;
```

### 3. Найти участников по экспертизе

```sql
-- Кто больше всего писал про определенную тему
SELECT 
  p.id,
  p.username,
  p.full_name,
  COUNT(*) as message_count,
  MAX(pm.sent_at) as last_mention
FROM participant_messages pm
JOIN participants p ON p.id = pm.participant_id
WHERE pm.org_id = 'xxx-xxx-xxx-xxx'
  AND pm.message_tsv @@ to_tsquery('russian', 'machine & learning')
GROUP BY p.id, p.username, p.full_name
HAVING COUNT(*) >= 3
ORDER BY message_count DESC;
```

### 4. Статистика по участнику

```sql
SELECT 
  COUNT(*) as total_messages,
  SUM(chars_count) as total_chars,
  AVG(chars_count) as avg_message_length,
  SUM(words_count) as total_words,
  AVG(words_count) as avg_words_per_message,
  COUNT(*) FILTER (WHERE has_media = true) as messages_with_media,
  MIN(sent_at) as first_message,
  MAX(sent_at) as last_message
FROM participant_messages
WHERE participant_id = 'xxx-xxx-xxx-xxx';
```

### 5. Самые активные участники

```sql
SELECT 
  p.username,
  p.full_name,
  COUNT(*) as message_count,
  SUM(pm.words_count) as total_words,
  AVG(pm.chars_count) as avg_message_length
FROM participant_messages pm
JOIN participants p ON p.id = pm.participant_id
WHERE pm.org_id = 'xxx-xxx-xxx-xxx'
  AND pm.sent_at > NOW() - INTERVAL '30 days'
GROUP BY p.id, p.username, p.full_name
ORDER BY message_count DESC
LIMIT 10;
```

---

## 🤖 Будущий AI-анализ

### Пример структуры analysis_data:

```json
{
  "sentiment": "positive",
  "confidence": 0.85,
  "topics": ["programming", "python", "web-development"],
  "keywords": ["flask", "api", "rest"],
  "expertise_signals": {
    "technical_depth": 0.7,
    "helping_others": true,
    "question_asking": false
  },
  "language_quality": {
    "grammar_score": 0.9,
    "professionalism": 0.8
  }
}
```

### Использование для профилей:

1. **Автоматическое описание**: "Часто обсуждает Python, веб-разработку. Помогает другим участникам с техническими вопросами."

2. **Облако тем**: Визуализация топ-10 тем участника

3. **Уровень экспертизы**: Индикатор на основе технической глубины сообщений

4. **Стиль общения**: "Технический", "Дружелюбный", "Формальный"

---

## 📊 Мониторинг

### Проверка размера таблицы

```sql
SELECT 
  pg_size_pretty(pg_total_relation_size('participant_messages')) as total_size,
  pg_size_pretty(pg_relation_size('participant_messages')) as table_size,
  pg_size_pretty(pg_total_relation_size('participant_messages') - pg_relation_size('participant_messages')) as indexes_size;
```

### Статистика по организациям

```sql
SELECT 
  o.name,
  COUNT(pm.id) as total_messages,
  COUNT(DISTINCT pm.participant_id) as active_participants,
  pg_size_pretty(SUM(LENGTH(pm.message_text::text))::bigint) as text_size,
  MIN(pm.sent_at) as oldest,
  MAX(pm.sent_at) as newest
FROM participant_messages pm
JOIN organizations o ON o.id = pm.org_id
GROUP BY o.id, o.name
ORDER BY total_messages DESC;
```

---

## ⚙️ Настройка retention policy

### Изменить период хранения

Отредактируйте функцию `cleanup_old_participant_messages`:

```sql
CREATE OR REPLACE FUNCTION cleanup_old_participant_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Измените INTERVAL на нужный (например, '60 days', '180 days')
  DELETE FROM participant_messages
  WHERE sent_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Cleaned up % messages older than 90 days', deleted_count;
  RETURN deleted_count;
END;
$$;
```

### Настроить автоматическую очистку (pg_cron)

Если у вас установлен pg_cron:

```sql
-- Запускать очистку каждую неделю
SELECT cron.schedule(
  'cleanup-old-messages',
  '0 3 * * 0',  -- Воскресенье в 3:00 утра
  'SELECT cleanup_old_participant_messages();'
);
```

Или через Vercel Cron:

```typescript
// app/api/cron/cleanup-messages/route.ts
export async function GET(request: Request) {
  // Проверка CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createAdminServer();
  const { data, error } = await supabase.rpc('cleanup_old_participant_messages');
  
  return Response.json({ 
    deleted: data,
    error: error?.message 
  });
}
```

---

## 🔐 Соображения по безопасности

1. **Приватность**: Сообщения доступны только участникам организации
2. **GDPR**: Функция `delete_participant_data()` для удаления по запросу
3. **Дубликаты**: Уникальный индекс предотвращает повторное сохранение
4. **Шифрование**: Используйте Supabase column-level encryption для чувствительных данных

---

## ⚠️ Важные замечания

1. **Размер БД**: Тексты сообщений могут занимать много места. Мониторьте размер таблицы.
2. **Retention**: По умолчанию 90 дней. Настройте под свои нужды.
3. **Индексы**: FTS индекс занимает дополнительное место, но обеспечивает быстрый поиск.
4. **Приватность**: Убедитесь, что участники знают о сохранении и анализе сообщений.

---

## 📈 Производительность

### Оптимизация запросов

1. **Используйте индексы**: Запросы по `participant_id`, `org_id`, `sent_at` уже оптимизированы
2. **Ограничивайте результаты**: Всегда используйте `LIMIT` для больших таблиц
3. **Партиционирование**: При > 10M записей рассмотрите партиционирование по месяцам

```sql
-- Пример партиционирования (для будущего)
CREATE TABLE participant_messages_2024_01 PARTITION OF participant_messages
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

---

## Статус

- ✅ Миграция создана: `db/migrations/38_participant_messages_table.sql`
- ✅ Код обработки: `lib/services/eventProcessingService.ts`
- ✅ RLS политики настроены
- ✅ Полнотекстовый поиск включен
- ✅ Утилитарные функции созданы
- ⏳ Требуется применение миграции
- 🔮 AI-анализ - в планах

---

## Следующие шаги

1. **Применить миграцию 38** в Supabase
2. **Протестировать сохранение** - отправить сообщения в группы
3. **Проверить логи** - убедиться в успешном сохранении
4. **Мониторинг размера** - следить за ростом таблицы
5. **Планировать AI-анализ** - интеграция с GPT-4/Claude для генерации инсайтов

Готово к использованию! 🚀

