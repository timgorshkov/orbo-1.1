# Настройка Mailgun для отправки Email

## Обзор

Mailgun используется для отправки email в Orbo:
- Коды верификации для активации профилей админов
- Приглашения новых администраторов
- Уведомления о добавлении в команду

---

## Шаг 1: Регистрация в Mailgun

1. Перейдите на [mailgun.com](https://mailgun.com)
2. Создайте аккаунт
3. Подтвердите email

---

## Шаг 2: Получение API ключа

1. Перейдите в **Settings → API Keys**
2. Скопируйте **Private API key**
3. Сохраните в `.env.local`:
   ```
   MAILGUN_API_KEY=your-api-key-here
   ```

---

## Шаг 3: Настройка домена

### Вариант A: Использование Sandbox домена (для тестирования)

1. В Mailgun перейдите в **Sending → Domains**
2. Используйте sandbox домен (формат: `sandbox12345.mailgun.org`)
3. Добавьте в `.env.local`:
   ```
   MAILGUN_DOMAIN=sandbox12345.mailgun.org
   ```
4. **⚠️ Важно:** В sandbox режиме можно отправлять только на **авторизованные email**
5. Добавьте получателей: **Sending → Authorized Recipients**

### Вариант B: Настройка собственного домена (для продакшена)

1. В Mailgun перейдите в **Sending → Domains → Add New Domain**
2. Введите ваш домен (например, `mg.yourdomain.com`)
3. Mailgun предоставит DNS записи для настройки:
   - **TXT** запись для SPF
   - **TXT** запись для DKIM
   - **CNAME** запись для tracking
   - **MX** записи (если нужна входящая почта)

4. Добавьте эти записи в DNS вашего домена (через Cloudflare, Route53, и т.д.)
5. Дождитесь верификации (может занять до 24 часов)
6. Добавьте в `.env.local`:
   ```
   MAILGUN_DOMAIN=mg.yourdomain.com
   ```

---

## Шаг 4: Настройка отправителя

Добавьте в `.env.local`:
```
MAILGUN_FROM_EMAIL=noreply@yourdomain.com
```

**Для sandbox:** используйте `noreply@sandbox12345.mailgun.org`  
**Для prod:** используйте ваш домен `noreply@mg.yourdomain.com`

---

## Шаг 5: Установка зависимостей

```bash
npm install mailgun.js form-data
```

---

## Шаг 6: Проверка настройки

### Через UI

1. Запустите приложение: `npm run dev`
2. Перейдите в `/settings/profile`
3. Попробуйте добавить email
4. Проверьте:
   - В **dev режиме** код будет также в логах консоли
   - Email должен прийти на указанный адрес

### Через API

```bash
curl -X POST http://localhost:3000/api/auth/activate-profile \
  -H "Content-Type: application/json" \
  -d '{
    "action": "send_code",
    "email": "test@example.com"
  }'
```

### Проверка логов

```bash
# В консоли должно быть:
[EmailService] Email sent successfully to test@example.com: <message-id>

# Или в случае ошибки:
[EmailService] Failed to send email: <error>
```

---

## Полный пример .env.local

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Telegram
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_NOTIFICATIONS_BOT_TOKEN=9876543210:ZYXwvuTSRqponMLKJihgFEdcba

# Mailgun
MAILGUN_API_KEY=key-1234567890abcdef1234567890abcdef
MAILGUN_DOMAIN=sandbox12345.mailgun.org
MAILGUN_FROM_EMAIL=noreply@sandbox12345.mailgun.org

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

---

## Типы отправляемых писем

### 1. Код верификации

**Триггер:** Админ добавляет email в `/settings/profile`  
**Шаблон:** `emailService.sendVerificationCode()`  
**Содержит:**
- 6-значный код
- Срок действия: 15 минут
- Инструкции по вводу кода

### 2. Приглашение администратора

**Триггер:** Владелец приглашает нового админа (email не зарегистрирован)  
**Шаблон:** `emailService.sendAdminInvitation()`  
**Содержит:**
- Ссылку для принятия приглашения
- Имя организации и пригласившего
- Описание прав администратора
- Срок действия: 7 дней

### 3. Уведомление о добавлении

**Триггер:** Владелец добавляет существующего пользователя как админа  
**Шаблон:** `emailService.sendAdminNotification()`  
**Содержит:**
- Название организации
- Ссылку в приложение
- Информацию о правах

---

## Troubleshooting

### Проблема: Email не отправляются

**Решение:**
1. Проверьте API ключ:
   ```bash
   curl -v https://api.mailgun.net/v3/domains \
     -u "api:YOUR_API_KEY"
   ```
2. Проверьте домен активен в Mailgun
3. Убедитесь, что DNS записи настроены (для prod)
4. Для sandbox: проверьте, что получатель в Authorized Recipients

### Проблема: Письма попадают в спам

**Решение:**
1. Настройте SPF и DKIM записи
2. Добавьте DMARC запись:
   ```
   _dmarc.yourdomain.com TXT "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"
   ```
3. "Прогрейте" домен, отправляя небольшие объёмы
4. Попросите пользователей добавить отправителя в whitelist

### Проблема: "Mailgun not configured" в логах

**Решение:**
- Убедитесь, что все переменные окружения установлены
- Перезапустите сервер после изменения .env
- Проверьте, что .env.local загружается (не .env)

### Проблема: Rate limit exceeded

**Решение:**
- Бесплатный план: 5,000 писем/месяц
- Для продакшена: обновите план в Mailgun
- Добавьте rate limiting в API endpoints

---

## Мониторинг

### Mailgun Dashboard

1. **Sending → Logs** - история отправленных писем
2. **Analytics** - статистика доставки, открытий, кликов
3. **Suppressions** - список заблокированных адресов

### Application Logs

```javascript
// В коде добавлены логи:
console.log('[EmailService] Email sent successfully to...')
console.error('[EmailService] Failed to send email:...')
```

### Метрики для отслеживания

- Delivery rate (должен быть >95%)
- Bounce rate (должен быть <5%)
- Complaint rate (должен быть <0.1%)

---

## Security Best Practices

1. ✅ **Никогда не коммитьте** API ключи в git
2. ✅ Используйте `.env.local` (не `.env`)
3. ✅ В production используйте переменные окружения сервера (Vercel, Railway, etc.)
4. ✅ Регулярно ротируйте API ключи
5. ✅ Используйте отдельные ключи для dev/staging/prod
6. ✅ Ограничьте IP адреса для API ключей (в Mailgun Settings)

---

## Production Checklist

- [ ] Настроен собственный домен (не sandbox)
- [ ] DNS записи верифицированы
- [ ] SPF, DKIM, DMARC настроены
- [ ] Email шаблоны протестированы
- [ ] Rate limiting добавлен
- [ ] Мониторинг настроен
- [ ] Backup план (альтернативный email provider)
- [ ] Unsubscribe ссылки добавлены (если требуется)

---

## Альтернативы Mailgun

Если Mailgun не подходит, можно использовать:
- **SendGrid** - популярная альтернатива
- **Amazon SES** - дешевле для больших объёмов
- **Postmark** - фокус на transactional emails
- **Resend** - современный API

---

**Автор:** AI Assistant  
**Дата:** 2025-10-19  
**Статус:** ✅ Готово к использованию

