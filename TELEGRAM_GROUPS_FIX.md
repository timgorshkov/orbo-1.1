# Исправление загрузки новых Telegram-групп

## Проблема
Новые Telegram-группы (где бот добавлен с админскими правами) не отображались в списке доступных для подключения к организации.

## Причины
1. **Пустая таблица `user_group_admin_status`** - код пытался использовать эту таблицу, но она была пустой
2. **Ограниченное сканирование** - API `update-admin-rights` проверял права только для уже известных групп
3. **Фильтрация по `telegram_groups`** - права проверялись только для групп, уже существующих в БД

## Решение

### 1. Откат к `telegram_group_admins`
**Файл:** `app/api/telegram/groups/for-user/route.ts`
- Убрана зависимость от пустой `user_group_admin_status`
- Возврат к проверенной `telegram_group_admins`
- Удален fallback-механизм

### 2. Сканирование всех групп из активности
**Файл:** `app/api/telegram/groups/update-admin-rights/route.ts`
```typescript
// ✅ НОВОЕ: Добавляем ВСЕ группы, где есть активность бота (включая новые группы)
try {
  console.log('Scanning telegram_activity_events for new groups...');
  const { data: activityGroups } = await supabaseService
    .from('telegram_activity_events')
    .select('tg_chat_id')
    .not('tg_chat_id', 'is', null)
    .order('event_time', { ascending: false })
    .limit(1000); // Последние 1000 событий
  
  const uniqueChatIds = new Set<string>();
  activityGroups?.forEach(record => {
    if (record?.tg_chat_id !== undefined && record?.tg_chat_id !== null) {
      uniqueChatIds.add(String(record.tg_chat_id));
    }
  });
  
  console.log(`Found ${uniqueChatIds.size} unique groups in activity events`);
  
  // Добавляем в кандидаты
  uniqueChatIds.forEach(chatId => candidateChatIds.add(chatId));
} catch (activityError) {
  console.error('Error scanning activity events:', activityError);
  // Не критично, продолжаем
}
```

### 3. Прямая проверка всех chat_id
**Файл:** `app/api/telegram/groups/update-admin-rights/route.ts`
- Убрана зависимость от `fetchGroupsBatch` и `telegram_groups`
- Теперь API проверяет права **напрямую для всех chat_id** из `candidateChatIds`
- Даже если группы нет в БД, права будут проверены и сохранены в `telegram_group_admins`

```typescript
// ✅ Проверяем ВСЕ chat_id напрямую, даже если группы нет в telegram_groups
for (const chatIdStr of normalizedChatIds) {
  const chatId = Number(chatIdStr);
  
  try {
    const adminInfo = await telegramService.getChatMember(chatId, activeAccount.telegram_user_id);
    // ... сохранение прав в telegram_group_admins
  } catch (groupError: any) {
    warnings.push(`Error processing chat ${chatId}: ${groupError?.message || 'Unknown error'}`);
  }
}
```

### 4. Упрощение select-groups
**Файл:** `app/app/[org]/telegram/select-groups/page.tsx`
- Страница теперь просто перенаправляет на `available-groups`
- Убрана зависимость от `user_group_admin_status`

### 5. Исправление membership creation
**Файл:** `app/api/auth/telegram/route.ts`
- Изменен `insert()` на `upsert()` для правильной обработки конфликтов при создании membership

## Как это работает теперь

1. **Пользователь открывает страницу "Доступные группы"**
   - Вызывается `update-admin-rights`

2. **API `update-admin-rights` сканирует:**
   - Все группы из `telegram_group_admins` (старые записи)
   - Все группы из `org_telegram_groups` (связанные с организациями)
   - **✅ НОВОЕ:** Все уникальные `tg_chat_id` из `telegram_activity_events` (включая новые группы!)

3. **Для каждого chat_id:**
   - Вызывается Telegram Bot API `getChatMember`
   - Проверяются права пользователя (admin/owner)
   - Результат сохраняется в `telegram_group_admins`

4. **API `for-user` загружает доступные группы:**
   - Читает из `telegram_group_admins` все группы, где `is_admin = true`
   - Фильтрует группы, уже добавленные в организацию
   - Возвращает список доступных для добавления

## Тестирование

### Сценарий 1: Новая группа
1. Добавьте бота в новую Telegram-группу
2. Дайте боту админские права
3. Напишите любое сообщение в группе (чтобы появилась активность)
4. Откройте "Доступные группы" в интерфейсе
5. ✅ Группа должна появиться в списке

### Сценарий 2: Удаление и повторное добавление
1. Удалите группу из организации
2. Откройте "Доступные группы"
3. ✅ Группа должна снова появиться для добавления

### Сценарий 3: Несколько организаций
1. Добавьте группу в организацию A
2. Откройте "Доступные группы" в организации B
3. ✅ Группа должна быть доступна для добавления в B

## Важные замечания

- **Webhook не требуется** для обнаружения новых групп - используются данные из `telegram_activity_events`
- **Активность обязательна** - если в группе нет активности (сообщений), она не будет обнаружена
- **Лимит 1000 событий** - сканируются последние 1000 событий активности (можно увеличить при необходимости)
- **Кэш 7 дней** - информация о правах админа хранится 7 дней (`expires_at`)

## Файлы изменены
1. `app/api/telegram/groups/for-user/route.ts` - откат к telegram_group_admins
2. `app/api/telegram/groups/update-admin-rights/route.ts` - сканирование активности + прямая проверка
3. `app/app/[org]/telegram/select-groups/page.tsx` - редирект на available-groups
4. `app/api/auth/telegram/route.ts` - исправление upsert membership
