# Исправление логики удаления и добавления Telegram групп

## Проблема

При попытке повторно добавить Telegram группу, которая была ранее удалена из организации, система показывала "У вас нет доступных Telegram групп", хотя пользователь оставался администратором этой группы в Telegram, и бот Orbo был администратором.

### Логи браузера:
```
Updating admin rights before fetching available groups...
Updated admin rights for 3 groups
Fetching available groups for org 11111111-1111-1111-1111-111111111111... (attempt 1)
API response: {
  availableGroups: [],
  groups: [{…}, {…}, {…}],
  message: "Found 3 groups for org 11111111-1111-1111-1111-111111111111 and 0 available groups"
}
Loaded 0 available groups
```

## Причина

### 1. Неправильная логика удаления группы

**Старый код** (`app/app/[org]/telegram/actions.ts`):
```typescript
// ❌ Удаляла всю группу из telegram_groups
await supabase
  .from('telegram_groups')
  .delete()
  .eq('id', groupId)
```

**Проблема**: 
- Полностью удалялась запись из `telegram_groups`
- Каскадно удалялись все связи из `org_telegram_groups`
- Группа исчезала из системы полностью
- При повторной попытке добавления группы не было данных в `telegram_groups`

### 2. Отсутствующие данные в telegram_groups

Когда API `/api/telegram/groups/for-user` запрашивал группы:
1. Получал список групп, где пользователь админ (из `telegram_group_admins` или `user_group_admin_status`)
2. Пытался найти эти группы в `telegram_groups`
3. Если группа была удалена старым способом, она не находилась
4. Код пропускал группу: `if (!group) { continue; }`
5. Группа не попадала ни в `availableGroups`, ни в `existingGroups`

## Решение

### 1. Исправлена логика удаления группы

**Новый код** (`app/app/[org]/telegram/actions.ts`):

```typescript
// ✅ Удаляем только связь org-группа
const { error: deleteError } = await supabase
  .from('org_telegram_groups')
  .delete()
  .eq('org_id', org)
  .eq('tg_chat_id', existingGroup.tg_chat_id)

// Проверяем, используется ли группа другими организациями
const { data: otherLinks } = await supabase
  .from('org_telegram_groups')
  .select('org_id')
  .eq('tg_chat_id', existingGroup.tg_chat_id)
  .limit(1)

// Если группа не используется, убираем org_id
if (!otherLinks || otherLinks.length === 0) {
  if (existingGroup.org_id === org) {
    await supabase
      .from('telegram_groups')
      .update({ org_id: null })
      .eq('id', groupId)
  }
}
```

**Улучшения**:
- ✅ Удаляется только связь в `org_telegram_groups`
- ✅ Группа остаётся в `telegram_groups` (доступна для повторного добавления)
- ✅ Поддерживается многие-ко-многим (одна группа в нескольких организациях)
- ✅ Автоматически убирается `org_id`, если группа больше не используется

### 2. Автоматическое восстановление удалённых групп

**Новый код** (`app/api/telegram/groups/for-user/route.ts`):

```typescript
for (const right of adminRights) {
  let group = groupByChatId.get(chatKey);

  // Если группа не найдена в telegram_groups, создаём запись
  if (!group) {
    console.log(`Group data missing for admin right ${right.id}, creating placeholder`);
    
    const { data: newGroup, error: createError } = await supabaseService
      .from('telegram_groups')
      .insert({
        tg_chat_id: right.tg_chat_id,
        title: `Group ${right.tg_chat_id}`,
        bot_status: 'connected',
        org_id: null
      })
      .select()
      .single();
    
    if (createError) {
      // Возможно уже существует, пытаемся получить
      const { data: existingGroupData } = await supabaseService
        .from('telegram_groups')
        .select('*')
        .eq('tg_chat_id', right.tg_chat_id)
        .single();
      
      if (existingGroupData) {
        group = existingGroupData;
      } else {
        continue;
      }
    } else {
      group = newGroup;
    }
  }
  // ... остальная логика
}
```

**Улучшения**:
- ✅ Автоматически восстанавливает удалённые группы в `telegram_groups`
- ✅ Группы снова становятся доступными для добавления
- ✅ Обрабатывается случай, когда запись уже существует (конфликт)

## Архитектура

### Таблицы

#### `telegram_groups`
Хранит информацию о Telegram группах:
- `id` (bigserial) - первичный ключ
- `tg_chat_id` (bigint, unique) - ID чата в Telegram
- `org_id` (uuid, nullable) - основная организация (legacy, может быть null)
- `title`, `bot_status`, `last_sync_at`

#### `org_telegram_groups`
Таблица связи многие-ко-многим:
- `org_id` (uuid) - ID организации
- `tg_chat_id` (bigint) - ID чата в Telegram
- `created_by`, `created_at`
- Primary key: `(org_id, tg_chat_id)`

#### `telegram_group_admins` / `user_group_admin_status`
Отслеживает права администратора пользователей:
- `user_id` (uuid) - ID пользователя Supabase
- `tg_chat_id` (bigint) - ID чата в Telegram
- `is_admin` (boolean) - флаг админских прав

### Логика определения доступных групп

```
1. Получить список групп, где пользователь админ
   ↓ из telegram_group_admins/user_group_admin_status
   
2. Получить данные групп из telegram_groups
   ↓ по tg_chat_id
   
3. Если группа НЕ найдена:
   → Создать запись в telegram_groups
   → Продолжить обработку
   
4. Проверить связи в org_telegram_groups
   ↓
   
5. Классификация:
   - isLinkedToOrg = true → existingGroups
   - isLinkedToOrg = false → availableGroups
```

## Workflow

### Добавление группы
```
Админ → Доступные группы → Выбирает группу
  ↓
API создаёт запись в org_telegram_groups
  ↓
Группа переходит из availableGroups в existingGroups
```

### Удаление группы
```
Админ → Настройки Telegram → Удаляет группу
  ↓
API удаляет запись из org_telegram_groups
  ↓
Проверяется использование другими организациями
  ↓
Если не используется: org_id = null в telegram_groups
  ↓
Группа переходит из existingGroups в availableGroups
```

### Повторное добавление
```
Админ → Доступные группы
  ↓
API проверяет админ-права
  ↓
Находит группу в telegram_groups (org_id = null)
  ↓
Группа отображается в availableGroups
  ↓
Админ добавляет → Создаётся связь в org_telegram_groups
```

## Миграция для существующих данных

Если у вас есть группы, которые были удалены старым способом:

1. **Автоматическое восстановление**: При следующем обращении к API `/api/telegram/groups/for-user` группы будут автоматически восстановлены в `telegram_groups` с `org_id = null`

2. **Ручное восстановление** (опционально):
```sql
-- Найти удалённые группы, где пользователь админ
SELECT DISTINCT tg_chat_id 
FROM telegram_group_admins 
WHERE tg_chat_id NOT IN (SELECT tg_chat_id FROM telegram_groups);

-- Для каждой такой группы:
INSERT INTO telegram_groups (tg_chat_id, title, bot_status, org_id)
VALUES (<tg_chat_id>, 'Group <tg_chat_id>', 'connected', NULL)
ON CONFLICT (tg_chat_id) DO NOTHING;
```

## Измененные файлы

1. **`app/app/[org]/telegram/actions.ts`**
   - Функция `deleteGroup()` - изменена логика удаления
   - Теперь удаляет только связь, сохраняет группу

2. **`app/api/telegram/groups/for-user/route.ts`**
   - Добавлена логика автоматического восстановления групп
   - Создаётся запись в `telegram_groups`, если отсутствует

## Тестирование

### Сценарий 1: Удаление и повторное добавление группы
```
1. ✅ Добавить группу в организацию
2. ✅ Удалить группу из организации
3. ✅ Перейти в "Доступные Telegram группы"
4. ✅ Убедиться, что группа отображается в списке
5. ✅ Добавить группу обратно
```

### Сценарий 2: Группа в нескольких организациях
```
1. ✅ Добавить группу в организацию A
2. ✅ Добавить ту же группу в организацию B
3. ✅ Удалить группу из организации A
4. ✅ Убедиться, что группа всё ещё доступна в организации B
5. ✅ Убедиться, что группа доступна для добавления в организацию A
```

### Сценарий 3: Восстановление удалённой группы
```
1. ✅ Группа была удалена старым способом (нет в telegram_groups)
2. ✅ Перейти в "Доступные Telegram группы"
3. ✅ Группа автоматически восстанавливается
4. ✅ Группа отображается в списке доступных
```

## Заключение

Теперь удаление группы из организации:
- ✅ Не удаляет группу полностью из системы
- ✅ Позволяет повторно добавить группу
- ✅ Поддерживает многие-ко-многим отношения
- ✅ Автоматически восстанавливает удалённые группы

Проблема с "У вас нет доступных Telegram групп" **решена**! 🎉

