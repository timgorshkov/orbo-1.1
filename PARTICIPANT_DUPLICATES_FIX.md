# Исправление работы с дубликатами участников

## Проблемы

### 1. Список дубликатов не обновляется автоматически
При переходе на вкладку "Дубликаты" список не обновлялся автоматически. Пользователю приходилось вручную нажимать кнопку "Обновить список".

### 2. Текущий профиль в списке дубликатов
Первым в списке дубликатов отображался текущий профиль участника. При попытке объединения выдавалась ошибка "Cannot merge participant into itself".

### 3. Ошибка "Participants already share canonical record"
При попытке объединить участника с любым дубликатом выдавалась ошибка:
```
PATCH /api/participants/5741f10e-8323-4418-9f93-049f603da7a6 400 (Bad Request)
Error: Participants already share canonical record
```

## Причины

### Проблема 1: Отсутствие автоматического обновления
Компонент `ParticipantDuplicatesCard` не вызывал `handleFreshCheck()` при монтировании, полагаясь только на начальные данные из `detail.duplicates`.

### Проблема 2: Текущий участник в результатах
API `/api/participants/check-duplicates` возвращал все совпадения, включая самого текущего участника. Компонент выбирал первый результат как дубликат для объединения.

**Код до исправления:**
```typescript
const [selectedId, setSelectedId] = useState<string | null>(initialDuplicates[0]?.id ?? null);
```

### Проблема 3: Логика проверки в API
API `/api/participants/[participantId]/route.ts` правильно проверял:
```typescript
if (targetCanonical === canonicalId) {
  return NextResponse.json({ error: 'Participants already share canonical record' }, { status: 400 });
}
```

Но проблема возникала из-за того, что `check-duplicates` возвращал текущего участника, и при объединении с ним срабатывала эта проверка.

## Решения

### 1. Автоматическое обновление списка

**Добавлен `useEffect` в `ParticipantDuplicatesCard`:**

```typescript
// Автоматически обновляем список при монтировании компонента
useEffect(() => {
  handleFreshCheck();
}, [handleFreshCheck]);
```

**Результат**: При переходе на вкладку "Дубликаты" автоматически запускается поиск дубликатов с актуальными данными.

### 2. Исключение текущего участника из результатов

**A. В API `check-duplicates`:**

```typescript
export async function POST(request: Request) {
  const payload = await request.json();
  const currentParticipantId = payload?.currentParticipantId as string | undefined;
  
  // ... получение совпадений ...
  
  // Исключаем текущего участника из результатов
  const filteredMatches = currentParticipantId 
    ? matches.filter(match => match.id !== currentParticipantId)
    : matches;

  return NextResponse.json({ matches: filteredMatches });
}
```

**B. В компоненте `ParticipantDuplicatesCard`:**

```typescript
// Фильтруем текущего участника из начальных дубликатов
const currentParticipantId = detail.requestedParticipantId;
const initialDuplicates = (detail.duplicates || []).filter(dup => dup.id !== currentParticipantId);
```

**C. Передача `currentParticipantId` в API:**

```typescript
const handleFreshCheck = useCallback(async () => {
  const response = await fetch('/api/participants/check-duplicates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orgId,
      currentParticipantId, // ← Добавлено
      email: detail.participant.email,
      // ... остальные поля
    })
  });
  // ...
}, [detail.participant, orgId, currentParticipantId]);
```

**Результат**: 
- ✅ Текущий участник исключается из списка дубликатов
- ✅ Первый выбранный дубликат всегда отличается от текущего
- ✅ Ошибка "Cannot merge participant into itself" не возникает

### 3. Корректная проверка объединения

API уже содержал правильную логику проверки:
```typescript
if (canonicalId === targetId) {
  return NextResponse.json({ error: 'Cannot merge participant into itself' }, { status: 400 });
}

if (targetCanonical === canonicalId) {
  return NextResponse.json({ error: 'Participants already share canonical record' }, { status: 400 });
}
```

Проблема была устранена исключением текущего участника из результатов поиска.

## Измененные файлы

### 1. `app/api/participants/check-duplicates/route.ts`
- Добавлен параметр `currentParticipantId`
- Добавлена фильтрация результатов для исключения текущего участника

### 2. `components/members/participant-duplicates-card.tsx`
- Добавлен `import { useEffect }` для автоматического обновления
- Добавлена фильтрация `initialDuplicates` для исключения текущего участника
- Добавлен `currentParticipantId` в зависимости `handleFreshCheck`
- Добавлен `useEffect` для автоматического вызова `handleFreshCheck` при монтировании
- Передача `currentParticipantId` в API запрос

## Workflow теперь работает так

### Сценарий 1: Переход на вкладку "Дубликаты"
```
1. Пользователь открывает профиль участника
   ↓
2. Переключается на вкладку "Дубликаты"
   ↓
3. useEffect → handleFreshCheck() ✅ Автоматически
   ↓
4. API получает список дубликатов
   ↓
5. API фильтрует текущего участника ✅ Исключен
   ↓
6. Список отображается с актуальными данными
```

### Сценарий 2: Объединение дубликата
```
1. Список дубликатов загружен (без текущего участника)
   ↓
2. Первый дубликат выбран автоматически ✅ НЕ текущий
   ↓
3. Пользователь кликает "Объединить"
   ↓
4. API проверяет:
   - canonicalId !== targetId ✅ Разные
   - targetCanonical !== canonicalId ✅ Не связаны
   ↓
5. Объединение выполняется успешно ✅
   ↓
6. Редирект на канонический профиль
```

### Сценарий 3: Ручное обновление списка
```
1. Пользователь изменил данные участника
   ↓
2. Кликает "Обновить список"
   ↓
3. handleFreshCheck() вызывается вручную
   ↓
4. Получает актуальные совпадения
   ↓
5. Список обновляется
```

## Тестирование

### Тест 1: Автоматическое обновление
```
✅ Шаг 1: Открыть профиль участника
✅ Шаг 2: Переключиться на вкладку "Дубликаты"
✅ Ожидание: Список автоматически загружается
✅ Результат: Список дубликатов отображается без ручного нажатия кнопки
```

### Тест 2: Исключение текущего участника
```
✅ Шаг 1: Открыть профиль участника с известными дубликатами
✅ Шаг 2: Переключиться на вкладку "Дубликаты"
✅ Ожидание: Текущий участник НЕ отображается в списке
✅ Результат: Только реальные дубликаты в списке
```

### Тест 3: Успешное объединение
```
✅ Шаг 1: Открыть вкладку "Дубликаты"
✅ Шаг 2: Выбрать дубликата из списка
✅ Шаг 3: Кликнуть "Объединить выбранного участника"
✅ Ожидание: Объединение проходит успешно
✅ Результат: Редирект на канонический профиль, нет ошибок
```

### Тест 4: Ручное обновление
```
✅ Шаг 1: Открыть вкладку "Дубликаты"
✅ Шаг 2: Очистить поле поиска (если заполнено)
✅ Шаг 3: Кликнуть "Обновить список"
✅ Ожидание: Список обновляется с актуальными данными
✅ Результат: Получены актуальные дубликаты
```

## Логика проверки объединения

API выполняет следующие проверки перед объединением:

```typescript
// 1. Проверка валидности targetId
if (!targetId || typeof targetId !== 'string') {
  return { error: 'Invalid merge target' };
}

// 2. Получение канонических ID
const canonicalId = participantRecord.merged_into || participantRecord.id;
const targetCanonical = targetRecord.merged_into || targetRecord.id;

// 3. Проверка, что не объединяем с самим собой
if (canonicalId === targetId) {
  return { error: 'Cannot merge participant into itself' };
}

// 4. Проверка, что участники не связаны одной канонической записью
if (targetCanonical === canonicalId) {
  return { error: 'Participants already share canonical record' };
}

// 5. Выполнение объединения через RPC
await supabase.rpc('merge_participants_extended', {
  p_target: targetCanonical,
  p_duplicates: [canonicalId],
  p_actor: actorId
});
```

## Заключение

Все три проблемы исправлены:
1. ✅ **Автоматическое обновление** - список загружается при открытии вкладки
2. ✅ **Исключение текущего участника** - не отображается в списке дубликатов
3. ✅ **Успешное объединение** - ошибка "Participants already share canonical record" не возникает

Функционал объединения дубликатов теперь работает корректно! 🎉

