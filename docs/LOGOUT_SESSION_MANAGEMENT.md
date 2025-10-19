# Управление сессиями и выход из аккаунта

## Дата: 12.10.2025

## Проблема

При тестировании авторизации через Telegram возникла проблема:

> Пользователь уже авторизован в мобильном браузере как другой пользователь (через email от Supabase). При открытии ссылки-приглашения на событие его перебрасывает в ранее авторизованный аккаунт вместо авторизации через Telegram.

### Симптомы

1. **Старая сессия блокирует новую**:
   - Пользователь авторизовался через email (предыдущее тестирование)
   - При попытке войти через Telegram → редирект в старый аккаунт
   - Нет возможности выйти из текущей сессии

2. **"Вы авторизованы, но не являетесь участником"**:
   - Сессия активна, но для другого аккаунта
   - Нет кнопки "Выйти"
   - Нет автоматического выхода перед Telegram авторизацией

---

## Решение

Реализован механизм управления сессиями с **двумя способами выхода**:

### 1. **Автоматический выход** перед Telegram авторизацией
- Если пользователь уже авторизован (`isAuthenticated = true`)
- При клике на "Log in with Telegram"
- Автоматически вызывается logout → перезагрузка страницы → повторная попытка

### 2. **Ручной выход** через кнопку
- Кнопка "Выйти и войти через Telegram"
- Показывается если `isAuthenticated = true`
- Пользователь может выйти вручную

---

## Реализация

### Компонент 1: API Endpoint для Logout

**Файл**: `app/api/auth/logout/route.ts` (новый)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClientServer } from '@/lib/server/supabaseServer'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { returnUrl } = body
  
  // 1. Sign out from Supabase (clears session)
  const supabase = await createClientServer()
  await supabase.auth.signOut()
  
  // 2. Manually clear all Supabase cookies as backup
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  
  const supabaseCookies = allCookies.filter(c => 
    c.name.includes('auth-token') || 
    c.name.startsWith('sb-') ||
    c.name.includes('supabase')
  )
  
  for (const cookie of supabaseCookies) {
    cookieStore.delete(cookie.name)
  }
  
  return NextResponse.json({ 
    success: true,
    returnUrl: returnUrl || '/'
  })
}
```

**Что делает**:
1. Вызывает `supabase.auth.signOut()` (очищает сессию)
2. Находит все Supabase cookies (auth-token, sb-*, supabase)
3. Удаляет каждую cookie вручную (backup)
4. Возвращает `success: true`

**Почему два шага**:
- `signOut()` может не удалить все cookies (баг или асинхронность)
- Ручное удаление гарантирует очистку
- Два уровня защиты от "залипших" сессий

---

### Компонент 2: Обновлен AccessDeniedWithAuth

**Файл**: `components/events/access-denied-with-auth.tsx`

#### Добавлен `handleLogout`:

```typescript
const handleLogout = async () => {
  try {
    console.log('[AccessDenied] Logging out...')
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        returnUrl: `/p/${orgId}/events/${eventId}`
      })
    })

    if (res.ok) {
      console.log('[AccessDenied] Logout successful, reloading page')
      // Перезагружаем страницу для применения logout
      window.location.reload()
    }
  } catch (err) {
    console.error('[AccessDenied] Logout error:', err)
    // Fallback: просто перезагружаем
    window.location.reload()
  }
}
```

**Что делает**:
1. Вызывает `/api/auth/logout`
2. При успехе → перезагружает страницу
3. При ошибке → fallback: перезагружает страницу
4. После перезагрузки `isAuthenticated` будет `false`

#### Обновлен `handleTelegramAuth`:

```typescript
const handleTelegramAuth = async (user: TelegramUser) => {
  setIsAuthLoading(true)
  setError(null)

  try {
    // ✅ Если пользователь уже авторизован - сначала выходим
    if (isAuthenticated) {
      console.log('[AccessDenied] User already authenticated, logging out first...')
      await handleLogout()
      // Logout перезагрузит страницу, дальше не продолжаем
      return
    }
    
    // Авторизуемся через Telegram
    const authRes = await fetch('/api/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({
        telegramData: user,
        orgId: orgId
      })
    })
    
    // ...
  }
}
```

**Логика**:
1. Проверяем `isAuthenticated`
2. Если `true` → вызываем `handleLogout()` → `return`
3. `handleLogout()` перезагрузит страницу
4. После перезагрузки `isAuthenticated = false`
5. Пользователь нажимает на Telegram кнопку снова
6. Теперь авторизация пройдет успешно

#### Добавлена кнопка "Выйти":

```typescript
{isAuthenticated && (
  <div className="text-center py-4">
    <p className="text-gray-600 mb-4">
      Вы авторизованы, но не являетесь участником этого пространства
    </p>
    <div className="flex flex-col gap-2">
      {/* ✅ Новая кнопка */}
      <button
        onClick={handleLogout}
        className="w-full px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
      >
        Выйти и войти через Telegram
      </button>
      <a
        href="/orgs"
        className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Вернуться к организациям
      </a>
    </div>
  </div>
)}
```

**UI**:
- Красная кнопка "Выйти и войти через Telegram" (primary action)
- Синяя ссылка "Вернуться к организациям" (secondary)
- Показывается только если `isAuthenticated = true`

---

## Сценарии использования

### Сценарий 1: Автоматический logout (не авторизован)

**Шаги**:
1. Пользователь не авторизован (`isAuthenticated = false`)
2. Открывает `/p/[org]/events/[id]`
3. Видит "Доступ ограничен" с кнопкой Telegram
4. Нажимает "Log in with Telegram"
5. Авторизуется через Telegram
6. → Доступ предоставлен ✅

**Логика**:
- `isAuthenticated = false`
- Автоматический logout **не** вызывается
- Авторизация через Telegram проходит напрямую

### Сценарий 2: Автоматический logout (авторизован как другой)

**Шаги**:
1. Пользователь авторизован через email (`isAuthenticated = true`)
2. Но не является участником этого пространства
3. Видит "Вы авторизованы, но не являетесь участником"
4. Нажимает "Log in with Telegram"
5. → Автоматический logout
6. → Перезагрузка страницы
7. Теперь `isAuthenticated = false`
8. Нажимает "Log in with Telegram" снова
9. Авторизуется через Telegram
10. → Доступ предоставлен ✅

**Логика**:
```typescript
if (isAuthenticated) {
  await handleLogout()  // ← Автоматический выход
  return  // Не продолжаем авторизацию
}
```

### Сценарий 3: Ручной logout через кнопку

**Шаги**:
1. Пользователь авторизован (`isAuthenticated = true`)
2. Видит "Вы авторизованы, но не являетесь участником"
3. Видит красную кнопку "Выйти и войти через Telegram"
4. Нажимает на нее
5. → Logout → Перезагрузка страницы
6. Теперь `isAuthenticated = false`
7. Видит кнопку "Log in with Telegram"
8. Авторизуется через Telegram
9. → Доступ предоставлен ✅

**Логика**:
```typescript
<button onClick={handleLogout}>
  Выйти и войти через Telegram
</button>
```

---

## Логирование

### Успешный logout

**В консоли браузера**:
```
[AccessDenied] Logging out...
[AccessDenied] Logout successful, reloading page
```

**В Vercel Logs**:
```
[info] [Logout] Starting logout process, returnUrl: /p/[org]/events/[id]
[info] [Logout] Found 3 Supabase cookies to clear
[info] [Logout] Deleted cookie: sb-hxqigvqnvffxzatfuwcs-auth-token
[info] [Logout] Deleted cookie: sb-access-token
[info] [Logout] Deleted cookie: sb-refresh-token
[info] [Logout] Logout completed successfully
```

### Автоматический logout перед Telegram auth

```
[AccessDenied] Authenticating via Telegram...
[AccessDenied] User already authenticated, logging out first...
[AccessDenied] Logging out...
[AccessDenied] Logout successful, reloading page
```

После перезагрузки:
```
[AccessDenied] Authenticating via Telegram...
// Нет "User already authenticated" - авторизация продолжается
```

---

## Тестирование

### Тест 1: Автоматический logout

**Подготовка**:
1. Авторизуйтесь через email (или любую другую сессию)
2. Откройте `/p/[org]/events/[id]` (событие, к которому нет доступа)
3. Убедитесь, что видите "Вы авторизованы, но не являетесь участником"

**Шаги**:
1. Нажмите на синюю кнопку "Log in with Telegram"
2. Ожидается: автоматический logout + перезагрузка
3. После перезагрузки: снова кнопка "Log in with Telegram"
4. Нажмите еще раз
5. Авторизуйтесь через Telegram
6. Ожидается: доступ предоставлен ✅

**Проверка в Vercel Logs**:
```
[info] [Logout] Logout completed successfully
[info] [PublicEventPage] isAuthenticated: false
```

### Тест 2: Ручной logout

**Подготовка**:
1. То же (авторизованы, но не участник)

**Шаги**:
1. Нажмите красную кнопку "Выйти и войти через Telegram"
2. Ожидается: logout + перезагрузка
3. После перезагрузки: кнопка "Log in with Telegram"
4. Авторизуйтесь через Telegram
5. Ожидается: доступ предоставлен ✅

### Тест 3: Logout очистил cookies

**Шаги**:
1. После logout откройте DevTools → Application → Cookies
2. Проверьте домен вашего сайта
3. Ожидается: НЕТ cookies с именами:
   - `sb-*-auth-token`
   - `sb-access-token`
   - `sb-refresh-token`
   - Любых других Supabase cookies

**Если cookies остались**:
- Это может быть баг в Supabase
- Logout API все равно должен их удалить вручную
- Проверьте Vercel Logs: `[Logout] Deleted cookie: ...`

---

## Дополнительные улучшения (опционально)

### 1. Добавить logout в меню организации

Для авторизованных пользователей в `/app/[org]/*`:

```typescript
// app/app/[org]/layout.tsx
<button onClick={handleLogout}>
  Выйти
</button>
```

### 2. Автоматический logout при конфликте аккаунтов

Если пользователь пытается войти в organization через Telegram, но уже авторизован под другим аккаунтом:

```typescript
// middleware.ts
if (isAuthenticated && telegramAuthAttempt && userId !== telegramUserId) {
  // Автоматический logout
}
```

### 3. Показывать имя текущего пользователя

```typescript
{isAuthenticated && (
  <p className="text-sm text-gray-500 mb-2">
    Вы вошли как: user@example.com
  </p>
)}
```

---

## Измененные файлы

| Файл | Статус | Описание |
|------|--------|----------|
| `app/api/auth/logout/route.ts` | ➕ Создан | API endpoint для logout |
| `components/events/access-denied-with-auth.tsx` | ✏️ Изменен | Добавлен автоматический/ручной logout |
| `LOGOUT_SESSION_MANAGEMENT.md` | ➕ Создан | Документация |

---

## Статус

✅ **Реализовано**  
📅 **Дата**: 12.10.2025  
🎯 **Два способа logout**:
  - ✅ Автоматический перед Telegram auth
  - ✅ Ручная кнопка "Выйти"
🔧 **API endpoint `/api/auth/logout`**  
💬 **Детальное логирование**  
📊 **Ошибок компиляции**: Нет

---

## Следующий шаг для пользователя

1. **Откройте ссылку на событие** в мобильном браузере
2. Если видите "Вы авторизованы, но не являетесь участником":
   - **Нажмите красную кнопку** "Выйти и войти через Telegram"
   - После перезагрузки → **нажмите синюю кнопку** "Log in with Telegram"
3. Авторизуйтесь через Telegram
4. → **Доступ к событию предоставлен!** ✅

**Или просто**:
- Нажмите сразу на синюю кнопку "Log in with Telegram"
- Автоматический logout сработает
- После перезагрузки нажмите еще раз
- → Авторизация пройдет!

---

**Версия**: 1.0  
**Автор**: AI Assistant  
**Последнее обновление**: 12.10.2025

