# ✅ Исправление фильтрации доступных групп

## 🎯 Проблема

В разделе "Доступные группы" показывались **ВСЕ** группы с подключенным ботом, даже те, к которым владелец организации не имеет отношения.

**Пример:**
Владелец организации (Тимур Голицын) видел группы, в которых он не состоит и не является админом.

---

## ✅ Что исправлено

### Изменения в `/api/telegram/groups/for-user`

**Файл:** `app/api/telegram/groups/for-user/route.ts`

#### 1️⃣ Убрана глобальная загрузка всех групп

**Было (строки 124-143):**
```typescript
// ❌ Получаем ВСЕ группы с bot_status='connected'
const { data: connectedGroups } = await supabaseService
  .from('telegram_groups')
  .select('tg_chat_id')
  .eq('bot_status', 'connected');

// Объединяем с группами, где пользователь админ
const allChatIds = new Set([
  ...Array.from(chatIdsFromAdminRights), 
  ...Array.from(chatIdsFromConnected)
]);
```

**Стало:**
```typescript
// ✅ Показываем ТОЛЬКО группы, где пользователь действительно админ
if (!adminRights || adminRights.length === 0) {
  return NextResponse.json({
    groups: [],
    availableGroups: [],
    message: 'You are not an admin in any Telegram groups'
  });
}

const allChatIds = new Set(adminRights.map(right => String(right.tg_chat_id)));
```

#### 2️⃣ Упрощена логика фильтрации

**Было (строки 415-425):**
```typescript
// ❌ Показываем группу, даже если нет прав админа
if (isLinkedToOrg && botHasAdminRights) {
  existingGroups.push(normalizedGroup);
} else if (!isLinkedToOrg && (botHasAdminRights || groupAny.bot_status === 'connected')) {
  availableGroups.push(normalizedGroup);
  if (!hasAdminRights) {
    console.log(`⚠️ Group will be shown with "grant admin rights" warning`);
  }
}
```

**Стало:**
```typescript
// ✅ Показываем только группы, где пользователь реально админ
if (isLinkedToOrg) {
  // Группа уже привязана к этой организации
  existingGroups.push(normalizedGroup);
} else if (hasAdminRights && botHasAdminRights) {
  // Группа доступна для добавления: пользователь админ И бот подключен
  availableGroups.push(normalizedGroup);
}
```

---

## 📋 Новая логика

**Группа показывается в "Доступные группы", ТОЛЬКО если:**
1. ✅ Пользователь **действительно админ** в этой группе
2. ✅ Бот **подключен** к группе (`bot_status: 'connected'`)
3. ✅ Группа **ещё НЕ добавлена** в эту организацию

**Группа показывается в "Подключенные группы", если:**
1. ✅ Группа **уже привязана** к этой организации

---

## 🧪 Проверка

### Тест 1: Владелец без админ-прав в группах
**Сценарий:**
1. Создать org от пользователя A
2. Пользователь A НЕ админ ни в одной группе

**Ожидается:**
- Раздел "Доступные группы": пустой список
- Сообщение: "You are not an admin in any Telegram groups"

---

### Тест 2: Владелец с админ-правами в 2 группах
**Сценарий:**
1. Пользователь A админ в группах X и Y
2. Группа X уже добавлена в org
3. Группа Y ещё не добавлена

**Ожидается:**
- "Подключенные группы": только группа X
- "Доступные группы": только группа Y

---

### Тест 3: Владелец видит чужие группы
**Сценарий:**
1. Пользователь A админ в группе X
2. Пользователь B админ в группе Z (A не админ там)
3. Оба бота подключены

**Ожидается:**
- Пользователь A видит: только группу X
- Пользователь A НЕ видит: группу Z ✅

---

## 🔍 Проверка в вашей организации

**Org ID:** `a3e8bc8f-8171-472c-a955-2f7878aed6f1`  
**Владелец:** Тимур Голицын (tg_user_id: 5484900079)

### SQL для проверки:
```sql
-- Группы, где Тимур админ
SELECT 
  tga.tg_chat_id,
  tg.title,
  tga.is_owner,
  tga.is_admin,
  otg.org_id as linked_to_org
FROM telegram_group_admins tga
INNER JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
LEFT JOIN org_telegram_groups otg 
  ON otg.tg_chat_id = tga.tg_chat_id 
  AND otg.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
WHERE tga.tg_user_id = 5484900079
  AND tga.is_admin = true
  AND tga.expires_at > NOW()
ORDER BY tg.title;
```

**Ожидается:**
- Только группы, где Тимур реально админ
- `linked_to_org`: null (доступна для добавления) или org_id (уже добавлена)

---

## ❓ Дополнительный вопрос

Вы упомянули: **"скрыть вкладку Telegram - Настройки"**

В разделе Telegram есть следующие вкладки:
1. **Главная** (`/telegram`) - доступна всем
2. **Доступные группы** (`/telegram/available-groups`) - сейчас доступна всем
3. **Настроить Telegram-аккаунт** (`/telegram/account`) - уже скрыта от не-владельцев

**Что именно нужно скрыть?**
- Вкладку "Доступные группы" для не-владельцев?
- Какую-то другую вкладку "Настройки"?

Пожалуйста, уточните, и я исправлю!

---

## 🎯 Итог

✅ **Исправлена фильтрация групп** - показываются только группы, где пользователь админ  
✅ **Убрана глобальная загрузка** - не показываются чужие группы  
✅ **Логика упрощена** - нет избыточных проверок  

---

**Изменённые файлы:**
- `app/api/telegram/groups/for-user/route.ts`

**Готово к деплою!** 🚀

