# Исправление ошибки 500 при сохранении характеристик

## Проблема

При попытке сохранить характеристики в профиле участника возникала ошибка:
```
PUT https://orbo-1-1.vercel.app/api/participants/[id] 500 (Internal Server Error)
```

## Причина

В Next.js 15 параметр `params` в API route handlers стал асинхронным (`Promise`), но в методах `GET`, `PUT` и `PATCH` файла `app/api/participants/[participantId]/route.ts` мы не добавили `await`.

### Было (неправильно):

```typescript
export async function PUT(
  request: Request, 
  { params }: { params: { participantId: string } }
) {
  const participantId = params.participantId; // ❌ params - это Promise, не объект!
  // ...
}
```

**Результат**: `params.participantId` был `undefined`, что приводило к ошибке 500.

### Стало (правильно):

```typescript
export async function PUT(
  request: Request, 
  { params }: { params: Promise<{ participantId: string }> }
) {
  const { participantId } = await params; // ✅ Сначала await, потом деструктуризация
  // ...
}
```

## Исправленные методы

### 1. GET endpoint
```typescript
export async function GET(
  request: Request, 
  { params }: { params: Promise<{ participantId: string }> }
) {
  const { participantId } = await params
  // ...
}
```

### 2. PUT endpoint
```typescript
export async function PUT(
  request: Request, 
  { params }: { params: Promise<{ participantId: string }> }
) {
  const { participantId } = await params
  const payload = await request.json();
  const orgId = payload?.orgId;
  // ...
}
```

### 3. PATCH endpoint
```typescript
export async function PATCH(
  request: Request, 
  { params }: { params: Promise<{ participantId: string }> }
) {
  const { participantId } = await params
  const payload = await request.json();
  const orgId = payload?.orgId;
  // ...
}
```

## Почему это произошло

В Next.js 15 изменился API:
- **Next.js 14 и ниже**: `params` был обычным объектом
- **Next.js 15**: `params` стал Promise для поддержки асинхронных операций

Мы уже исправили это в других местах (например, в `photo/route.ts`), но пропустили основной `route.ts`.

## Проверка других файлов

Проверили все API endpoints в `app/api/participants/`:
- ✅ `[participantId]/photo/route.ts` - уже исправлен
- ✅ `[participantId]/route.ts` - **исправлен сейчас**
- ✅ `check-duplicates/route.ts` - не использует params
- ✅ `enrich/route.ts` - не использует params
- ✅ `create/route.ts` - не использует params
- ✅ Остальные - не используют params

## Измененный файл

- ✅ `app/api/participants/[participantId]/route.ts`
  - GET: добавлен `await params`
  - PUT: добавлен `await params`
  - PATCH: добавлен `await params`

## Тестирование

После исправления:

### Тест 1: Сохранение характеристик
```
1. Открыть профиль участника
2. Нажать "Редактировать"
3. Добавить характеристику: "Должность" = "Менеджер"
4. Нажать "Сохранить"
5. ✅ Характеристика сохраняется без ошибок
6. ✅ Ошибки 500 больше нет
```

### Тест 2: Обновление основных полей
```
1. Открыть профиль
2. Редактировать имя, email, телефон
3. Нажать "Сохранить"
4. ✅ Все поля сохраняются
5. ✅ Ошибки 500 нет
```

### Тест 3: Объединение дубликатов (PATCH)
```
1. Открыть профиль с дубликатами
2. Выбрать дубликат
3. Нажать "Объединить"
4. ✅ Объединение работает
5. ✅ Ошибки 500 нет
```

## Next.js 15 Migration Pattern

Правильный паттерн для всех API routes с dynamic parameters:

```typescript
// ❌ Старый способ (Next.js 14)
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id
}

// ✅ Новый способ (Next.js 15)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
}
```

**Ключевые изменения**:
1. `params: { id: string }` → `params: Promise<{ id: string }>`
2. `params.id` → `await params` затем деструктуризация

## Заключение

Ошибка 500 была вызвана несоответствием с новым API Next.js 15. После добавления `await` для `params` во всех методах (GET, PUT, PATCH) проблема решена.

✅ **Сохранение характеристик теперь работает корректно!** 🎉

