# Отладка авторизации через бота

## Дата: 13.10.2025

## Проблема

Бот не отвечает на коды авторизации:
- Webhook вызывается (видно в логах Vercel)
- В БД код не помечается `is_used=TRUE`
- `telegram_user_id` не заполняется
- Ссылка для входа не отправляется
- Через 11 минут приходит сообщение "Код авторизации истек"

## Добавлено подробное логирование

### 1. Webhook обработка (`app/api/telegram/webhook/route.ts`)

#### Логи получения сообщения:
```
[Webhook] Received text message: { text, from, chat, chatType }
[Webhook] Is auth code? true/false
[Webhook] Pattern test result: true/false
```

#### Логи при обнаружении кода:
```
[Webhook] ✅ Detected auth code directly: CODE
```

#### Логи при обнаружении команды:
```
[Webhook] Detected command: /start
```

#### Логи если не подходит:
```
[Webhook] Message does not match auth code or command pattern
```

### 2. Функция handleAuthCode (`app/api/telegram/webhook/route.ts`)

#### Начало обработки:
```
[Bot Auth] ==================== START ====================
[Bot Auth] Processing auth code: CODE
[Bot Auth] User ID: 123456789
[Bot Auth] Chat ID: 987654321
[Bot Auth] Username: @username
[Bot Auth] API URL: https://your-app.com/api/auth/telegram-code/verify
```

#### Проверка конфигурации:
```
[Bot Auth] ❌ NEXT_PUBLIC_APP_URL is not set!  // Если не установлен
```

#### Запрос к API:
```
[Bot Auth] Request body: { code, telegramUserId, ... }
[Bot Auth] Calling verify API...
[Bot Auth] Verify API response status: 200 OK
[Bot Auth] Verify response data: { success, sessionUrl, ... }
```

#### Результат:
```
[Bot Auth] ✅ User 123456789 authenticated successfully with code CODE
[Bot Auth] ==================== SUCCESS ====================
```

или

```
[Bot Auth] ❌ Sending error message: ...
[Bot Auth] ❌ Failed to verify code CODE: error
[Bot Auth] ==================== FAILED ====================
```

или

```
[Bot Auth] ❌ Exception in handleAuthCode: error
[Bot Auth] Error stack: ...
[Bot Auth] ==================== ERROR ====================
```

### 3. API верификации (`app/api/auth/telegram-code/verify/route.ts`)

#### Получение запроса:
```
[Verify API] ==================== RECEIVED REQUEST ====================
[Verify API] Request body: { code, telegramUserId, ... }
```

#### Проверка обязательных полей:
```
[Verify API] ❌ Missing required fields: { code: false, telegramUserId: false }
```

#### Шаг 1: Поиск кода в БД:
```
[Verify API] Step 1: Querying telegram_auth_codes for code=ABC123, is_used=false
[Verify API] ✅ Code found: { id, org_id, event_id, expires_at, is_used }
```

или

```
[Verify API] ❌ Database error: ...
[Verify API] ❌ Code not found or already used
```

#### Шаг 2: Проверка срока действия:
```
[Verify API] Step 2: Checking expiration - now: 2025-10-13T..., expires: 2025-10-13T...
[Verify API] ✅ Code is valid, time left: 589 seconds
```

или

```
[Verify API] ❌ Code expired
```

#### Шаг 3: Пометка кода как использованного:
```
[Verify API] Step 3: Marking code as used
[Verify API] ✅ Code marked as used
```

или

```
[Verify API] ❌ Error updating code: ...
```

#### Финальный результат:
```
[Verify API] ✅ Code ABC123 verified successfully for user uuid
[Verify API] Session URL generated: https://...
[Verify API] ==================== SUCCESS ====================
```

или

```
[Verify API] ❌ Error verifying code: error
[Verify API] Error stack: ...
[Verify API] ==================== ERROR ====================
```

---

## Что смотреть в логах Vercel

### Сценарий 1: Код не распознается

Если в логах НЕТ строки:
```
[Webhook] ✅ Detected auth code directly: CODE
```

Значит:
- Код не проходит регулярное выражение `/^[0-9A-F]{6}$/i`
- Возможно, в сообщении есть лишние символы (пробелы, переводы строк)
- Проверьте вывод `[Webhook] Received text message: { text: "..." }`

### Сценарий 2: handleAuthCode не вызывается

Если есть строка `[Webhook] ✅ Detected auth code directly:`, но НЕТ:
```
[Bot Auth] ==================== START ====================
```

Значит:
- Функция `handleAuthCode` падает при вызове
- Или `body.message` имеет неправильную структуру
- Проверьте структуру webhook payload

### Сценарий 3: NEXT_PUBLIC_APP_URL не установлен

Если есть строка:
```
[Bot Auth] ❌ NEXT_PUBLIC_APP_URL is not set!
```

Значит:
- Переменная окружения `NEXT_PUBLIC_APP_URL` не установлена в Vercel
- Добавьте её в Environment Variables

### Сценарий 4: API верификации не вызывается

Если есть `[Bot Auth] Calling verify API...`, но НЕТ:
```
[Verify API] ==================== RECEIVED REQUEST ====================
```

Значит:
- `fetch` падает с ошибкой (network error, timeout)
- URL неправильный
- API endpoint не доступен
- Проверьте `[Bot Auth] API URL: ...`

### Сценарий 5: API работает, но код не найден

Если есть:
```
[Verify API] ❌ Code not found or already used
```

Значит:
- Код уже был использован (`is_used=TRUE`)
- Код не существует в БД
- Код не совпадает (регистр, опечатка)
- Проверьте таблицу `telegram_auth_codes` в БД

### Сценарий 6: Код истек

Если есть:
```
[Verify API] ❌ Code expired
```

Значит:
- Прошло больше 10 минут с момента генерации
- Проверьте время: `now:` vs `expires:`
- Это объясняет сообщение через 11 минут

---

## Как тестировать

### Шаг 1: Сгенерировать код
1. Откройте страницу события без авторизации
2. Должен появиться компонент TelegramBotAuth
3. Скопируйте код (например, `A3F7B2`)

### Шаг 2: Отправить код боту
1. Откройте бота в Telegram
2. Отправьте код **одним сообщением** (просто `A3F7B2`, без `/start`)
3. Ждите ответа (должен быть мгновенным)

### Шаг 3: Проверить логи Vercel
1. Откройте Vercel Dashboard → Logs → Runtime Logs
2. Найдите webhook запрос (должен быть timestamp сразу после отправки)
3. Разверните логи и ищите:
   - `[Webhook] Received text message:`
   - `[Webhook] ✅ Detected auth code directly:`
   - `[Bot Auth] ==================== START ====================`
   - `[Bot Auth] Calling verify API...`
   - `[Verify API] ==================== RECEIVED REQUEST ====================`
   - `[Verify API] ✅ Code marked as used`
   - `[Verify API] ==================== SUCCESS ====================`
   - `[Bot Auth] ==================== SUCCESS ====================`

### Шаг 4: Проверить БД
1. Откройте Supabase → Table Editor → `telegram_auth_codes`
2. Найдите строку с вашим кодом
3. Проверьте:
   - `is_used` должно быть `TRUE`
   - `telegram_user_id` должен быть заполнен
   - `used_at` должен быть установлен

---

## Возможные проблемы

### Проблема 1: `NEXT_PUBLIC_APP_URL` не установлен
**Решение:** Добавьте в Vercel Environment Variables:
```
NEXT_PUBLIC_APP_URL=https://app.orbo.ru
```

### Проблема 2: Webhook приходит с задержкой
**Причина:** Telegram может задерживать webhook если endpoint медленно отвечает.

**Решение:** Уже реализовано - webhook отвечает 200 OK мгновенно, обработка в фоне.

### Проблема 3: Код в сообщении с лишними символами
**Пример:** `"A3F7B2\n"` или `" A3F7B2 "`

**Решение:** Уже добавлен `.trim()` в обработку.

### Проблема 4: Telegram отправляет код с lowercase
**Пример:** `a3f7b2` вместо `A3F7B2`

**Решение:** Регулярное выражение использует флаг `i` (case-insensitive) и код приводится к uppercase: `.toUpperCase()`.

### Проблема 5: Бот не получает личные сообщения
**Причина:** Бот должен быть запущен пользователем.

**Решение:** Пользователь должен сначала нажать "Открыть бота" или отправить `/start`.

---

## Что делать дальше

1. **Отправьте новый код боту**
2. **Сразу проверьте Vercel Logs**
3. **Найдите строку с вашим telegram user ID**
4. **Скопируйте все логи от `[Webhook] Received text message` до `SUCCESS` или `ERROR`**
5. **Отправьте логи для анализа**

Это позволит точно определить, на каком этапе происходит сбой.

---

## Статус

✅ **Добавлено подробное логирование**  
✅ **Ошибок компиляции**: Нет  
✅ **Ошибок линтера**: Нет  
🔍 **Готово к отладке**

Следующий шаг - тестирование с просмотром логов.

---

**Версия**: 1.0  
**Автор**: AI Assistant  
**Последнее обновление**: 13.10.2025

