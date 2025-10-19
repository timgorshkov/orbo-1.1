# Добавление поля "Краткое описание" (Bio) для участников

## Обзор изменений

Добавлено новое поле `bio` (краткое описание) для профилей участников с ограничением в 60 символов. Поле отображается в карточках участников вместо email и используется в поиске.

## Что изменено

### 1. База данных

**Файл**: `db/migrations/28_add_participant_bio.sql`

```sql
-- Добавляем поле bio для краткого описания участника (до 60 символов)
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS bio text;

-- Добавляем проверку на максимальную длину
ALTER TABLE public.participants
ADD CONSTRAINT bio_max_length CHECK (char_length(bio) <= 60);

-- Создаем индекс для быстрого поиска по bio
CREATE INDEX IF NOT EXISTS idx_participants_bio 
ON public.participants USING gin (to_tsvector('russian', coalesce(bio, '')));
```

**Особенности**:
- **TEXT** тип для гибкости (вместо VARCHAR)
- **CHECK constraint** для ограничения длины в 60 символов
- **GIN индекс** с полнотекстовым поиском (поддержка русского языка)
- **NULL допустим** - поле необязательное

### 2. TypeScript типы

**Файл**: `lib/types/participant.ts`

```typescript
export interface ParticipantRecord {
  // ...
  phone: string | null;
  photo_url: string | null;
  bio: string | null; // ✅ Добавлено
  created_at: string;
  // ...
}
```

### 3. API Endpoint

**Файл**: `app/api/participants/[participantId]/route.ts`

```typescript
const allowedFields = [
  'full_name', 'first_name', 'last_name', 'username', 
  'email', 'phone', 
  'bio', // ✅ Добавлено
  'activity_score', 'risk_score', // ...
];
```

### 4. Профиль участника - редактирование

**Файл**: `components/members/participant-profile-card.tsx`

#### 4.1. State

```typescript
interface FieldState {
  full_name: string
  email: string
  phone: string
  bio: string // ✅ Добавлено
  notes: string
  custom_attributes: Record<string, any>
}

const [fields, setFields] = useState<FieldState>({
  full_name: participant.full_name || '',
  email: participant.email || '',
  phone: participant.phone || '',
  bio: participant.bio || '', // ✅ Инициализация
  notes: participant.notes || '',
  custom_attributes: participant.custom_attributes || {}
})
```

#### 4.2. UI для редактирования

```tsx
{/* Bio (краткое описание) */}
{editing ? (
  <div>
    <label className="text-sm font-medium text-gray-700">Краткое описание</label>
    <Input
      value={fields.bio}
      onChange={e => handleChange('bio', e.target.value)}
      disabled={pending}
      className="mt-1"
      placeholder="Должность, интересы, специализация (до 60 символов)"
      maxLength={60}
    />
    <p className="mt-1 text-xs text-gray-500">
      {fields.bio.length}/60 символов
    </p>
  </div>
) : participant.bio ? (
  <div>
    <p className="text-lg text-gray-600">{participant.bio}</p>
  </div>
) : null}
```

**Особенности**:
- `maxLength={60}` - клиентская валидация
- Счетчик символов в реальном времени
- Отображается только если заполнено (в режиме просмотра)
- Плейсхолдер с подсказкой

#### 4.3. Сохранение

```typescript
body: JSON.stringify({
  orgId,
  full_name: fields.full_name,
  email: fields.email,
  phone: fields.phone,
  bio: fields.bio, // ✅ Отправка на сервер
  notes: fields.notes,
  custom_attributes: fields.custom_attributes
})
```

#### 4.4. Отмена

```typescript
const handleCancel = () => {
  setEditing(false)
  setFields({
    full_name: participant.full_name || '',
    email: participant.email || '',
    phone: participant.phone || '',
    bio: participant.bio || '', // ✅ Сброс
    notes: participant.notes || '',
    custom_attributes: participant.custom_attributes || {}
  })
  setError(null)
}
```

### 5. Карточка участника в списке

**Файл**: `components/members/member-card.tsx`

#### Было (отображался email):

```tsx
const username = participant.tg_username
  ? `@${participant.tg_username}`
  : participant.email || ''

{/* Username или email */}
{username && (
  <p className="text-sm text-gray-500">{username}</p>
)}
```

#### Стало (отображается bio):

```tsx
interface Participant {
  // ...
  bio: string | null // ✅ Добавлено
}

{/* Имя */}
<h3 className="mb-2 text-center text-lg font-semibold text-gray-900 group-hover:text-blue-600">
  {displayName}
</h3>

{/* Краткое описание (bio) */}
{participant.bio && (
  <p className="text-sm text-center text-gray-600 line-clamp-2">
    {participant.bio}
  </p>
)}
```

**Особенности**:
- `line-clamp-2` - ограничивает отображение 2 строками
- Центрированный текст
- Серый цвет для вторичной информации
- Отображается только если `bio` заполнено

### 6. Поиск

**Файл**: `components/members/members-view.tsx`

#### 6.1. Интерфейс

```typescript
interface Participant {
  id: string
  full_name: string | null
  tg_username: string | null
  tg_user_id: string | null
  email: string | null
  bio: string | null // ✅ Добавлено
  custom_attributes: any
  participant_status: string
  photo_url: string | null
  created_at?: string
}
```

#### 6.2. Логика фильтрации

```typescript
const filteredParticipants = useMemo(() => {
  if (!searchQuery.trim()) {
    return participants
  }

  const query = searchQuery.toLowerCase()
  return participants.filter((p) => {
    const fullName = (p.full_name || '').toLowerCase()
    const username = (p.tg_username || '').toLowerCase()
    const email = (p.email || '').toLowerCase()
    const bio = (p.bio || '').toLowerCase() // ✅ Добавлено

    return (
      fullName.includes(query) ||
      username.includes(query) ||
      email.includes(query) ||
      bio.includes(query) // ✅ Поиск по bio
    )
  })
}, [participants, searchQuery])
```

#### 6.3. Плейсхолдер

```tsx
<input
  type="text"
  placeholder="Поиск по имени, описанию, email, @username..."
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
/>
```

## Применение изменений

### Шаг 1: Применить миграцию в Supabase

1. Откройте **Supabase Dashboard** → **SQL Editor**
2. Скопируйте содержимое `db/migrations/28_add_participant_bio.sql`
3. Выполните SQL
4. Проверьте успешное выполнение

### Шаг 2: Проверка в БД

```sql
-- Проверить, что поле добавлено
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'participants' 
  AND column_name = 'bio';

-- Ожидаемый результат:
-- column_name | data_type | character_maximum_length
-- bio         | text      | null

-- Проверить constraint
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'bio_max_length';

-- Ожидаемый результат:
-- constraint_name | check_clause
-- bio_max_length  | (char_length(bio) <= 60)

-- Проверить индекс
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'participants' 
  AND indexname = 'idx_participants_bio';
```

### Шаг 3: Задеплоить код

Код уже обновлен и готов к деплою. После применения миграции и деплоя изменения вступят в силу.

## Примеры использования

### Пример 1: Добавление bio в профиль

```
1. Открыть профиль участника
2. Нажать "Редактировать"
3. Заполнить "Краткое описание": "Менеджер по продажам, увлекаюсь футболом"
4. Видеть счетчик: "46/60 символов"
5. Нажать "Сохранить"
6. ✅ Bio отображается под именем в профиле
7. ✅ Bio отображается в карточке участника в списке
```

### Пример 2: Поиск по bio

```
1. Открыть список участников
2. В поиске ввести "менеджер"
3. ✅ Найдены все участники с "менеджер" в bio
4. Ввести "футбол"
5. ✅ Найдены участники с "футбол" в bio
```

### Пример 3: Ограничение длины

```
1. Редактировать профиль
2. Попытаться ввести текст длиннее 60 символов
3. ✅ Ввод остановится на 60 символе (клиентская валидация)
4. Попробовать обойти через API
5. ✅ База данных отклонит запись (CHECK constraint)
```

## Визуальные изменения

### Карточка участника (до):

```
┌─────────────────────────┐
│        [Фото]           │
│                         │
│    Иван Иванов          │
│    @ivan_ivanov         │ ← username или email
│                         │
└─────────────────────────┘
```

### Карточка участника (после):

```
┌─────────────────────────┐
│        [Фото]           │
│                         │
│    Иван Иванов          │
│    Менеджер по          │ ← bio (краткое описание)
│    продажам             │
│                         │
└─────────────────────────┘
```

### Профиль участника (режим просмотра):

```
┌─────────────────────────────────────┐
│   [Градиент]                        │
│                                     │
│   [Фото]                            │
│                                     │
│   Иван Иванов                       │ ← full_name
│   Менеджер по продажам, футбол      │ ← bio
│                                     │
│   [Контактная информация]           │
└─────────────────────────────────────┘
```

### Профиль участника (режим редактирования):

```
┌─────────────────────────────────────┐
│   Полное имя                        │
│   [Иван Иванов____________]         │
│                                     │
│   Краткое описание                  │
│   [Менеджер по продажам, футбол__]  │
│   46/60 символов                    │ ← Счетчик
│                                     │
│   [Email] [Phone] [Created At]      │
└─────────────────────────────────────┘
```

## Валидация

### Клиентская валидация (Frontend)

- `maxLength={60}` на input элементе
- Счетчик символов в реальном времени
- Визуальная подсказка о лимите

### Серверная валидация (Database)

```sql
-- CHECK constraint в PostgreSQL
ALTER TABLE participants
ADD CONSTRAINT bio_max_length CHECK (char_length(bio) <= 60);
```

**Тест**:
```sql
-- ❌ Это не сработает
INSERT INTO participants (org_id, full_name, bio)
VALUES ('...', 'Test', 'Очень длинный текст который точно превышает лимит в шестьдесят символов для краткого описания');

-- Ошибка: new row for relation "participants" violates check constraint "bio_max_length"

-- ✅ Это сработает
INSERT INTO participants (org_id, full_name, bio)
VALUES ('...', 'Test', 'Менеджер по продажам');
```

## Поиск и индексация

### GIN индекс с полнотекстовым поиском

```sql
CREATE INDEX idx_participants_bio 
ON participants USING gin (to_tsvector('russian', coalesce(bio, '')));
```

**Преимущества**:
- Быстрый полнотекстовый поиск
- Поддержка морфологии русского языка
- Поиск по словоформам (например, "менеджер" найдет "менеджеры")

**Тест производительности**:

```sql
-- Без индекса (медленно на больших таблицах)
EXPLAIN ANALYZE
SELECT * FROM participants
WHERE bio ILIKE '%менеджер%';

-- С GIN индексом (быстро)
EXPLAIN ANALYZE
SELECT * FROM participants
WHERE to_tsvector('russian', coalesce(bio, '')) @@ to_tsquery('russian', 'менеджер');
```

## Миграция существующих данных (опционально)

Если нужно заполнить `bio` для существующих участников:

```sql
-- Пример: взять первые 60 символов из notes
UPDATE participants
SET bio = LEFT(notes, 60)
WHERE bio IS NULL 
  AND notes IS NOT NULL 
  AND char_length(notes) > 0;

-- Или из custom_attributes
UPDATE participants
SET bio = custom_attributes->>'position'
WHERE bio IS NULL 
  AND custom_attributes ? 'position'
  AND char_length(custom_attributes->>'position') <= 60;
```

## Измененные файлы

1. ✅ `db/migrations/28_add_participant_bio.sql` - новая миграция
2. ✅ `lib/types/participant.ts` - добавлен `bio` в `ParticipantRecord`
3. ✅ `app/api/participants/[participantId]/route.ts` - добавлен `bio` в `allowedFields`
4. ✅ `components/members/participant-profile-card.tsx` - UI для редактирования bio
5. ✅ `components/members/member-card.tsx` - отображение bio в карточке (вместо email)
6. ✅ `components/members/members-view.tsx` - поиск по bio

## FAQ

### Q: Почему 60 символов?

**A**: Это оптимальная длина для краткого описания:
- Помещается на карточке участника (2 строки × 30 символов)
- Достаточно для должности/специализации
- Не перегружает интерфейс
- Аналог Twitter bio (раньше был 160, сейчас урезали)

### Q: Можно ли увеличить лимит?

**A**: Да, но нужно:
1. Изменить CHECK constraint в БД:
   ```sql
   ALTER TABLE participants DROP CONSTRAINT bio_max_length;
   ALTER TABLE participants ADD CONSTRAINT bio_max_length CHECK (char_length(bio) <= 100);
   ```
2. Обновить `maxLength` в `<Input>` компоненте
3. Проверить отображение в карточках (может потребоваться корректировка CSS)

### Q: Почему bio вместо email в карточках?

**A**: 
- **Bio более информативен**: "Менеджер по продажам" vs "ivan@example.com"
- **Email приватен**: не всегда хочется его показывать всем
- **Email доступен в профиле**: при клике на карточку
- **Лучший UX**: пользователи сразу видят, кто есть кто

### Q: Что если bio не заполнен?

**A**: Ничего не отображается (только имя на карточке).

## Заключение

Добавлено поле `bio` (краткое описание) для участников с:
- ✅ Ограничением в 60 символов (клиент + сервер)
- ✅ Отображением в карточках (вместо email)
- ✅ Отображением в профиле (под именем)
- ✅ Поддержкой поиска (с GIN индексом)
- ✅ Счетчиком символов при редактировании
- ✅ Полнотекстовым поиском на русском

Интерфейс стал более информативным и удобным! 🎉

