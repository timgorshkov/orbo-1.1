# Решение ошибки регистрации "Database error finding user"

**Статус:** 🔍 Диагностика готова  
**Дата:** 2025-01-20

---

## 📋 Что нужно сделать

### 1️⃣ Быстрая проверка (3 минуты)

Следуйте инструкциям в **[`SIGNUP_QUICK_FIX.md`](./SIGNUP_QUICK_FIX.md)**

Проверьте в Supabase Dashboard:
- ✅ Email Provider включен
- ✅ Site URL правильный (`https://app.orbo.ru`)
- ✅ Redirect URLs добавлены
- ✅ Email Auth включен

### 2️⃣ Диагностика (5 минут)

Если быстрое решение не помогло:

1. **Выполните SQL скрипт:**
   - Откройте Supabase SQL Editor
   - Скопируйте и выполните `db/DIAGNOSE_SIGNUP_ISSUE.sql`
   - Проверьте результаты в Notice/Info логах

2. **Проверьте Supabase Auth Logs:**
   - Dashboard → Logs → Auth Logs
   - Найдите последнюю попытку регистрации
   - Скопируйте полный текст ошибки

3. **Проверьте Browser Network:**
   - DevTools → Network
   - Попробуйте зарегистрироваться
   - Найдите запрос `/auth/v1/otp` с 500 ошибкой
   - Посмотрите Response body

### 3️⃣ Детальное исправление (10-30 минут)

Если диагностика показала проблемы:

Следуйте инструкциям в **[`SIGNUP_ERROR_FIX.md`](./SIGNUP_ERROR_FIX.md)**

---

## 🎯 Наиболее вероятные причины

### Причина 1: Supabase URL Configuration (90%)

**Проблема:** Site URL или Redirect URLs не совпадают с вашим доменом

**Решение:**
```
Supabase Dashboard → Settings → Auth → URL Configuration

Site URL: https://app.orbo.ru
Redirect URLs: https://app.orbo.ru/**
```

### Причина 2: Email Provider не настроен (5%)

**Проблема:** Supabase не может отправить Magic Link

**Решение:**
- Для dev: Используйте встроенный Supabase Email
- Для prod: Настройте Custom SMTP (Mailgun)

### Причина 3: Auth Template неправильный (3%)

**Проблема:** Ссылка в email не работает

**Решение:**
```
Dashboard → Authentication → Email Templates → Magic Link

Проверьте, что ссылка правильная:
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink
```

### Причина 4: RLS или Triggers (2%)

**Проблема:** Какой-то триггер или RLS политика блокирует создание пользователя

**Решение:**
- Выполните диагностический скрипт
- Проверьте, есть ли триггеры на `auth.users`
- Проверьте, не включен ли RLS на `auth.users` (не должен!)

---

## 🚀 Временное решение

Пока вы разбираетесь с проблемой, можете использовать регистрацию с паролем вместо Magic Link.

См. код в **[`SIGNUP_QUICK_FIX.md`](./SIGNUP_QUICK_FIX.md)** → раздел "Альтернативное решение"

---

## 📊 Что предоставить для помощи

Если не можете решить проблему самостоятельно, предоставьте:

1. **Результаты диагностического скрипта** (`db/DIAGNOSE_SIGNUP_ISSUE.sql`)
2. **Логи из Supabase Auth Logs** (последние 5 записей с ошибкой)
3. **Network Response** (из Browser DevTools)
4. **Скриншот настроек:**
   - Settings → Auth → URL Configuration
   - Authentication → Providers (Email)
   - Settings → Auth → SMTP Settings (если используется)

---

## ✅ После решения

1. **Очистите cookies** в браузере
2. **Попробуйте зарегистрироваться:**
   - Введите email
   - Нажмите "Зарегистрироваться"
   - Должно показать: "✉️ Отлично! Мы отправили ссылку..."
3. **Проверьте email:**
   - Должно прийти письмо с темой "Magic Link"
   - Кликните на ссылку
4. **Проверьте редирект:**
   - Должен произойти редирект на `/auth-callback`
   - Затем на `/orgs/new` (для нового пользователя)
5. **Создайте организацию** и протестируйте основной функционал

**Готово!** 🎉

---

## 📚 Дополнительные ресурсы

- **[SIGNUP_QUICK_FIX.md](./SIGNUP_QUICK_FIX.md)** - Быстрое решение (3 минуты)
- **[SIGNUP_ERROR_FIX.md](./SIGNUP_ERROR_FIX.md)** - Детальное руководство
- **[db/DIAGNOSE_SIGNUP_ISSUE.sql](../db/DIAGNOSE_SIGNUP_ISSUE.sql)** - Диагностический скрипт
- **[Supabase Auth Docs](https://supabase.com/docs/guides/auth)** - Официальная документация
- **[Magic Link Setup](https://supabase.com/docs/guides/auth/auth-magic-link)** - Настройка Magic Link

---

## 🔄 Статус обновлений

- [x] Создан диагностический скрипт
- [x] Создано руководство по быстрому исправлению
- [x] Создано детальное руководство
- [ ] Проверена конфигурация Supabase
- [ ] Выполнена диагностика
- [ ] Проблема решена

---

**Следующий шаг:** Откройте [`SIGNUP_QUICK_FIX.md`](./SIGNUP_QUICK_FIX.md) и выполните 3-минутную проверку

