# Логика доступа к событиям

## Типы событий

### 1. Публичные события (`is_public = true`)
- **Доступ**: любой пользователь по ссылке, даже без авторизации
- **Просмотр**: полная информация о событии
- **Регистрация**: требуется авторизация через Telegram

### 2. Приватные события (`is_public = false`)
- **Доступ**: только участники организации (пространства)
- **Просмотр**: требуется авторизация через Telegram
- **Регистрация**: автоматическая для авторизованных участников

## Проверка участия в организации

При переходе по ссылке на событие `/p/[org]/events/[id]` система:

1. **Проверяет статус события**: должно быть `published`
2. **Проверяет тип события**: публичное или приватное
3. **Для приватных событий**:
   - Проверяет авторизацию пользователя через `auth.getUser()`
   - Ищет связанный Telegram аккаунт в `user_telegram_accounts` по `user_id` и `org_id`
   - Ищет участника в `participants` по `tg_user_id` и `org_id`
   - Если найден - предоставляет доступ
   - Если не найден - показывает "Доступ ограничен"

## Сценарии использования

### Сценарий 1: Публичное событие, неавторизованный пользователь
```
Пользователь → Открывает ссылку → Видит страницу события
→ Кликает "Зарегистрироваться" → Telegram Login Widget
→ Авторизация → Регистрация → Успех
```

### Сценарий 2: Публичное событие, авторизованный участник организации
```
Пользователь (участник) → Открывает ссылку → Видит страницу события
→ Кликает "Зарегистрироваться" → Регистрация без повторной авторизации → Успех
```

### Сценарий 3: Приватное событие, участник организации
```
Пользователь (участник) → Открывает ссылку → Проверка участия
→ Подтверждено → Видит страницу события → Регистрация → Успех
```

### Сценарий 4: Приватное событие, НЕ участник организации
```
Пользователь → Открывает ссылку → Проверка участия
→ НЕ подтверждено → "Доступ ограничен"
```

### Сценарий 5: Участник Telegram группы, нет Supabase сессии
```
Пользователь (в Telegram группе) → Получает ссылку в группе → Открывает
→ НЕ авторизован в Supabase → "Доступ ограничен, войдите через Telegram"
→ Telegram Login Widget → Авторизация → Проверка участия → Доступ
```

## Создание участника при регистрации

Если пользователь регистрируется на публичное событие и **НЕ является участником организации**:

1. Создается новая запись в `participants` с:
   - `org_id` - ID организации из события
   - `tg_user_id` - Telegram ID из `user_telegram_accounts`
   - `full_name` - из метаданных пользователя или email
   - `participant_status` - `'event_attendee'`

2. Создается запись в `event_registrations` с:
   - `event_id` - ID события
   - `participant_id` - ID созданного/найденного участника
   - `status` - `'registered'`

## Защита от дубликатов

При регистрации система:

1. **Ищет существующего участника** через:
   - `user_telegram_accounts` → получить `telegram_user_id`
   - `participants` → найти по `org_id` + `tg_user_id`

2. **Если участник найден**:
   - Использует существующий `participant_id`
   - Не создает дубликат

3. **Если участник НЕ найден**:
   - Создает нового участника
   - Использует новый `participant_id`

## Проверка прав доступа

### Страница `/p/[org]/events/[id]` (публичная)
```typescript
// 1. Проверка статуса события
if (event.status !== 'published') {
  return "Событие недоступно"
}

// 2. Проверка авторизации
const user = await supabase.auth.getUser()

// 3. Проверка участия в организации
let isOrgMember = false
if (user) {
  const telegramAccount = await user_telegram_accounts.findOne({
    user_id: user.id,
    org_id: org.id
  })
  
  if (telegramAccount) {
    const participant = await participants.findOne({
      org_id: org.id,
      tg_user_id: telegramAccount.telegram_user_id
    })
    isOrgMember = !!participant
  }
}

// 4. Проверка доступа
if (!event.is_public && !isOrgMember) {
  return "Доступ ограничен"
}

// 5. Показываем страницу
return <PublicEventDetail event={event} />
```

### API `/api/events/[id]/register` (регистрация)
```typescript
// 1. Проверка авторизации
const user = await supabase.auth.getUser()
if (!user) return 401

// 2. Проверка события
const event = await events.findById(eventId)
if (!event || event.status !== 'published') return 404

// 3. Проверка capacity
if (event.capacity && registeredCount >= event.capacity) return 400

// 4. Поиск существующего участника
const telegramAccount = await user_telegram_accounts.findOne({
  user_id: user.id,
  org_id: event.org_id
})

let participant = null
if (telegramAccount) {
  participant = await participants.findOne({
    org_id: event.org_id,
    tg_user_id: telegramAccount.telegram_user_id
  })
}

// 5. Создание участника, если не найден
if (!participant) {
  participant = await participants.create({
    org_id: event.org_id,
    tg_user_id: telegramAccount.telegram_user_id,
    full_name: user.email,
    participant_status: 'event_attendee'
  })
}

// 6. Регистрация на событие
await event_registrations.create({
  event_id: eventId,
  participant_id: participant.id,
  status: 'registered'
})
```

## Важные моменты

1. **Telegram авторизация обязательна** для регистрации на любое событие
2. **Участники Telegram групп** автоматически становятся участниками организации при синхронизации
3. **Публичные события** доступны всем, но регистрация требует Telegram
4. **Приватные события** доступны только участникам организации
5. **Дубликаты участников НЕ создаются** - система ищет существующего по `tg_user_id`
6. **Статус `event_attendee`** присваивается новым участникам, созданным при регистрации на событие

## Рекомендации для пользователей

### Для админов:
- Используйте **публичные события** (`is_public = true`) для открытых мероприятий
- Используйте **приватные события** (`is_public = false`) для внутренних мероприятий
- Публикуйте ссылки на публичные события в соцсетях, рассылках, на сайте
- Публикуйте ссылки на приватные события только в Telegram группах организации

### Для участников:
- При переходе по ссылке из Telegram группы **авторизуйтесь через Telegram**
- Ваш Telegram аккаунт будет связан с учетной записью в системе
- После авторизации вы получите доступ к событиям организации
- Регистрация на событие происходит одним кликом

