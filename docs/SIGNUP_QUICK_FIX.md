# Быстрое решение проблемы с регистрацией

**Проблема:** "Database error finding user" при регистрации

---

## ⚡ 3-минутное решение

### Шаг 1: Проверьте Supabase Dashboard (2 мин)

1. **Откройте Supabase Dashboard** → ваш проект

2. **Authentication → Providers:**
   - ✅ **Email** должен быть включен
   - Если выключен → включите

3. **Settings → Auth → URL Configuration:**
   ```
   Site URL: https://app.orbo.ru
   
   Redirect URLs (Add URLs):
   https://app.orbo.ru/**
   https://app.orbo.ru/auth-callback
   http://localhost:3000/**
   ```
   
   Нажмите **Save**

4. **Settings → Auth → Email Auth:**
   - ✅ **Enable Email Signup** должен быть включен
   - ✅ **Confirm Email** - можно отключить для тестирования
   - **Email OTP Expiry:** 3600 (1 час)
   
   Нажмите **Save**

### Шаг 2: Проверьте Email Provider (1 мин)

**Вариант A: Встроенный Supabase Email (рекомендуется для dev)**

В **Settings → Auth → SMTP Settings**:
- ⚠️ **Enable Custom SMTP:** OFF (используем встроенный)

**Вариант B: Mailgun (для production)**

В **Settings → Auth → SMTP Settings**:
- ✅ **Enable Custom SMTP:** ON
- **Host:** `smtp.mailgun.org`
- **Port:** `587`
- **Username:** `postmaster@YOUR_MAILGUN_DOMAIN`
- **Password:** `YOUR_MAILGUN_API_KEY`
- **Sender email:** `noreply@YOUR_MAILGUN_DOMAIN`
- **Sender name:** `Orbo`

### Шаг 3: Проверьте Email Templates

**Authentication → Email Templates → Magic Link:**

Должен быть примерно такой:
```html
<h2>Magic Link</h2>
<p>Follow this link to login:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink">Log In</a></p>
```

⚠️ **Важно:** Если вы изменили auth callback путь, обновите ссылку в шаблоне!

---

## 🧪 Тест после настройки

1. Откройте `https://app.orbo.ru/signup` (или localhost)
2. Введите email
3. Нажмите "Зарегистрироваться"
4. Должно показать: "✉️ Отлично! Мы отправили ссылку..."

**Если ошибка всё ещё есть:**
- Откройте браузер DevTools → Network
- Найдите запрос `/auth/v1/otp`
- Посмотрите Response
- Отправьте полный текст ошибки

---

## 🔧 Альтернативное решение

### Если Magic Link не работает → используйте регистрацию с паролем

Временно добавьте регистрацию с паролем в `app/(auth)/signup/page.tsx`:

```typescript
async function onSubmit(e: React.FormEvent) {
  e.preventDefault()
  setLoading(true)
  setMessage(null)
  
  try {
    const supabase = createClientBrowser()
    
    // Временно используем signUp с паролем вместо Magic Link
    const { error } = await supabase.auth.signUp({
      email,
      password: 'TempPass123!', // Временный пароль
      options: {
        emailRedirectTo: `${window.location.origin}/auth-callback`,
        data: {
          email_confirm: true // Автоподтверждение для dev
        }
      }
    })
    
    if (error) {
      setMessage(`Ошибка: ${error.message}`)
    } else {
      setMessage('✉️ Регистрация успешна! Перенаправляем...')
      // Автоматический редирект
      setTimeout(() => {
        window.location.href = '/auth-callback'
      }, 1500)
    }
  } catch (error) {
    setMessage('Произошла ошибка при регистрации')
    console.error(error)
  } finally {
    setLoading(false)
  }
}
```

⚠️ **Это временное решение для тестирования!**

После того как разберётесь с проблемой, верните Magic Link.

---

## 📊 Проверка логов

### В Supabase:
1. **Dashboard → Logs → Auth Logs**
2. Фильтр: `level:error`
3. Смотрите последние ошибки

### В Vercel:
1. **Vercel Dashboard → Logs**
2. Real-time logs
3. Ищите "signup", "auth", "error"

---

## 🎯 Наиболее частые причины

1. **Site URL не совпадает** (например, указан http вместо https)
2. **Redirect URLs не включают ваш домен**
3. **Email Provider не настроен** (встроенный Supabase или SMTP)
4. **Confirm Email включен**, но не работает отправка
5. **Custom SMTP настроен неправильно** (Mailgun credentials)

---

## ✅ После исправления

1. Очистите cookies в браузере (или используйте режим инкогнито)
2. Попробуйте зарегистрироваться снова
3. Проверьте, что email приходит
4. Кликните на ссылку в email
5. Должен произойти редирект на `/auth-callback`
6. Затем на `/orgs` или `/orgs/new`

**Готово!** 🎉

---

## 📞 Если не помогло

Выполните диагностику: `db/DIAGNOSE_SIGNUP_ISSUE.sql`

Или см. полную инструкцию: [`SIGNUP_ERROR_FIX.md`](./SIGNUP_ERROR_FIX.md)

