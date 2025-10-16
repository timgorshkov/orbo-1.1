# 📧 HTML Email Templates для Supabase

Эти шаблоны нужно настроить в **Supabase Dashboard** → **Authentication** → **Email Templates**.

## 🔧 Где настроить:
1. Откройте [Supabase Dashboard](https://supabase.com/dashboard)
2. Выберите проект
3. Перейдите в **Authentication** → **Email Templates**
4. Скопируйте соответствующий шаблон для каждого типа письма

---

## 1. 🔗 Magic Link (Вход по ссылке)

**Название в Supabase:** `Confirm signup` или `Magic Link`

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Вход в Orbo</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #0088FF 0%, #0066CC 50%, #7B3FF2 100%);
      padding: 40px 30px;
      text-align: center;
    }
    .logo {
      font-size: 32px;
      font-weight: bold;
      color: #ffffff;
      margin: 0;
    }
    .content {
      padding: 40px 30px;
    }
    .title {
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 16px 0;
      color: #1e293b;
    }
    .text {
      font-size: 16px;
      line-height: 1.6;
      color: #475569;
      margin: 0 0 24px 0;
    }
    .button {
      display: inline-block;
      padding: 16px 32px;
      background: linear-gradient(135deg, #0088FF 0%, #7B3FF2 100%);
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 16px 0;
    }
    .features {
      background-color: #f1f5f9;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
    }
    .feature-item {
      display: flex;
      align-items: start;
      margin: 12px 0;
      font-size: 14px;
      color: #475569;
    }
    .check-icon {
      color: #0088FF;
      margin-right: 8px;
      font-size: 18px;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 30px;
      text-align: center;
      font-size: 13px;
      color: #64748b;
    }
    .footer a {
      color: #0088FF;
      text-decoration: none;
    }
    .divider {
      height: 1px;
      background-color: #e2e8f0;
      margin: 24px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="logo">Orbo</h1>
    </div>
    
    <div class="content">
      <h2 class="title">🎉 Вход в Orbo</h2>
      <p class="text">
        Привет!<br><br>
        Вы запросили ссылку для входа в вашу учётную запись Orbo. Нажмите кнопку ниже, чтобы войти:
      </p>
      
      <div style="text-align: center;">
        <a href="{{ .ConfirmationURL }}" class="button">
          🔓 Войти в Orbo
        </a>
      </div>
      
      <p class="text" style="font-size: 14px; color: #64748b; margin-top: 24px;">
        Ссылка действительна в течение 1 часа. Если вы не запрашивали вход, просто проигнорируйте это письмо.
      </p>

      <div class="divider"></div>

      <div class="features">
        <p style="margin: 0 0 12px 0; font-weight: 600; color: #1e293b;">
          Что вы можете делать в Orbo:
        </p>
        <div class="feature-item">
          <span class="check-icon">✓</span>
          <span>Управлять профилями участников Telegram-сообществ</span>
        </div>
        <div class="feature-item">
          <span class="check-icon">✓</span>
          <span>Создавать базу знаний и материалы</span>
        </div>
        <div class="feature-item">
          <span class="check-icon">✓</span>
          <span>Организовывать события с QR-чекином</span>
        </div>
        <div class="feature-item">
          <span class="check-icon">✓</span>
          <span>Отслеживать активность и удержание</span>
        </div>
      </div>
    </div>
    
    <div class="footer">
      <p>
        © 2025 Orbo. Управление Telegram-сообществом<br>
        <a href="https://orbo.ru">orbo.ru</a> • <a href="https://app.orbo.ru">Открыть приложение</a>
      </p>
    </div>
  </div>
</body>
</html>
```

---

## 2. ✉️ Email Confirmation (Подтверждение регистрации)

**Название в Supabase:** `Confirm signup`

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Добро пожаловать в Orbo</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #0088FF 0%, #0066CC 50%, #7B3FF2 100%);
      padding: 40px 30px;
      text-align: center;
    }
    .logo {
      font-size: 32px;
      font-weight: bold;
      color: #ffffff;
      margin: 0 0 8px 0;
    }
    .tagline {
      color: rgba(255, 255, 255, 0.9);
      font-size: 14px;
      margin: 0;
    }
    .content {
      padding: 40px 30px;
    }
    .title {
      font-size: 28px;
      font-weight: 700;
      margin: 0 0 16px 0;
      color: #1e293b;
    }
    .text {
      font-size: 16px;
      line-height: 1.6;
      color: #475569;
      margin: 0 0 24px 0;
    }
    .button {
      display: inline-block;
      padding: 18px 36px;
      background: linear-gradient(135deg, #0088FF 0%, #7B3FF2 100%);
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 18px;
      margin: 24px 0;
      box-shadow: 0 4px 12px rgba(0, 136, 255, 0.3);
    }
    .steps {
      background: linear-gradient(135deg, #f0f9ff 0%, #f5f3ff 100%);
      border-radius: 8px;
      padding: 24px;
      margin: 32px 0;
    }
    .step {
      display: flex;
      align-items: start;
      margin: 16px 0;
    }
    .step-number {
      background: linear-gradient(135deg, #0088FF 0%, #7B3FF2 100%);
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      margin-right: 16px;
      flex-shrink: 0;
    }
    .step-content {
      flex: 1;
    }
    .step-title {
      font-weight: 600;
      color: #1e293b;
      margin: 0 0 4px 0;
    }
    .step-text {
      font-size: 14px;
      color: #64748b;
      margin: 0;
    }
    .highlight-box {
      background-color: #ecfdf5;
      border-left: 4px solid #10b981;
      padding: 16px;
      border-radius: 4px;
      margin: 24px 0;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 30px;
      text-align: center;
      font-size: 13px;
      color: #64748b;
    }
    .footer a {
      color: #0088FF;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="logo">🎉 Orbo</h1>
      <p class="tagline">Управление Telegram-сообществом</p>
    </div>
    
    <div class="content">
      <h2 class="title">Добро пожаловать в Orbo!</h2>
      <p class="text">
        Рады видеть вас! 👋<br><br>
        Вы создали аккаунт в Orbo — платформе для управления Telegram-сообществами. 
        Подтвердите ваш email, чтобы начать работу:
      </p>
      
      <div style="text-align: center;">
        <a href="{{ .ConfirmationURL }}" class="button">
          🚀 Подтвердить email и начать
        </a>
      </div>

      <div class="highlight-box">
        <p style="margin: 0; font-weight: 600; color: #065f46;">
          💡 Бесплатный план до 50 участников
        </p>
        <p style="margin: 4px 0 0 0; font-size: 14px; color: #047857;">
          Без миграций чатов. Интеграция за 2 минуты.
        </p>
      </div>

      <div class="steps">
        <p style="margin: 0 0 16px 0; font-weight: 600; color: #1e293b; font-size: 16px;">
          Что дальше:
        </p>
        <div class="step">
          <div class="step-number">1</div>
          <div class="step-content">
            <p class="step-title">Подтвердите email</p>
            <p class="step-text">Нажмите кнопку выше, чтобы активировать аккаунт</p>
          </div>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <div class="step-content">
            <p class="step-title">Создайте организацию</p>
            <p class="step-text">Настройте пространство для вашего сообщества</p>
          </div>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <div class="step-content">
            <p class="step-title">Подключите Telegram-чат</p>
            <p class="step-text">Добавьте бота в вашу группу — всё готово!</p>
          </div>
        </div>
      </div>

      <p class="text" style="font-size: 13px; color: #64748b; margin-top: 32px;">
        Ссылка действительна в течение 24 часов. Если вы не регистрировались в Orbo, проигнорируйте это письмо.
      </p>
    </div>
    
    <div class="footer">
      <p>
        © 2025 Orbo. Управление Telegram-сообществом<br>
        <a href="https://orbo.ru">orbo.ru</a> • <a href="https://app.orbo.ru">Открыть приложение</a>
      </p>
      <p style="margin-top: 12px; font-size: 12px;">
        Если кнопка не работает, скопируйте эту ссылку:<br>
        <span style="color: #94a3b8; word-break: break-all;">{{ .ConfirmationURL }}</span>
      </p>
    </div>
  </div>
</body>
</html>
```

---

## 3. 👥 Invite User (Приглашение пользователя)

**Название в Supabase:** `Invite user`

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Приглашение в Orbo</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #0088FF 0%, #0066CC 50%, #7B3FF2 100%);
      padding: 40px 30px;
      text-align: center;
    }
    .logo {
      font-size: 32px;
      font-weight: bold;
      color: #ffffff;
      margin: 0;
    }
    .content {
      padding: 40px 30px;
    }
    .title {
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 16px 0;
      color: #1e293b;
    }
    .text {
      font-size: 16px;
      line-height: 1.6;
      color: #475569;
      margin: 0 0 24px 0;
    }
    .button {
      display: inline-block;
      padding: 16px 32px;
      background: linear-gradient(135deg, #0088FF 0%, #7B3FF2 100%);
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 16px 0;
    }
    .invite-box {
      background: linear-gradient(135deg, #f0f9ff 0%, #f5f3ff 100%);
      border: 2px solid #bfdbfe;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
      text-align: center;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 30px;
      text-align: center;
      font-size: 13px;
      color: #64748b;
    }
    .footer a {
      color: #0088FF;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="logo">Orbo</h1>
    </div>
    
    <div class="content">
      <h2 class="title">👥 Вас пригласили в организацию</h2>
      <p class="text">
        Привет!<br><br>
        Вас пригласили присоединиться к организации в Orbo — платформе для управления Telegram-сообществами.
      </p>

      <div class="invite-box">
        <p style="margin: 0; font-size: 14px; color: #475569;">Приглашение от:</p>
        <p style="margin: 8px 0; font-size: 20px; font-weight: 700; color: #1e293b;">
          {{ .SiteURL }}
        </p>
      </div>
      
      <p class="text">
        Нажмите кнопку ниже, чтобы принять приглашение и создать аккаунт:
      </p>
      
      <div style="text-align: center;">
        <a href="{{ .ConfirmationURL }}" class="button">
          🎉 Принять приглашение
        </a>
      </div>
      
      <p class="text" style="font-size: 14px; color: #64748b; margin-top: 24px;">
        Ссылка действительна в течение 24 часов. Если вы не ожидали этого приглашения, просто проигнорируйте это письмо.
      </p>
    </div>
    
    <div class="footer">
      <p>
        © 2025 Orbo. Управление Telegram-сообществом<br>
        <a href="https://orbo.ru">orbo.ru</a> • <a href="https://app.orbo.ru">Открыть приложение</a>
      </p>
    </div>
  </div>
</body>
</html>
```

---

## 4. 🔐 Password Reset (Сброс пароля)

**Название в Supabase:** `Reset password`

**Примечание:** Orbo использует passwordless auth (вход без пароля), но на всякий случай:

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Сброс пароля Orbo</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #0088FF 0%, #0066CC 50%, #7B3FF2 100%);
      padding: 40px 30px;
      text-align: center;
    }
    .logo {
      font-size: 32px;
      font-weight: bold;
      color: #ffffff;
      margin: 0;
    }
    .content {
      padding: 40px 30px;
    }
    .title {
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 16px 0;
      color: #1e293b;
    }
    .text {
      font-size: 16px;
      line-height: 1.6;
      color: #475569;
      margin: 0 0 24px 0;
    }
    .button {
      display: inline-block;
      padding: 16px 32px;
      background: linear-gradient(135deg, #0088FF 0%, #7B3FF2 100%);
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 16px 0;
    }
    .warning {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 16px;
      border-radius: 4px;
      margin: 24px 0;
      font-size: 14px;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 30px;
      text-align: center;
      font-size: 13px;
      color: #64748b;
    }
    .footer a {
      color: #0088FF;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="logo">Orbo</h1>
    </div>
    
    <div class="content">
      <h2 class="title">🔐 Сброс пароля</h2>
      <p class="text">
        Вы запросили сброс пароля для вашей учётной записи Orbo.<br><br>
        Нажмите кнопку ниже, чтобы установить новый пароль:
      </p>
      
      <div style="text-align: center;">
        <a href="{{ .ConfirmationURL }}" class="button">
          🔑 Сбросить пароль
        </a>
      </div>

      <div class="warning">
        <p style="margin: 0; font-weight: 600; color: #92400e;">⚠️ Важно:</p>
        <p style="margin: 4px 0 0 0; color: #78350f;">
          Если вы не запрашивали сброс пароля, проигнорируйте это письмо. Ваш текущий пароль останется без изменений.
        </p>
      </div>
      
      <p class="text" style="font-size: 14px; color: #64748b; margin-top: 24px;">
        Ссылка действительна в течение 1 часа.
      </p>
    </div>
    
    <div class="footer">
      <p>
        © 2025 Orbo. Управление Telegram-сообществом<br>
        <a href="https://orbo.ru">orbo.ru</a> • <a href="https://app.orbo.ru">Открыть приложение</a>
      </p>
    </div>
  </div>
</body>
</html>
```

---

## 📝 Переменные Supabase

В шаблонах используются эти переменные:

- `{{ .ConfirmationURL }}` — ссылка для подтверждения/входа
- `{{ .Token }}` — токен (если нужен отдельно)
- `{{ .SiteURL }}` — базовый URL приложения
- `{{ .TokenHash }}` — хэш токена

---

## 🎨 Дополнительные настройки Supabase

### Email Subject (Темы писем)

В Supabase Dashboard также можно настроить темы писем:

1. **Magic Link**: `🔓 Ссылка для входа в Orbo`
2. **Confirm Signup**: `🎉 Добро пожаловать в Orbo! Подтвердите email`
3. **Invite User**: `👥 Приглашение в организацию Orbo`
4. **Reset Password**: `🔐 Сброс пароля Orbo`

---

## ✅ Чек-лист настройки

- [ ] Зайти в Supabase Dashboard
- [ ] Authentication → Email Templates
- [ ] Скопировать HTML для каждого шаблона
- [ ] Настроить темы писем (Subject)
- [ ] Отправить тестовое письмо себе
- [ ] Проверить отображение на десктопе и мобильном

---

## 🔍 Тестирование

После настройки протестируйте:

1. **Регистрацию** на `/signup`
2. **Вход** на `/signin`
3. Проверьте письма в **Gmail**, **Yandex**, **Mail.ru**
4. Проверьте мобильную версию писем

---

**Готово!** 🎉 Теперь ваши email-письма брендированы и выглядят профессионально.

