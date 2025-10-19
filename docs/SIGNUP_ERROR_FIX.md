# Fix: Ошибка "Database error finding user" при регистрации

**Проблема:** При попытке зарегистрироваться появляется ошибка "Database error finding user" (500)

**Дата:** 2025-01-20

---

## 🔍 Диагностика

### Шаг 1: Запустите диагностический скрипт

1. Откройте **Supabase SQL Editor**
2. Скопируйте и выполните скрипт `db/DIAGNOSE_SIGNUP_ISSUE.sql`
3. Проверьте результаты в логах

Скрипт проверит:
- ✅ Доступ к `auth.users`
- ✅ RLS политики
- ✅ Зависимые таблицы
- ✅ Views и функции
- ✅ Триггеры на auth.users

### Шаг 2: Проверьте логи Supabase Auth

1. Откройте **Supabase Dashboard**
2. Перейдите в **Logs → Auth Logs**
3. Найдите последние попытки регистрации
4. Проверьте, есть ли детальная информация об ошибке

---

## 🛠️ Возможные причины и решения

### Причина 1: Supabase Auth не настроен для отправки email

**Проверка:**
1. **Supabase Dashboard** → **Authentication** → **Email Templates**
2. Проверьте, настроены ли шаблоны для Magic Link
3. **Settings** → **Auth** → **Email Auth** - должен быть включен

**Решение:**
```
✅ Включить Email Auth в настройках
✅ Настроить SMTP или использовать встроенный Supabase email
✅ Проверить Email Templates (должны быть активны)
```

### Причина 2: Неправильная конфигурация redirect URL

**Проверка:**
1. **Supabase Dashboard** → **Authentication** → **URL Configuration**
2. Проверьте **Site URL** (должен быть `https://app.orbo.ru`)
3. Проверьте **Redirect URLs** (должны включать `https://app.orbo.ru/**`)

**Решение:**

В **Supabase Dashboard** → **Settings** → **Auth** → **URL Configuration**:

```
Site URL: https://app.orbo.ru
Redirect URLs:
  - https://app.orbo.ru/**
  - https://app.orbo.ru/auth-callback
  - http://localhost:3000/** (для локальной разработки)
```

### Причина 3: Проблемы с Email Provider

Если вы настроили Mailgun, но он не работает:

**Проверка:**
1. Проверьте переменные окружения в **Vercel Dashboard**:
   - `MAILGUN_API_KEY`
   - `MAILGUN_DOMAIN`
   - `MAILGUN_FROM_EMAIL`

2. Проверьте, что Mailgun домен верифицирован

**Решение:**

**Вариант A: Использовать встроенный Supabase Email (рекомендуется для тестирования)**

1. **Supabase Dashboard** → **Settings** → **Auth**
2. Убедитесь, что **Enable Email Provider** включен
3. Используйте встроенный Supabase SMTP (по умолчанию)

⚠️ **Важно:** Встроенный Supabase email имеет ограничения:
- Максимум 3 email/час для production
- Для dev неограничено

**Вариант B: Настроить Custom SMTP (Mailgun или другой)**

В **Supabase Dashboard** → **Settings** → **Auth** → **SMTP Settings**:

```
Enable Custom SMTP: ON

Host: smtp.mailgun.org
Port: 587
Username: postmaster@YOUR_DOMAIN
Password: YOUR_MAILGUN_PASSWORD
```

### Причина 4: RLS политики блокируют создание пользователя

**Проверка:**

Выполните в SQL Editor:
```sql
-- Проверяем RLS на auth.users (не должно быть)
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'auth' AND tablename = 'users';
```

**Решение:**

RLS **НЕ должен** быть включен на `auth.users`!

Если RLS включен - отключите:
```sql
ALTER TABLE auth.users DISABLE ROW LEVEL SECURITY;
```

### Причина 5: Триггеры или функции вызывают ошибку

**Проверка:**

```sql
-- Проверяем триггеры на auth.users
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
AND event_object_table = 'users';
```

**Решение:**

Если есть кастомные триггеры на `auth.users`:
1. Временно отключите их
2. Попробуйте зарегистрироваться
3. Если заработало - исправьте логику триггера

```sql
-- Отключить триггер
DROP TRIGGER IF EXISTS trigger_name ON auth.users;
```

### Причина 6: Проблемы с auth schema permissions

**Проверка:**

```sql
-- Проверяем права доступа к auth schema
SELECT * FROM information_schema.role_table_grants
WHERE table_schema = 'auth'
AND table_name = 'users'
AND grantee IN ('anon', 'authenticated', 'service_role');
```

**Решение:**

Убедитесь, что роли имеют правильные права. В **Supabase Dashboard** → **SQL Editor**:

```sql
-- Даём права на auth.users для service_role
GRANT ALL ON auth.users TO service_role;
GRANT ALL ON auth.sessions TO service_role;
GRANT ALL ON auth.identities TO service_role;
```

---

## 🚀 Быстрое решение (если ничего не помогло)

### Вариант 1: Перезапустить Supabase Auth

В **Supabase Dashboard** → **Settings** → **API**:
1. **Reset JWT Secret** (это разлогинит всех пользователей!)
2. Дождитесь завершения операции
3. Попробуйте зарегистрироваться снова

### Вариант 2: Использовать альтернативный метод регистрации

Временно используйте Telegram авторизацию:
1. Настройте Telegram бота (если ещё не настроен)
2. Используйте вход через Telegram
3. Потом привяжите email

### Вариант 3: Создать пользователя вручную

**Только для тестирования!**

1. **Supabase Dashboard** → **Authentication** → **Users**
2. Нажмите **Add user**
3. Введите email и пароль
4. **Auto Confirm User** - включить
5. Создать

Теперь можете войти с этим email через обычный пароль.

---

## 📋 Чек-лист для проверки

- [ ] Supabase Auth включен
- [ ] Email Provider настроен
- [ ] Site URL и Redirect URLs правильные
- [ ] RLS отключен на auth.users
- [ ] Нет ошибок в логах Supabase Auth
- [ ] Диагностический скрипт выполнен
- [ ] Mailgun или SMTP настроен (если используется)
- [ ] Нет блокирующих триггеров на auth.users

---

## 🔗 Полезные ссылки

- **Supabase Auth Docs:** https://supabase.com/docs/guides/auth
- **Magic Link Setup:** https://supabase.com/docs/guides/auth/auth-magic-link
- **Email Templates:** https://supabase.com/docs/guides/auth/auth-email-templates
- **Custom SMTP:** https://supabase.com/docs/guides/auth/auth-smtp

---

## 📞 Если ничего не помогло

1. **Проверьте Vercel логи:**
   ```bash
   vercel logs --prod
   ```

2. **Проверьте Supabase Auth логи:**
   Dashboard → Logs → Auth Logs → Filter by "error"

3. **Проверьте Network в браузере:**
   - Откройте DevTools → Network
   - Попробуйте зарегистрироваться
   - Найдите запрос с ошибкой 500
   - Посмотрите Response

4. **Временное решение:**
   Используйте регистрацию с паролем вместо Magic Link:
   
   ```typescript
   // В signup/page.tsx (временно)
   const { error } = await supabase.auth.signUp({
     email,
     password: 'temporary_password_12345',
     options: {
       emailRedirectTo: `${window.location.origin}/auth-callback`
     }
   })
   ```

---

**Статус:** 🔄 В процессе диагностики  
**Следующий шаг:** Запустить `db/DIAGNOSE_SIGNUP_ISSUE.sql` и проверить результаты

