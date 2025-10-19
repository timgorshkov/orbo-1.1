# Email сервис - Быстрый старт

## 🚀 Установка за 5 минут

### 1. Установите зависимости

```bash
npm install mailgun.js form-data
```

### 2. Получите API ключ Mailgun

1. Войдите в [Mailgun](https://app.mailgun.com)
2. **Settings → API Keys → Private API key**
3. Скопируйте ключ (начинается с `key-...`)

### 3. Получите домен

**Для тестирования (sandbox):**
1. **Sending → Domains**
2. Скопируйте sandbox домен (например: `sandbox12345.mailgun.org`)
3. **⚠️ Важно:** В sandbox можно отправлять только на авторизованные email
4. **Sending → Authorized Recipients → Add Recipient** - добавьте свой email для тестов

**Для продакшена:**
- Настройте свой домен (см. [MAILGUN_SETUP.md](./MAILGUN_SETUP.md))

### 4. Добавьте в .env.local

Создайте файл `.env.local` (если его нет) и добавьте:

```env
MAILGUN_API_KEY=key-your-api-key-here
MAILGUN_DOMAIN=sandbox12345.mailgun.org
MAILGUN_FROM_EMAIL=noreply@sandbox12345.mailgun.org
```

### 5. Перезапустите сервер

```bash
npm run dev
```

---

## ✅ Проверка работы

### Через UI

1. Откройте `http://localhost:3000/settings/profile`
2. Введите email (который вы добавили в Authorized Recipients)
3. Нажмите "Отправить код подтверждения"
4. Проверьте:
   - ✅ Email должен прийти на почту
   - ✅ В консоли: `[EmailService] Email sent successfully`
   - ✅ В dev режиме код также будет в консоли

### Через логи

Откройте консоль и найдите:
```
[EmailService] Verification code sent to your@email.com
[EmailService] Email sent successfully to your@email.com: <message-id>
```

---

## 📧 Какие email отправляются

| Тип | Когда | Содержание |
|-----|-------|-----------|
| **Код верификации** | Админ добавляет email | 6-значный код (15 мин) |
| **Приглашение** | Владелец приглашает нового админа | Ссылка для регистрации (7 дней) |
| **Уведомление** | Владелец добавляет существующего админа | Информация о новой роли |

---

## 🔧 Troubleshooting

### Email не пришёл

1. **Проверьте API ключ:**
   ```bash
   # Должно вернуть список доменов
   curl -u "api:YOUR_API_KEY" https://api.mailgun.net/v3/domains
   ```

2. **Sandbox - добавьте получателя:**
   - Mailgun → **Sending → Authorized Recipients**
   - Add Recipient → введите свой email
   - Подтвердите через письмо

3. **Проверьте логи:**
   - В консоли должно быть `[EmailService] Email sent successfully`
   - Если `[EmailService] Failed to send email` - проверьте API ключ

4. **Проверьте спам:**
   - Письма могут попасть в спам
   - Добавьте `noreply@sandbox...` в контакты

### "Mailgun not configured"

- Проверьте, что все переменные в `.env.local` установлены
- Перезапустите сервер: `Ctrl+C` → `npm run dev`
- Проверьте нет ли опечаток в названиях переменных

### Код не приходит, но в логах "sent successfully"

- Проверьте Mailgun → **Sending → Logs**
- Там будет статус доставки и причина отклонения (если есть)

---

## 📚 Полная документация

Для продакшена и детальной настройки смотрите:
- [MAILGUN_SETUP.md](./MAILGUN_SETUP.md) - полная инструкция
- [TELEGRAM_ADMINS_COMPLETE_SOLUTION.md](./TELEGRAM_ADMINS_COMPLETE_SOLUTION.md) - общая архитектура

---

## 🎯 Следующие шаги

После настройки email:
1. ✅ Протестируйте активацию профиля админа
2. ✅ Протестируйте ручное добавление админа
3. ✅ Настройте продакшн домен (см. MAILGUN_SETUP.md)
4. ✅ Настройте мониторинг доставки писем

---

**Готово!** Теперь система отправляет реальные email вместо логирования кодов в консоль.

