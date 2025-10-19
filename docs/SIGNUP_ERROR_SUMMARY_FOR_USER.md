# 🔴 Ошибка регистрации: Что делать прямо сейчас

**Проблема:** "Database error finding user" при регистрации  
**Время на решение:** 5-10 минут

---

## ⚡ НАЧНИТЕ С ЭТОГО (5 минут)

### 1. Откройте Supabase Dashboard

**[https://supabase.com/dashboard](https://supabase.com/dashboard)** → ваш проект

### 2. Проверьте URL Configuration

**Settings → Auth → URL Configuration:**

```
Site URL:
https://app.orbo.ru

Redirect URLs (нажмите Add URL для каждого):
https://app.orbo.ru/**
https://app.orbo.ru/auth-callback
http://localhost:3000/**
```

⚠️ **ВАЖНО:** После изменений нажмите **Save**!

### 3. Проверьте Email Provider

**Authentication → Providers:**

- [x] **Email** должен быть **ВКЛЮЧЕН** (зелёный переключатель)

**Settings → Auth → Email Auth:**

- [x] **Enable Email Signup:** ON
- [x] **Confirm Email:** можно выключить для тестирования
- [x] **Enable Email OTP:** ON

Нажмите **Save**

### 4. SMTP Settings

**Settings → Auth → SMTP Settings:**

**Для тестирования (рекомендуется):**
- [ ] **Enable Custom SMTP:** **OFF** (используем встроенный Supabase)

**Для production (если настроили Mailgun):**
- [x] **Enable Custom SMTP:** ON
- Host: `smtp.mailgun.org`
- Port: `587`
- Username: `postmaster@YOUR_DOMAIN`
- Password: (ваш Mailgun API key)

---

## 🧪 Проверка

1. **Очистите cookies** (или откройте режим инкогнито)
2. Откройте **https://app.orbo.ru/signup**
3. Введите email
4. Нажмите "Зарегистрироваться"

**Ожидаемый результат:**
```
✉️ Отлично! Мы отправили ссылку для подтверждения на ваш email.
```

**Если ошибка всё ещё есть** → переходите к Шагу 5

---

## 🔍 Шаг 5: Диагностика (если не помогло)

### A. Проверьте логи в браузере

1. Откройте DevTools (F12)
2. Вкладка **Network**
3. Попробуйте зарегистрироваться
4. Найдите запрос `/auth/v1/otp` (красный, 500 ошибка)
5. Кликните на него → вкладка **Response**
6. **Скопируйте полный текст ошибки** и отправьте мне

### B. Проверьте Supabase Auth Logs

1. **Supabase Dashboard** → **Logs** → **Auth Logs**
2. Фильтр: `level:error`
3. Найдите последнюю попытку регистрации
4. **Скопируйте полный текст ошибки** и отправьте мне

### C. Запустите диагностический SQL скрипт

1. **Supabase SQL Editor**
2. Скопируйте весь код из `db/DIAGNOSE_SIGNUP_ISSUE.sql`
3. Вставьте и нажмите **Run**
4. Посмотрите результаты в Notice/Info панели
5. **Сделайте скриншот** или скопируйте важные Notice и отправьте мне

---

## 🛠️ Временное решение (если совсем не работает)

Пока ищем решение, можете создать тестового пользователя вручную:

### Вариант 1: Создать пользователя в Supabase Dashboard

1. **Supabase Dashboard** → **Authentication** → **Users**
2. Нажмите **Add user** (или **Invite user**)
3. Введите:
   - Email: ваш email
   - Password: любой пароль
   - [x] **Auto Confirm User** - включить
4. Нажмите **Create user**

Теперь войдите на **https://app.orbo.ru/signin** с этим email и паролем.

### Вариант 2: Используйте SQL для создания

В **Supabase SQL Editor**:

```sql
-- Создать тестового пользователя
-- ЗАМЕНИТЕ your-email@example.com на ваш email
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  instance_id,
  aud,
  role,
  raw_app_meta_data,
  raw_user_meta_data
) VALUES (
  gen_random_uuid(),
  'your-email@example.com',
  crypt('TestPassword123!', gen_salt('bf')), -- Пароль: TestPassword123!
  NOW(),
  NOW(),
  NOW(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  '{"provider": "email", "providers": ["email"]}',
  '{}'
)
RETURNING id, email;
```

⚠️ **Важно:** Используйте реальный email, чтобы потом можно было привязать к нему всё остальное.

После создания войдите с паролем `TestPassword123!`

---

## 📋 Чек-лист проверки

Отметьте, что проверили:

- [ ] Site URL правильный (https://app.orbo.ru)
- [ ] Redirect URLs добавлены
- [ ] Email Provider включен
- [ ] Email Auth включен
- [ ] SMTP настроен или отключен Custom SMTP
- [ ] Cookies очищены
- [ ] Проверили Network в DevTools
- [ ] Проверили Supabase Auth Logs
- [ ] Запустили диагностический SQL скрипт

---

## 📞 Что мне отправить, если не помогло

1. **Скриншоты:**
   - Settings → Auth → URL Configuration
   - Authentication → Providers (Email секция)
   - Settings → Auth → SMTP Settings

2. **Текст ошибок:**
   - Из Browser DevTools Network Response
   - Из Supabase Auth Logs

3. **Результаты диагностики:**
   - Скриншот Notice после выполнения `DIAGNOSE_SIGNUP_ISSUE.sql`

---

## 📚 Подробные инструкции

Если хотите разобраться детально:
- **[SIGNUP_QUICK_FIX.md](./SIGNUP_QUICK_FIX.md)** - Пошаговое быстрое решение
- **[SIGNUP_ERROR_FIX.md](./SIGNUP_ERROR_FIX.md)** - Все возможные причины и решения

---

**Начните с Шага 1-4 прямо сейчас! ⏱️ 5 минут**

Если не поможет → выполните Шаг 5 и отправьте мне результаты.

