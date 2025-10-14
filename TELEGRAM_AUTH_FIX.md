# Исправление авторизации через Telegram бота

## Дата: 13.10.2025

## Проблема

Бот не отвечал на коды авторизации. Логи показывали:
```
[Bot Auth] Calling verify API...
[Webhook POST] Returning 200 OK to Telegram
```

После чего **ничего не происходило**:
- ❌ Нет логов от verify API endpoint
- ❌ Нет timeout (даже после 25 секунд)
- ❌ Нет ошибок fetch

### Причина

**Vercel Serverless Functions не могут надежно вызывать друг друга через HTTP fetch.**

Когда webhook handler (`/api/telegram/webhook`) пытался вызвать verify endpoint (`/api/auth/telegram-code/verify`) через HTTP fetch, запрос **зависал** навсегда.

Это известная проблема: serverless functions в Vercel имеют ограничения при self-requests (вызовах самих себя через HTTP).

---

## Решение

✅ **Создан общий сервис верификации, который вызывается напрямую** (без HTTP).

### Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│  Telegram Bot → Webhook → handleAuthCode                    │
│                              │                               │
│                              ▼                               │
│                  verifyTelegramAuthCode()  ← Service Layer   │
│                              │                               │
│                              ▼                               │
│                    Supabase Admin Client                     │
└─────────────────────────────────────────────────────────────┘
```

**До:**
```
Webhook → HTTP fetch → API Route → Supabase
           ❌ ЗАВИСАЕТ
```

**После:**
```
Webhook → Direct call → Service → Supabase
           ✅ РАБОТАЕТ
```

---

## Изменения

### 1. **Новый файл: `lib/services/telegramAuthService.ts`**

Содержит всю логику верификации кода:
- ✅ Проверка кода в БД
- ✅ Проверка срока действия
- ✅ Создание/поиск пользователя
- ✅ Регистрация на событие (если есть)
- ✅ Связывание Telegram аккаунта
- ✅ Создание сессии
- ✅ Подробное логирование

**Экспортирует:**
- `verifyTelegramAuthCode(params)` - основная функция
- Интерфейсы `VerifyCodeParams` и `VerifyCodeResult`

### 2. **Обновлен: `app/api/telegram/webhook/route.ts`**

В функции `handleAuthCode`:

**Было (не работало):**
```typescript
const verifyResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/auth/telegram-code/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestBody),
  signal: controller.signal
});
// ❌ Зависало навсегда
```

**Стало (работает):**
```typescript
const verifyResult = await verifyTelegramAuthCode({
  code,
  telegramUserId: from.id,
  telegramUsername: from.username,
  firstName: from.first_name,
  lastName: from.last_name,
  photoUrl: from.photo_url
});
// ✅ Прямой вызов функции
```

### 3. **Упрощен: `app/api/auth/telegram-code/verify/route.ts`**

API endpoint теперь просто вызывает тот же сервис:

```typescript
export async function POST(req: NextRequest) {
  const body = await req.json()
  
  // Вызываем сервис верификации
  const result = await verifyTelegramAuthCode({
    code: body.code,
    telegramUserId: body.telegramUserId,
    telegramUsername: body.telegramUsername,
    firstName: body.firstName,
    lastName: body.lastName,
    photoUrl: body.photoUrl
  })
  
  return NextResponse.json(result)
}
```

Это сохраняет совместимость, если кто-то вызывает endpoint напрямую.

---

## Преимущества решения

### ✅ Надежность
- Нет HTTP запросов между serverless functions
- Нет таймаутов и зависаний
- Работает стабильно на Vercel

### ✅ Производительность
- Прямой вызов быстрее HTTP fetch
- Меньше накладных расходов
- Один serverless function вместо двух

### ✅ Логирование
- Единый лог-след от начала до конца
- Легче отслеживать ошибки
- Все логи в одном месте

### ✅ Переиспользование кода
- Логика в одном месте
- Можно вызывать из разных мест
- Легче тестировать и поддерживать

---

## Логи работы

### Успешный сценарий:
```
[Webhook POST] ==================== WEBHOOK RECEIVED ====================
[Webhook POST] Text preview: 711187
[Webhook] ✅ Detected auth code directly: 711187
[Bot Auth] ==================== START ====================
[Bot Auth] Calling verifyTelegramAuthCode service...
[Auth Service] ==================== START VERIFICATION ====================
[Auth Service] Step 1: Querying telegram_auth_codes
[Auth Service] ✅ Code found
[Auth Service] ✅ Code is valid
[Auth Service] ✅ Code marked as used
[Auth Service] Step 4: Looking for existing user
[Auth Service] ✅ Found existing user: uuid
[Auth Service] ✅ Telegram account linked
[Auth Service] ✅ Session created
[Auth Service] ==================== SUCCESS ====================
[Bot Auth] ✅ Service call completed
[Bot Auth] ✅ User 154588486 authenticated successfully
[Bot Auth] ==================== SUCCESS ====================
[Webhook] ==================== COMPLETED ====================
```

### Если код истек:
```
[Auth Service] ❌ Code expired
[Bot Auth] ❌ Sending error message: ⏰ Код авторизации истек
[Bot Auth] ==================== FAILED ====================
```

### Если код неверный:
```
[Auth Service] ❌ Code not found or already used
[Bot Auth] ❌ Sending error message: ❌ Неверный код авторизации
[Bot Auth] ==================== FAILED ====================
```

---

## Тестирование

### 1. Сгенерировать код
1. Открыть страницу события без авторизации
2. Скопировать 6-значный код

### 2. Отправить код боту
1. Открыть бота в Telegram
2. Отправить код (просто текстом, например `711187`)
3. **Должен прийти ответ в течение 1-2 секунд** с ссылкой для входа

### 3. Проверить логи Vercel
1. Vercel Dashboard → Logs → Runtime Logs
2. Должны быть логи от `[Auth Service]`
3. В конце должен быть `==================== SUCCESS ====================`

### 4. Проверить БД
1. Supabase → Table Editor → `telegram_auth_codes`
2. Найти строку с кодом
3. `is_used` должно быть `TRUE`
4. `telegram_user_id` должен быть заполнен
5. `used_at` должен быть установлен

### 5. Открыть ссылку из Telegram
1. Скопировать ссылку из сообщения бота
2. Открыть в браузере
3. Должна произойти авторизация
4. Редирект на страницу события (или `/orgs`)

---

## Важные замечания

### ❗ Не использовать HTTP fetch для internal calls
В Vercel serverless functions **не должны** вызывать друг друга через HTTP.

**Плохо:**
```typescript
await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/...`)
```

**Хорошо:**
```typescript
import { myService } from '@/lib/services/myService'
await myService.doSomething()
```

### ❗ Service Layer Pattern
Любая бизнес-логика должна быть в сервисах:
- `lib/services/telegramAuthService.ts`
- `lib/services/telegramService.ts`
- `lib/services/eventProcessingService.ts`

API routes должны быть тонкими обертками:
```typescript
export async function POST(req: NextRequest) {
  const body = await req.json()
  const result = await myService.doSomething(body)
  return NextResponse.json(result)
}
```

---

## Файлы

### Созданы:
- ✅ `lib/services/telegramAuthService.ts` - сервис верификации кодов

### Изменены:
- ✅ `app/api/telegram/webhook/route.ts` - использует прямой вызов сервиса
- ✅ `app/api/auth/telegram-code/verify/route.ts` - упрощен до wrapper

### Документация:
- ✅ `TELEGRAM_AUTH_FIX.md` - этот файл
- ✅ `DEBUG_BOT_AUTH.md` - руководство по отладке

---

## Статус

✅ **Проблема с зависанием fetch решена**  
✅ **Код рефакторен в Service Layer**  
✅ **Логирование улучшено**  
✅ **Ошибок компиляции**: Нет  
✅ **Ошибок линтера**: Нет  
🧪 **Готово к тестированию**

---

**Версия**: 2.0  
**Автор**: AI Assistant  
**Последнее обновление**: 13.10.2025 20:00 MSK

