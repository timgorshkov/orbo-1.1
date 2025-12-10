# Архитектура поддержки нескольких мессенджеров в Orbo

## Обзор

Orbo расширяется для поддержки нескольких мессенджеров:
1. **Telegram** — полная интеграция (текущий функционал)
2. **WhatsApp** — импорт истории групп (первый этап)
3. **MAX** — полная интеграция (в будущем, ~2 месяца)

---

## 1. Изменения в интерфейсе

### 1.1 Левое меню (Sidebar)
- **Было:** "Telegram группы"
- **Стало:** "Группы"
- Список групп показывает все группы из всех мессенджеров
- Иконки групп различаются по типу мессенджера

### 1.2 Настройки мессенджеров (иконка шестерёнки)
Переход на табы по мессенджерам:

```
┌────────────────────────────────────────────────────────────┐
│  Telegram  │  WhatsApp  │  Max                             │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  [Контент конкретного мессенджера]                        │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Вкладка Telegram:**
- Подключение групп (текущий функционал)
- Настройка аккаунта
- Список подключенных групп

**Вкладка WhatsApp:**
- История импортов
- Кнопка "Новый импорт"
- Статистика импортированных участников и сообщений

**Вкладка Max:**
- Заглушка "Скоро" (до реализации)
- В будущем: аналогично Telegram

### 1.3 Удаляемые элементы
- Вкладка "Аналитика" в настройках Telegram (не работает)

---

## 2. Изменения в базе данных

### 2.1 Новый ENUM для типа мессенджера

```sql
CREATE TYPE messenger_type AS ENUM ('telegram', 'whatsapp', 'max');
```

### 2.2 Изменение таблицы `activity_events`

Добавляем поле для идентификации источника:

```sql
ALTER TABLE activity_events 
ADD COLUMN messenger messenger_type DEFAULT 'telegram';

-- Индекс для фильтрации по мессенджеру
CREATE INDEX idx_activity_events_messenger ON activity_events(messenger);
```

### 2.3 Новая таблица `whatsapp_imports`

Хранит историю импортов:

```sql
CREATE TABLE whatsapp_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  
  -- Метаданные импорта
  file_name TEXT,
  group_name TEXT,              -- Название группы из файла экспорта
  import_status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  
  -- Статистика
  messages_total INT DEFAULT 0,
  messages_imported INT DEFAULT 0,
  messages_duplicates INT DEFAULT 0,
  participants_total INT DEFAULT 0,
  participants_new INT DEFAULT 0,
  participants_existing INT DEFAULT 0,
  
  -- Даты
  date_range_start TIMESTAMP,   -- Самое старое сообщение
  date_range_end TIMESTAMP,     -- Самое новое сообщение
  
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);
```

### 2.4 Изменение таблицы `participants`

Участники уже имеют поле `phone`. Для связи с WhatsApp добавляем:

```sql
-- Нормализованный номер телефона для поиска (без +, пробелов, тире)
ALTER TABLE participants 
ADD COLUMN phone_normalized TEXT;

-- Индекс для быстрого поиска по телефону
CREATE INDEX idx_participants_phone_normalized ON participants(org_id, phone_normalized);

-- Функция нормализации телефона
CREATE OR REPLACE FUNCTION normalize_phone(phone TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN regexp_replace(phone, '[^0-9]', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Триггер для автозаполнения phone_normalized
CREATE OR REPLACE FUNCTION update_phone_normalized()
RETURNS TRIGGER AS $$
BEGIN
  NEW.phone_normalized = normalize_phone(NEW.phone);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_participants_phone_normalized
BEFORE INSERT OR UPDATE ON participants
FOR EACH ROW
WHEN (NEW.phone IS NOT NULL)
EXECUTE FUNCTION update_phone_normalized();
```

### 2.5 Подготовка к MAX (в будущем)

Таблица `max_groups` (аналог `telegram_groups`):

```sql
-- Создаётся позже, при реализации MAX
CREATE TABLE max_groups (
  id SERIAL PRIMARY KEY,
  max_chat_id BIGINT UNIQUE NOT NULL,
  title TEXT,
  bot_status TEXT DEFAULT 'pending',
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE org_max_groups (
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  max_chat_id BIGINT NOT NULL REFERENCES max_groups(max_chat_id) ON DELETE CASCADE,
  PRIMARY KEY (org_id, max_chat_id)
);
```

---

## 3. Структура файлов

### 3.1 Новая структура папок

```
app/p/[org]/
├── messengers/                    # Новая папка для настроек мессенджеров
│   ├── page.tsx                   # Редирект на telegram
│   ├── layout.tsx                 # Общий layout с табами
│   ├── telegram/
│   │   ├── page.tsx              # Настройки Telegram (перенос из telegram/)
│   │   ├── account/page.tsx
│   │   └── available-groups/page.tsx
│   ├── whatsapp/
│   │   ├── page.tsx              # История импортов
│   │   ├── import/page.tsx       # Форма импорта
│   │   └── imports/[id]/page.tsx # Детали импорта
│   └── max/
│       └── page.tsx              # Заглушка "Скоро"
│
├── groups/                        # Переименовано из telegram/groups
│   └── [id]/page.tsx             # Страница группы (универсальная)
```

### 3.2 API endpoints

```
app/api/
├── whatsapp/
│   ├── import/route.ts           # POST: загрузка файла и запуск импорта
│   ├── imports/route.ts          # GET: список импортов
│   └── imports/[id]/route.ts     # GET: статус импорта
```

---

## 4. Функционал WhatsApp импорта

### 4.1 Формат экспорта WhatsApp

WhatsApp позволяет экспортировать чат в .txt файл:

```
[05.12.2024, 10:30:45] +7 999 123-45-67: Привет всем!
[05.12.2024, 10:31:02] +7 916 765-43-21: Привет! Как дела?
[05.12.2024, 10:32:15] +7 999 123-45-67: Всё хорошо, спасибо
[05.12.2024, 10:33:00] +7 916 765-43-21: <Медиа опущены>
```

### 4.2 Алгоритм импорта

```typescript
interface WhatsAppMessage {
  timestamp: Date;
  phone: string;
  phoneNormalized: string;
  text: string;
  isMedia: boolean;
}

async function importWhatsAppHistory(
  orgId: string,
  fileContent: string,
  userId: string
): Promise<ImportResult> {
  // 1. Парсинг файла
  const messages = parseWhatsAppExport(fileContent);
  
  // 2. Извлечение уникальных номеров телефонов
  const uniquePhones = new Set(messages.map(m => m.phoneNormalized));
  
  // 3. Поиск/создание участников
  for (const phone of uniquePhones) {
    // Проверяем существование участника по phone_normalized
    let participant = await findParticipantByPhone(orgId, phone);
    
    if (!participant) {
      // Создаём нового участника
      participant = await createParticipant({
        org_id: orgId,
        phone: formatPhone(phone),
        phone_normalized: phone,
        full_name: `WhatsApp +${phone}`,
        source: 'whatsapp_import'
      });
    }
  }
  
  // 4. Импорт сообщений с дедупликацией
  for (const message of messages) {
    const participant = await findParticipantByPhone(orgId, message.phoneNormalized);
    
    // Создаём хэш для дедупликации
    const messageHash = createMessageHash(
      message.timestamp,
      message.phoneNormalized,
      message.text
    );
    
    // Проверяем дубликат
    const exists = await checkMessageExists(orgId, messageHash);
    if (exists) continue;
    
    // Создаём activity_event
    await createActivityEvent({
      org_id: orgId,
      participant_id: participant.id,
      event_type: 'message',
      messenger: 'whatsapp',
      message_hash: messageHash,
      meta: {
        text: message.text,
        phone: message.phone,
        is_media: message.isMedia
      },
      created_at: message.timestamp
    });
  }
  
  return {
    messagesImported: ...,
    participantsCreated: ...,
    duplicatesSkipped: ...
  };
}
```

### 4.3 UI формы импорта

```
┌─────────────────────────────────────────────────────────────────┐
│ Импорт истории WhatsApp                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📱 Как экспортировать историю чата:                           │
│                                                                 │
│  1. Откройте групповой чат в WhatsApp                          │
│  2. Нажмите ⋮ → "Ещё" → "Экспорт чата"                         │
│  3. Выберите "Без медиа" для быстрого экспорта                 │
│  4. Сохраните файл .txt                                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │  📄 Перетащите файл сюда или нажмите для выбора        │   │
│  │     Поддерживаемый формат: .txt                        │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [ Импортировать ]                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 История импортов

```
┌─────────────────────────────────────────────────────────────────┐
│ История импортов WhatsApp                              [+ Новый] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ Рабочий чат команды           5 дек 2024, 14:30            │
│     156 сообщений • 12 участников                              │
│                                                                 │
│  ✅ Клуб по интересам             3 дек 2024, 10:15            │
│     423 сообщения • 28 участников                              │
│                                                                 │
│  ⚠️ Семейный чат                  1 дек 2024, 09:00            │
│     Импорт не завершён: 45 дубликатов пропущено               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Дедупликация

### 5.1 Дедупликация участников

По номеру телефона (phone_normalized):
- При импорте проверяем существование участника в организации
- Если есть — связываем сообщения с существующим
- Если нет — создаём нового

### 5.2 Дедупликация сообщений

Хэш сообщения = SHA256(timestamp + phone_normalized + text)

```sql
ALTER TABLE activity_events 
ADD COLUMN message_hash TEXT;

CREATE UNIQUE INDEX idx_activity_events_message_hash 
ON activity_events(org_id, message_hash) 
WHERE message_hash IS NOT NULL;
```

---

## 6. План реализации

### Этап 1: Подготовка UI (2-3 часа)
1. Переименовать "Telegram группы" → "Группы" в sidebar
2. Создать структуру табов в настройках мессенджеров
3. Убрать вкладку "Аналитика"
4. Добавить заглушки для WhatsApp и Max

### Этап 2: Миграции БД (1-2 часа)
1. Создать ENUM messenger_type
2. Добавить поле messenger в activity_events
3. Создать таблицу whatsapp_imports
4. Добавить phone_normalized в participants
5. Добавить message_hash в activity_events

### Этап 3: Импорт WhatsApp (4-6 часов)
1. Парсер формата экспорта WhatsApp
2. API endpoint для загрузки файла
3. Логика создания/поиска участников
4. Логика импорта сообщений с дедупликацией
5. UI формы импорта
6. UI истории импортов

### Этап 4: Тестирование (2-3 часа)
1. Тестирование парсера на разных форматах
2. Тестирование дедупликации
3. Тестирование UI

**Общая оценка: 10-14 часов**

---

## 7. Будущее: Интеграция MAX

MAX ([dev.max.ru/docs](https://dev.max.ru/docs)) — российский мессенджер с API для ботов.

### Особенности MAX:
- Bot API аналогичен Telegram
- Webhook для получения сообщений
- Каналы и группы

### План интеграции (через ~2 месяца):
1. Создание MAX-бота на платформе
2. Таблицы max_groups, org_max_groups
3. Webhook handler для MAX
4. Импорт истории через API
5. Публикация событий в MAX группы

---

## 8. Файлы для изменения (Этап 1)

### Sidebar:
- `components/telegram-groups-nav.tsx` → `components/groups-nav.tsx`

### Настройки:
- `app/p/[org]/telegram/tabs-layout.tsx` — удалить вкладку "Аналитика", добавить структуру для мессенджеров
- Создать `app/p/[org]/messengers/` структуру

### Левое меню:
- `components/app-shell.tsx` — обновить название секции
- `components/navigation/collapsible-sidebar.tsx` — обновить label

