# 🔧 Исправление Auth Callback (PKCE Flow)

## Проблема
Ошибка при входе через email magic link: `invalid request: both auth code and code verifier should be non-empty`

## Причина
Для email magic links Supabase использует PKCE flow, который требует server-side обработки кода. Старая client-side страница `/auth-callback` пыталась вручную обменять код на сессию без code_verifier.

## Решение
Создан новый **server-side** обработчик `/auth/callback` (Route Handler), который правильно обрабатывает PKCE flow.

## Изменения в коде

### 1. Новый server-side handler
**Файл:** `app/auth/callback/route.ts`
- ✅ Server-side обработка PKCE
- ✅ Автоматический редирект на `/orgs/new` или `/orgs`
- ✅ Правильная работа с cookies через `@supabase/ssr`

### 2. Обновлен redirect URL
**Файл:** `app/(auth)/signin/page.tsx`
```typescript
// Было:
emailRedirectTo: `${window.location.origin}/auth-callback`

// Стало:
emailRedirectTo: `${window.location.origin}/auth/callback`
```

### 3. Обновлен middleware
**Файл:** `middleware.ts`
- Добавлен новый путь `/auth/callback` в публичные маршруты
- Оставлен старый `/auth-callback` для обратной совместимости

## 📋 Что нужно сделать после деплоя

### 1. Обновить Redirect URLs в Supabase Dashboard

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard)
2. Выберите ваш проект
3. Перейдите в **Authentication → URL Configuration**
4. В поле **Redirect URLs** добавьте:
   ```
   https://app.orbo.ru/auth/callback
   ```
5. **НЕ удаляйте** старый URL `https://app.orbo.ru/auth-callback` (для обратной совместимости)
6. Нажмите **Save**

### 2. Проверить работу

1. Откройте https://app.orbo.ru/signin
2. Введите email
3. Проверьте почту и перейдите по ссылке
4. Должен успешно войти и попасть на `/orgs` или `/orgs/new`

## Логи для отладки

В случае проблем проверьте логи Vercel:
- `[Auth Callback] Processing callback:` — начало обработки
- `[Auth Callback] Session created for user:` — успешное создание сессии
- `[Auth Callback] Found X organizations` — найденные организации
- `[Auth Callback] Exchange error:` — ошибка при обмене кода

## Обратная совместимость

Старая страница `/auth-callback` (client-side) оставлена для случаев, если кто-то использует старые ссылки из email. Middleware разрешает доступ к обоим вариантам.

## Важно

После обновления Redirect URLs в Supabase, новые пользователи будут автоматически использовать правильный server-side callback, и ошибка PKCE больше не будет возникать. ✅

