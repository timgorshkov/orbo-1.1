# Исправление автоматического добавления Telegram групп

## Проблема

Ранее в системе была следующая проблема:

1. **Автоматическое добавление групп**: При получении webhook от Telegram, группы автоматически привязывались к первой организации в системе
2. **Невозможность выбора организации**: Пользователь, имеющий несколько организаций, не мог выбрать, к какой организации добавить группу
3. **Группы не появлялись в "Доступных"**: Из-за автоматической привязки, группы сразу считались "существующими", а не "доступными"
4. **Обработка событий для всех групп**: События (сообщения, активность) обрабатывались для ВСЕХ групп, даже не добавленных в организацию

## Корневая причина

В файле `app/api/telegram/webhook/route.ts` на строках 123-141 при создании новой группы автоматически устанавливался `org_id`:

```typescript
// ❌ НЕПРАВИЛЬНО
const { data: orgs } = await supabaseServiceRole
  .from('organizations')
  .select('id')
  .limit(1);

if (orgs && orgs.length > 0) {
  await supabaseServiceRole
    .from('telegram_groups')
    .insert({
      org_id: orgs[0].id,  // Автоматическая привязка к первой организации!
      tg_chat_id: String(chatId),
      title: title,
      bot_status: 'connected',
      analytics_enabled: true,
      last_sync_at: new Date().toISOString()
    });
}
```

## Решение

### 1. Исправление создания групп в webhook

**Файл:** `app/api/telegram/webhook/route.ts`

Группы теперь создаются БЕЗ привязки к организации:

```typescript
// ✅ ПРАВИЛЬНО
await supabaseServiceRole
  .from('telegram_groups')
  .insert({
    org_id: null, // НЕ привязываем к организации автоматически!
    tg_chat_id: String(chatId),
    title: title,
    bot_status: 'connected',
    analytics_enabled: false, // Аналитика будет включена при добавлении в организацию
    last_sync_at: new Date().toISOString()
  });
```

### 2. Проверка привязки перед обработкой событий

**Файл:** `app/api/telegram/webhook/route.ts` (строки 148-172)

События теперь обрабатываются ТОЛЬКО для групп, добавленных в организацию:

```typescript
// Проверяем, добавлена ли группа в какую-либо организацию
const { data: orgMapping } = await supabaseServiceRole
  .from('org_telegram_groups')
  .select('org_id')
  .filter('tg_chat_id::text', 'eq', String(chatId))
  .limit(1);

if (orgMapping && orgMapping.length > 0) {
  // ✅ Группа добавлена в организацию - обрабатываем события
  const eventProcessingService = createEventProcessingService();
  eventProcessingService.setSupabaseClient(supabaseServiceRole);
  await eventProcessingService.processUpdate(body);
} else {
  // ⏭️ Группа НЕ добавлена - пропускаем обработку
  console.log('Group is NOT assigned to any organization, skipping event processing');
}
```

### 3. Упрощение UI "Доступные группы"

**Файл:** `app/app/[org]/telegram/available-groups/page.tsx`

Убран зелёный блок "Все ваши группы уже добавлены", который вводил в заблуждение.

## Правильная логика работы

### Жизненный цикл группы

1. **Бот добавлен в группу** → Пользователь добавляет `@orbo_community_bot` в свою Telegram группу с правами администратора

2. **Первое сообщение** → При отправке первого сообщения в группе:
   - Webhook создает запись в `telegram_groups` БЕЗ `org_id`
   - События НЕ обрабатываются (нет записи в `org_telegram_groups`)
   - Система записывает права администратора в `telegram_group_admins`

3. **Обновление прав** → Пользователь нажимает "Обновить права администраторов" на странице `/app/[org]/telegram/account`:
   - Система сканирует Telegram API
   - Обновляет `telegram_group_admins`

4. **Доступные группы** → Пользователь переходит на страницу `/app/[org]/telegram/available-groups`:
   - Видит список групп, где он администратор
   - Группы с `org_id = null` и записью в `telegram_group_admins` попадают в "Доступные"
   - Группы с записью в `org_telegram_groups` считаются "существующими" (уже добавленными)

5. **Добавление в организацию** → Пользователь нажимает "Добавить в организацию":
   - Создается запись в `org_telegram_groups`
   - Копируются участники в новую организацию
   - Включается аналитика (`analytics_enabled = true`)
   - Группа появляется в левом меню

6. **Обработка событий** → После добавления:
   - Webhook обрабатывает сообщения
   - Создаются участники (`participants`)
   - Записывается активность (`activity_events`)
   - Обновляется аналитика

7. **Удаление из организации** → Владелец может удалить группу:
   - Удаляется запись из `org_telegram_groups`
   - Обнуляется `org_id` в `telegram_groups` (если группа не используется другими организациями)
   - Группа снова появляется в "Доступных группах"

### Поддержка нескольких организаций

Один пользователь может:
- Создать несколько организаций (например, для разных проектов/клубов)
- Видеть все группы, где он администратор, в "Доступных группах"
- Добавить разные группы в разные организации
- Добавить одну группу в несколько организаций (через `org_telegram_groups`)

## Миграция существующих данных

Для пользователей, у которых группы уже были автоматически добавлены, необходимо выполнить скрипт:

```bash
# В Supabase SQL Editor
db/RESET_TELEGRAM_GROUPS_ASSIGNMENT.sql
```

Этот скрипт:
1. Удаляет все записи из `org_telegram_groups`
2. Обнуляет `org_id` в `telegram_groups`
3. Отключает аналитику для всех групп
4. Очищает участников и события (так как они были созданы для неправильно привязанных групп)

После выполнения скрипта:
- Все группы появятся в "Доступных группах"
- Пользователь сможет вручную добавить их в нужные организации
- После добавления начнется сбор новой статистики

## Тестирование

### Сценарий 1: Новая группа

1. Создайте новую Telegram группу
2. Добавьте `@orbo_community_bot` с правами администратора
3. Отправьте любое сообщение в группе
4. Проверьте логи Vercel - должно быть:
   ```
   [Webhook] Step 1c: Creating new group WITHOUT org_id
   [Webhook] Step 2b: ⏭️  Group is NOT assigned to any organization, skipping event processing
   ```
5. Зайдите в `/app/[org]/telegram/account` и нажмите "Обновить права администраторов"
6. Перейдите в `/app/[org]/telegram/available-groups` - группа должна появиться в списке

### Сценарий 2: Добавление в организацию

1. На странице "Доступные группы" нажмите "Добавить в организацию"
2. Группа должна исчезнуть из "Доступных"
3. Группа должна появиться в левом меню организации
4. При отправке сообщения в группе, оно должно обрабатываться:
   ```
   [Webhook] Step 2b: ✅ Group is assigned to organization, processing events
   ```

### Сценарий 3: Удаление из организации

1. Перейдите в настройки группы
2. Нажмите "Удалить группу из организации"
3. Группа должна исчезнуть из левого меню
4. Группа должна снова появиться в "Доступных группах"

### Сценарий 4: Несколько организаций

1. Создайте вторую организацию
2. Перейдите в её раздел Telegram
3. На странице "Доступные группы" должны быть видны те же группы, что и в первой организации
4. Добавьте группу во вторую организацию
5. Группа должна появиться в левом меню второй организации
6. Группа должна остаться в первой организации (если была там добавлена)

## Файлы, затронутые изменениями

1. `app/api/telegram/webhook/route.ts` - исправление создания групп и проверка привязки
2. `app/app/[org]/telegram/available-groups/page.tsx` - упрощение UI
3. `db/RESET_TELEGRAM_GROUPS_ASSIGNMENT.sql` - скрипт для миграции существующих данных
4. `docs/TELEGRAM_GROUPS_AUTO_ASSIGNMENT_FIX.md` - эта документация

## Проверка корректности

### SQL-запросы для проверки

```sql
-- 1. Проверка, что новые группы создаются без org_id
SELECT id, tg_chat_id, title, org_id, analytics_enabled, created_at
FROM telegram_groups
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
-- Ожидаем: org_id = NULL, analytics_enabled = false

-- 2. Проверка, что у групп есть записи в telegram_group_admins
SELECT tga.*, tg.title
FROM telegram_group_admins tga
JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
WHERE tga.is_admin = true
ORDER BY tga.updated_at DESC;

-- 3. Проверка маппинга групп к организациям
SELECT otg.*, tg.title, o.name as org_name
FROM org_telegram_groups otg
JOIN telegram_groups tg ON tg.tg_chat_id = otg.tg_chat_id
JOIN organizations o ON o.id = otg.org_id
ORDER BY otg.created_at DESC;

-- 4. Проверка, что события обрабатываются только для добавленных групп
SELECT 
  ae.tg_chat_id,
  tg.title,
  tg.org_id as legacy_org_id,
  otg.org_id as mapped_org_id,
  COUNT(*) as events_count,
  MAX(ae.event_time) as last_event
FROM activity_events ae
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = ae.tg_chat_id
LEFT JOIN org_telegram_groups otg ON otg.tg_chat_id = ae.tg_chat_id
GROUP BY ae.tg_chat_id, tg.title, tg.org_id, otg.org_id
ORDER BY last_event DESC;
-- Ожидаем: события только для групп с mapped_org_id IS NOT NULL
```

## Известные ограничения

1. **Discovery групп**: Telegram Bot API не позволяет боту узнать, в какие группы он добавлен, пока в них не будет активности. Поэтому группы появляются в системе только после отправки первого сообщения.

2. **Синхронизация прав**: Права администратора обновляются при явном запросе через UI или при обработке событий в группе. Автоматическая периодическая синхронизация не реализована.

3. **История событий**: При удалении группы из организации, её события и участники остаются в базе данных. Это сделано намеренно для сохранения истории.

## Дальнейшие улучшения

Возможные улучшения в будущем:

1. **Автоматическая синхронизация прав**: Периодическое сканирование Telegram API для обновления прав администратора
2. **Webhook Setup Check**: Автоматическая проверка и настройка webhook при старте приложения (уже реализовано через `/api/telegram/admin/setup-webhooks`)
3. **Batch Discovery**: Возможность вручную запустить сканирование всех групп через Telegram API
4. **Архивирование**: Вместо полного удаления, возможность архивировать группы с сохранением данных

