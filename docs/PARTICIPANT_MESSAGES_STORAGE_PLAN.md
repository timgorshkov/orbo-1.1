# План: Хранение текстов сообщений участников

## Цель
Сохранять тексты сообщений пользователей для последующего анализа и формирования автоматических описаний/подсказок в профилях участников.

## Архитектурное решение

### Вариант 1: Добавить колонку в activity_events ❌
**Минусы**:
- Смешивание аналитики и контента
- Сложнее управлять retention policy
- Увеличение размера основной таблицы аналитики

### Вариант 2: Хранить в meta JSONB ❌
**Минусы**:
- Нет полнотекстового поиска
- Сложнее индексировать
- Неудобно для анализа

### Вариант 3: Отдельная таблица participant_messages ✅ **ВЫБРАНО**
**Плюсы**:
- Четкое разделение аналитики и контента
- Гибкое управление хранением и удалением
- Можно применять разные RLS политики
- Поддержка полнотекстового поиска (PostgreSQL FTS)
- Легко добавить векторный поиск (pgvector) в будущем для AI-анализа

---

## Структура таблицы

```sql
CREATE TABLE participant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Связи
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  tg_user_id BIGINT NOT NULL,
  tg_chat_id BIGINT NOT NULL,
  
  -- Ссылка на событие в аналитике (опционально)
  activity_event_id INTEGER REFERENCES activity_events(id) ON DELETE SET NULL,
  
  -- Данные сообщения
  message_id BIGINT NOT NULL,
  message_text TEXT,
  message_thread_id BIGINT,
  reply_to_message_id BIGINT,
  
  -- Метаданные
  has_media BOOLEAN DEFAULT FALSE,
  media_type TEXT, -- 'photo', 'video', 'document', 'audio', 'voice', 'sticker'
  chars_count INTEGER,
  words_count INTEGER,
  
  -- Временные метки
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL, -- когда сообщение было отправлено
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- когда записано в БД
  
  -- Для будущего AI-анализа
  analyzed_at TIMESTAMP WITH TIME ZONE,
  analysis_data JSONB, -- результаты анализа: тональность, ключевые слова, темы и т.д.
  
  -- Полнотекстовый поиск
  message_tsv TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('russian', COALESCE(message_text, ''))
  ) STORED
);

-- Индексы для производительности
CREATE INDEX idx_participant_messages_org ON participant_messages(org_id, sent_at DESC);
CREATE INDEX idx_participant_messages_participant ON participant_messages(participant_id, sent_at DESC);
CREATE INDEX idx_participant_messages_chat ON participant_messages(tg_chat_id, sent_at DESC);
CREATE INDEX idx_participant_messages_user ON participant_messages(tg_user_id, sent_at DESC);
CREATE INDEX idx_participant_messages_tsv ON participant_messages USING GIN(message_tsv); -- полнотекстовый поиск

-- Уникальность по message_id в рамках чата (предотвращение дублей)
CREATE UNIQUE INDEX idx_participant_messages_unique ON participant_messages(tg_chat_id, message_id);

COMMENT ON TABLE participant_messages IS 'Хранение текстов сообщений участников для анализа и формирования профилей';
COMMENT ON COLUMN participant_messages.message_tsv IS 'Автоматически генерируемый вектор для полнотекстового поиска';
COMMENT ON COLUMN participant_messages.analysis_data IS 'JSON с результатами AI-анализа: sentiment, topics, keywords, etc';
```

---

## Retention Policy (Политика хранения)

### Вариант 1: Хранить все сообщения
**Плюсы**: Полная история  
**Минусы**: Большой объем данных, затраты на хранение

### Вариант 2: Хранить последние N дней (например, 90) ✅ **РЕКОМЕНДУЕТСЯ**
**Плюсы**: Баланс между анализом и объемом  
**Минусы**: Теряется история

### Вариант 3: Хранить последние N сообщений на участника
**Плюсы**: Равномерное распределение  
**Минусы**: Сложнее реализовать

### Реализация автоматической очистки:

```sql
-- Функция для автоматической очистки старых сообщений
CREATE OR REPLACE FUNCTION cleanup_old_messages()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM participant_messages
  WHERE sent_at < NOW() - INTERVAL '90 days';
  
  RAISE NOTICE 'Cleaned up messages older than 90 days';
END;
$$;

-- Можно вызывать через cron или pg_cron extension
-- Или создать триггер на вставку (но это может замедлить INSERT)
```

---

## RLS Политики (Row Level Security)

```sql
-- Включаем RLS
ALTER TABLE participant_messages ENABLE ROW LEVEL SECURITY;

-- Политика для чтения: участники организации могут читать сообщения своей организации
CREATE POLICY participant_messages_select_policy
  ON participant_messages
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id 
      FROM memberships 
      WHERE org_id = participant_messages.org_id
    )
  );

-- Политика для вставки: разрешить всем (сервисная роль через webhook)
CREATE POLICY participant_messages_insert_policy
  ON participant_messages
  FOR INSERT
  WITH CHECK (true);

-- Политика для обновления: только владельцы и админы организации
CREATE POLICY participant_messages_update_policy
  ON participant_messages
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT user_id 
      FROM memberships 
      WHERE org_id = participant_messages.org_id 
        AND role IN ('owner', 'admin')
    )
  );

-- Политика для удаления: только владельцы организации
CREATE POLICY participant_messages_delete_policy
  ON participant_messages
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT user_id 
      FROM memberships 
      WHERE org_id = participant_messages.org_id 
        AND role = 'owner'
    )
  );
```

---

## Интеграция с EventProcessingService

### Изменения в `lib/services/eventProcessingService.ts`:

```typescript
private async processUserMessage(message: TelegramMessage, orgId: string): Promise<void> {
  // ... существующий код ...
  
  // После успешной вставки в activity_events
  // Сохраняем текст сообщения (если есть)
  if (message.text && message.text.trim().length > 0) {
    await this.saveMessageText(message, orgId, participantId);
  }
}

private async saveMessageText(
  message: TelegramMessage, 
  orgId: string, 
  participantId: string | null
): Promise<void> {
  try {
    const messageText = message.text?.trim() || null;
    if (!messageText) return;

    const mediaType = this.detectMediaType(message);
    const wordsCount = messageText.split(/\s+/).filter(w => w.length > 0).length;

    const { error } = await this.supabase
      .from('participant_messages')
      .insert({
        org_id: orgId,
        participant_id: participantId,
        tg_user_id: message.from.id,
        tg_chat_id: message.chat.id,
        message_id: message.message_id,
        message_text: messageText,
        message_thread_id: (message as any)?.message_thread_id || null,
        reply_to_message_id: message.reply_to_message?.message_id || null,
        has_media: !!(message.photo || message.video || message.document || message.audio || message.voice),
        media_type: mediaType,
        chars_count: messageText.length,
        words_count: wordsCount,
        sent_at: new Date(message.date * 1000).toISOString()
      });

    if (error) {
      console.error('[EventProcessing] Error saving message text:', error);
    } else {
      console.log('[EventProcessing] ✅ Message text saved successfully');
    }
  } catch (error) {
    console.error('[EventProcessing] Exception saving message text:', error);
  }
}

private detectMediaType(message: TelegramMessage): string | null {
  if (message.photo) return 'photo';
  if (message.video) return 'video';
  if (message.document) return 'document';
  if (message.audio) return 'audio';
  if (message.voice) return 'voice';
  if ((message as any).sticker) return 'sticker';
  return null;
}
```

---

## Будущие возможности использования

### 1. Автоматические описания профилей
```sql
-- Получить последние 50 сообщений участника для анализа
SELECT message_text, sent_at
FROM participant_messages
WHERE participant_id = 'xxx'
ORDER BY sent_at DESC
LIMIT 50;
```
Можно отправить в AI (GPT-4, Claude) для генерации краткого описания стиля общения, интересов, экспертизы.

### 2. Полнотекстовый поиск
```sql
-- Найти участников, которые писали о конкретной теме
SELECT DISTINCT p.id, p.username, p.full_name, COUNT(*) as mentions
FROM participant_messages pm
JOIN participants p ON p.id = pm.participant_id
WHERE pm.message_tsv @@ to_tsquery('russian', 'python | django')
  AND pm.org_id = 'xxx'
GROUP BY p.id, p.username, p.full_name
ORDER BY mentions DESC;
```

### 3. Анализ тональности и тем
```javascript
// Периодический cron job для анализа
async function analyzeRecentMessages() {
  const unanalyzedMessages = await supabase
    .from('participant_messages')
    .select('id, message_text, participant_id')
    .is('analyzed_at', null)
    .limit(100);

  for (const msg of unanalyzedMessages) {
    const analysis = await analyzeWithAI(msg.message_text); // GPT-4, Claude, etc
    
    await supabase
      .from('participant_messages')
      .update({
        analyzed_at: new Date().toISOString(),
        analysis_data: {
          sentiment: analysis.sentiment, // 'positive', 'neutral', 'negative'
          topics: analysis.topics, // ['python', 'web-development']
          keywords: analysis.keywords,
          expertise_signals: analysis.expertise // признаки экспертизы
        }
      })
      .eq('id', msg.id);
  }
}
```

### 4. "Часто обсуждает" в профиле
```sql
-- Топ тем участника на основе анализа
SELECT 
  topic,
  COUNT(*) as frequency
FROM participant_messages pm,
  LATERAL jsonb_array_elements_text(pm.analysis_data->'topics') AS topic
WHERE pm.participant_id = 'xxx'
  AND pm.analyzed_at IS NOT NULL
GROUP BY topic
ORDER BY frequency DESC
LIMIT 5;
```

### 5. Умный поиск по контенту
```sql
-- API endpoint: /api/participants/search
-- Найти участников с экспертизой в определенной области
SELECT DISTINCT
  p.id,
  p.username,
  p.full_name,
  COUNT(*) as relevant_messages,
  AVG((pm.analysis_data->>'expertise_score')::numeric) as avg_expertise
FROM participants p
JOIN participant_messages pm ON pm.participant_id = p.id
WHERE pm.org_id = 'xxx'
  AND pm.message_tsv @@ to_tsquery('russian', 'машинное & обучение')
  AND pm.analysis_data->>'sentiment' != 'negative'
GROUP BY p.id, p.username, p.full_name
HAVING COUNT(*) >= 3
ORDER BY avg_expertise DESC, relevant_messages DESC;
```

---

## Конфиденциальность и GDPR

### Важные соображения:
1. **Право на забвение**: Участник может запросить удаление всех своих сообщений
2. **Прозрачность**: Уведомлять участников, что их сообщения анализируются
3. **Минимизация данных**: Хранить только то, что необходимо для заявленных целей
4. **Безопасность**: RLS политики + шифрование на уровне БД

### Функция для удаления данных участника:
```sql
CREATE OR REPLACE FUNCTION delete_participant_data(p_participant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Удаляем все сообщения участника
  DELETE FROM participant_messages WHERE participant_id = p_participant_id;
  
  -- Анонимизируем события активности (не удаляем для статистики)
  UPDATE activity_events 
  SET participant_id = NULL, 
      tg_user_id = NULL,
      meta = jsonb_set(meta, '{user}', '{"anonymized": true}'::jsonb)
  WHERE participant_id = p_participant_id;
  
  RAISE NOTICE 'Participant data deleted/anonymized for ID: %', p_participant_id;
END;
$$;
```

---

## Миграция и развертывание

### Шаги:
1. ✅ Создать миграцию `38_participant_messages_table.sql`
2. ✅ Обновить `eventProcessingService.ts` для сохранения текста
3. ⏳ Применить миграцию в Supabase
4. ⏳ Протестировать сохранение сообщений
5. 🔮 В будущем: Добавить API для анализа и отображения в UI

---

## Оценка объема данных

**Предположения**:
- Средний размер сообщения: 200 символов = ~200 байт
- 100 активных участников
- 10 сообщений/участник/день
- Retention: 90 дней

**Расчет**:
```
100 участников × 10 сообщений × 90 дней = 90,000 сообщений
90,000 × 200 байт = 18 МБ (только текст)
+ индексы и метаданные ≈ 50 МБ итого
```

Для большинства организаций это очень небольшой объем. При масштабировании (1000+ участников) можно:
- Сократить retention до 30-60 дней
- Использовать партиционирование таблицы по месяцам
- Архивировать старые данные в S3/холодное хранилище

---

## Следующие шаги после реализации

1. **Интеграция с UI профилей участников**
   - Показывать "облако тем" на основе анализа
   - "Последние обсуждения"
   - Автогенерируемое описание стиля общения

2. **Умный поиск участников**
   - Поиск по экспертизе
   - Поиск похожих участников (векторный поиск)

3. **AI-ассистент для организации**
   - "Кто у нас разбирается в Python?"
   - "Найди участников, интересующихся UX"
   - "Кто активно помогал новичкам?"

4. **Аналитика контента**
   - Самые обсуждаемые темы в организации
   - Тренды интересов во времени
   - Тональность общения в группах

