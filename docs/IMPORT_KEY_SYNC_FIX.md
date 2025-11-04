# Import Key Synchronization Fix - 2025-11-04

## Проблема
При импорте JSON файла все сообщения пропускались с ошибкой "No decision for author: user_154588486".

### Причина
Несинхронизированная логика формирования ключей между:
1. **JSON Parser** - использует `user_${userId}` для авторов с Telegram ID
2. **Parse API** - передаёт данные в UI
3. **UI Component** - формирует decisions Map с ключами `importUsername || importName`
4. **Import API** - ищет participantId по ключу `msg.authorUsername || msg.authorName`

Результат: ключи не совпадают → участники не находятся → сообщения пропускаются.

## Решение

### 1. Добавлено поле `importUserId` в `ParticipantMatch`
**Файл:** `app/api/telegram/import-history/[id]/parse/route.ts`

```typescript
interface ParticipantMatch {
  importName: string;
  importUsername?: string;
  importUserId?: number; // ⭐ Telegram User ID из JSON
  // ...
}

// В parse endpoint:
if (isJson && author.userId) {
  match.importUserId = author.userId;
}
```

### 2. Синхронизирована логика ключей в UI
**Файл:** `components/telegram/import-history.tsx`

```typescript
// Вспомогательная функция для формирования ключа
const getAuthorKey = (match: ParticipantMatch): string => {
  return match.importUserId 
    ? `user_${match.importUserId}` 
    : (match.importUsername || match.importName);
};

// Используется везде: в onDrop, handleDecisionChange, handleBulkAction, render
```

### 3. Синхронизирована логика ключей в Import API
**Файл:** `app/api/telegram/import-history/[id]/import/route.ts`

```typescript
// При маппинге сообщений:
const authorKey = msg.authorUserId 
  ? `user_${msg.authorUserId}` 
  : (msg.authorUsername || msg.authorName);
const participantId = participantMap.get(authorKey);
```

### 4. Добавлена опция "Игнорировать"
**Запрос пользователя:** Возможность не импортировать некоторых участников.

**Реализация:**
- Добавлен тип действия `'skip'` в `ImportDecision` и UI
- В Import API добавлена проверка `if (decision.action === 'skip') continue;`
- В UI добавлена опция "Игнорировать" в select
- Добавлена кнопка "Игнорировать всех" в групповые действия

### 5. Улучшен UI
**Запрос пользователя:** Перенести групповые действия в заголовок таблицы.

**Изменения:**
- Удалён отдельный блок Card "Групповые действия"
- Кнопки перемещены в заголовок таблицы участников (справа от названия)
- Кнопки уменьшены (`size="sm"`)
- Добавлена третья кнопка "Игнорировать всех"

## Файлы изменены

### Backend:
1. `app/api/telegram/import-history/[id]/parse/route.ts` - добавлен `importUserId`
2. `app/api/telegram/import-history/[id]/import/route.ts` - синхронизация ключей + поддержка `skip`

### Frontend:
3. `components/telegram/import-history.tsx` - синхронизация ключей + новый UI

## Логика ключей (синхронизировано везде)

```typescript
// Для JSON (если есть userId):
const key = `user_${userId}`;

// Для HTML (или JSON без userId):
const key = username || name;
```

## Результат

✅ Участники правильно находятся по ключу  
✅ Сообщения импортируются корректно  
✅ Добавлена опция "Игнорировать" для участников  
✅ Улучшен UI (компактные групповые действия)

## Тестирование

1. Экспортировать JSON из Telegram
2. Загрузить в Import History
3. ✅ Проверить, что участники распознаются (100% match по user_id)
4. ✅ Проверить, что можно выбрать "Игнорировать"
5. ✅ Проверить, что групповые действия в заголовке таблицы
6. Нажать "Импортировать"
7. ✅ Проверить, что все сообщения импортировались (не 0)
8. ✅ Проверить, что игнорированные участники НЕ импортировались

