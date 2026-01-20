# Channel Integration - Final Summary

## ✅ Что сделано:

### 1. **Webhook для каналов работает**
- ✅ `message_reaction_count` добавлен в `allowed_updates`
- ✅ RPC функция `update_post_reactions_count` исправлена (UUID вместо BIGINT)
- ✅ Посты каналов сохраняются в БД
- ✅ Linked chat добавлен (канал → группа обсуждений)

### 2. **База данных**
- ✅ Миграция 203 применена
- ✅ `telegram_channels` связан с `channel_posts`
- ✅ `linked_chat_id` обновлён для "тестовый канал1"

## ⚠️ Что осталось доделать:

### Задача 1: Проверить сохранение реакций (КРИТИЧНО)

**Проблема:** Все текущие реакции были поставлены ДО исправления RPC → `reactions_count = 0` в БД.

**Решение:** Поставьте новую реакцию на пост #11 в канале `@timtestchannel_1`, затем проверьте:

```bash
# 1. Логи
ssh selectel-orbo 'docker logs -f orbo_app | grep "message_reaction_count\|Updated reactions"'

# Ожидаемые логи:
📨 [WEBHOOK] Received update - update_types: ["message_reaction_count"]
📊 [WEBHOOK] Received message_reaction_count
✅ [WEBHOOK] Post reactions count updated

# 2. База данных
ssh selectel-orbo 'docker exec orbo_postgres psql -U postgres -d orbo -c "
SELECT tg_message_id, LEFT(text, 20) as text, reactions_count, views_count 
FROM channel_posts 
WHERE channel_id = (SELECT id FROM telegram_channels WHERE tg_chat_id = -1003592216264) 
ORDER BY posted_at DESC LIMIT 3;"'

# Ожидаемый результат: reactions_count > 0 для поста #11
```

---

### Задача 2: Каналы в меню + скрыть из "доступных групп"

#### **Подзадача 2.1: Удалить дубликат канала timITmentor**

Канал `timITmentor` (`-1002119930272`) добавлен и как канал, и как группа.

```sql
-- Удалить из org_telegram_groups (оставить только в org_telegram_channels)
DELETE FROM org_telegram_groups 
WHERE tg_chat_id = -1002119930272 
  AND org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1';
```

**Выполнить:**
```bash
ssh selectel-orbo 'docker exec orbo_postgres psql -U postgres -d orbo -c "
DELETE FROM org_telegram_groups 
WHERE tg_chat_id = -1002119930272 
  AND org_id = '"'"'a3e8bc8f-8171-472c-a955-2f7878aed6f1'"'"'::uuid;
SELECT '"'"'Duplicate removed'"'"' AS status;"'
```

#### **Подзадача 2.2: Обновить `app/app/[org]/layout.tsx`**

Добавить загрузку каналов рядом с группами:

```typescript
// После строки 153 (где загружаются telegramGroups)
// Добавить:

let telegramChannels: any[] = [];

const { data: channelsResult, error: channelsError } = await supabaseAdmin
  .rpc('get_org_channels', { p_org_id: org.id });

if (!channelsError && channelsResult) {
  telegramChannels = channelsResult;
  
  logger.debug({ 
    org_id: org.id,
    channels_count: telegramChannels.length
  }, 'Loaded telegram channels');
}

// Затем передать telegramChannels в CollapsibleSidebar (строка 189):
<CollapsibleSidebar
  orgId={org.id}
  orgName={org.name}
  orgLogoUrl={org.logo_url}
  role={role}
  telegramGroups={telegramGroups}
  telegramChannels={telegramChannels}  // ← Добавить
  userProfile={userProfile}
/>
```

#### **Подзадача 2.3: Обновить `components/navigation/collapsible-sidebar.tsx`**

Добавить отображение каналов с иконкой 📢:

```typescript
// 1. Добавить в props (строка 62):
interface CollapsibleSidebarProps {
  // ... existing props
  telegramChannels?: any[]  // ← Добавить
}

// 2. Добавить в параметры функции (строка 56):
export default function CollapsibleSidebar({
  orgId,
  orgName,
  orgLogoUrl,
  role,
  telegramGroups = [],
  telegramChannels = [],  // ← Добавить
  userProfile,
}: CollapsibleSidebarProps) {

// 3. Отобразить каналы после групп (после строки ~450, где рендерятся группы):

{/* Telegram Channels */}
{!collapsed && telegramChannels && telegramChannels.length > 0 && (
  <div className="mb-4">
    <div className="flex items-center justify-between px-4 py-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Каналы
      </h3>
    </div>
    <div className="space-y-1 px-2">
      {telegramChannels.map((channel: any) => (
        <Link
          key={channel.id}
          href={`/p/${orgId}/telegram/channels/${channel.id}`}
          className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors text-sm text-gray-700"
        >
          <span className="text-lg">📢</span>
          <span className="truncate">{channel.title}</span>
        </Link>
      ))}
    </div>
  </div>
)}
```

#### **Подзадача 2.4: Скрыть каналы из "доступных групп"**

Обновить `/api/telegram/groups/for-user` — исключить каналы:

```typescript
// В файле app/api/telegram/groups/for-user/route.ts
// Найти запрос к getChatAdministrators (строка ~200)
// Добавить фильтр для исключения каналов:

// Вместо:
const result = await telegram.getChatAdministrators(chatId);

// Используем:
// 1. Проверяем, является ли чат каналом
const chatInfo = await telegram.getChat(chatId);
const isChannel = chatInfo.type === 'channel';

// 2. Пропускаем каналы
if (isChannel) {
  continue; // Skip channels, only process groups
}

const result = await telegram.getChatAdministrators(chatId);
```

**Альтернативное решение (проще):**

В функции `getOrgTelegramGroups` или в endpoint `/api/telegram/groups/for-user`, добавить проверку:

```sql
-- Исключить чаты, которые есть в telegram_channels
WHERE tg_chat_id NOT IN (
  SELECT tg_chat_id FROM telegram_channels
)
```

---

### Задача 3: Исправить создание участников из группы обсуждений

**Проблема:** Сообщения из группы обсуждений (`-1003401096638`) приходят, но только 1 из 3 пользователей создался как участник.

**Диагностика:**

```bash
# 1. Проверить текущее состояние
ssh selectel-orbo 'docker exec orbo_postgres psql -U postgres -d orbo -c "
SELECT 
  ae.tg_user_id,
  COUNT(*) as events_count,
  MIN(ae.created_at) as first_event,
  MAX(ae.created_at) as last_event,
  p.id as participant_id
FROM activity_events ae
LEFT JOIN participants p ON ae.tg_user_id = p.tg_user_id AND p.org_id = '"'"'a3e8bc8f-8171-472c-a955-2f7878aed6f1'"'"'::uuid
WHERE ae.tg_chat_id = -1003401096638
GROUP BY ae.tg_user_id, p.id
ORDER BY events_count DESC;"'

# 2. Включить детальное логирование
# Добавить в app/api/telegram/webhook/route.ts (строка 280):
logger.info({ 
  chat_id: msgChatId, 
  org_id: orgId, 
  user_id: body.message?.from?.id,
  chat_type: body.message.chat.type
}, '🔄 Processing message from discussion group');

# 3. Написать новое сообщение в группе обсуждений
# 4. Проверить логи:
ssh selectel-orbo 'docker logs -f orbo_app | grep "Processing message from discussion\|processUpdate\|participant created"'
```

**Возможные причины:**
1. `eventProcessingService.processUpdate()` не создаёт участников для всех сообщений
2. Есть условие, которое фильтрует некоторых пользователей (например, боты, deleted accounts)
3. Ошибки внутри `processUpdate()` не логируются

**Решение:**
- Добавить детальное логирование в `eventProcessingService.processUpdate()`
- Проверить, что RPC `process_message_optimized` (если включена оптимизация) работает корректно
- Убедиться, что для группы обсуждений создаётся `org_telegram_groups` запись

---

## 📊 Текущее состояние БД:

```sql
-- Каналы
SELECT tg_chat_id, title, linked_chat_id, subscriber_count 
FROM telegram_channels 
WHERE tg_chat_id IN (-1002119930272, -1003592216264);

-- Группы обсуждений
SELECT tg_chat_id, title 
FROM telegram_groups 
WHERE tg_chat_id IN (-1003401096638);

-- Посты каналов
SELECT 
  cp.tg_message_id, 
  LEFT(cp.text, 30) as text, 
  cp.reactions_count, 
  cp.views_count,
  cp.posted_at
FROM channel_posts cp
WHERE cp.channel_id = (
  SELECT id FROM telegram_channels WHERE tg_chat_id = -1003592216264
)
ORDER BY cp.posted_at DESC LIMIT 5;

-- Участники из группы обсуждений
SELECT p.tg_user_id, p.first_name, p.username, COUNT(ae.id) as events
FROM participants p
LEFT JOIN activity_events ae ON p.tg_user_id = ae.tg_user_id
WHERE p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
  AND ae.tg_chat_id = -1003401096638
GROUP BY p.tg_user_id, p.first_name, p.username;
```

---

## 🔄 **Следующие шаги:**

1. ✅ **RPC функция исправлена** — протестировать сохранение реакций
2. 🔄 **Каналы в меню** — реализовать отображение
3. 🔄 **Скрыть каналы из групп** — добавить фильтр
4. ❓ **Участники из комментариев** — диагностировать и исправить

**После реализации всех задач:**
- Деплой на production
- Тестирование всех функций
- Обновление документации
