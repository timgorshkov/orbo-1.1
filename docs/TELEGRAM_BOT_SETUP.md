# Настройка Telegram Bot для авторизации

## Проблема

При переходе участника группы по ссылке на событие показывается:
- ❌ "Bot username required"
- ❌ "Авторизация временно недоступна"

Это означает, что переменная окружения `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` не установлена.

---

## Решение

### Шаг 1: Получите username вашего бота

Ваш бот должен быть уже создан через [@BotFather](https://t.me/BotFather).

**Username бота** - это имя без `@`, например:
- ✅ `orbo_community_bot`
- ✅ `orbo_assistant_bot`
- ❌ `@orbo_community_bot` (неправильно)

### Шаг 2: Установите переменную окружения в Vercel

#### Через Vercel Dashboard:

1. Откройте https://vercel.com
2. Выберите ваш проект `orbo-1-1`
3. Перейдите в **Settings** → **Environment Variables**
4. Нажмите **Add New**
5. Заполните:
   - **Name**: `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
   - **Value**: `orbo_community_bot` (ваш bot username без @)
   - **Environments**: выберите **Production**, **Preview**, **Development**
6. Нажмите **Save**

#### Через Vercel CLI:

```bash
vercel env add NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
```

Введите значение: `orbo_community_bot`

### Шаг 3: Установите локально (для разработки)

Создайте/обновите файл `.env.local` в корне проекта:

```env
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=orbo_community_bot
```

**⚠️ Важно**: Переменные с префиксом `NEXT_PUBLIC_` доступны в браузере (клиенте).

### Шаг 4: Перезапустите приложение

#### В Vercel:
После добавления переменной в Vercel Dashboard нужно **передеплоить проект**:

```bash
# Пуш коммита или
vercel --prod
```

Или через Vercel Dashboard: **Deployments** → **Redeploy** (последний деплой) → **Redeploy**

#### Локально:
```bash
# Остановите dev сервер (Ctrl+C)
npm run dev
```

---

## Проверка

### 1. В браузере (Production)

Откройте консоль разработчика (F12) и выполните:

```javascript
console.log(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME)
```

Должно вывести: `"orbo_community_bot"`

**Если выводит `undefined`**:
- Проверьте, что переменная установлена в Vercel
- Проверьте, что проект передеплоен после установки переменной
- Убедитесь, что имя переменной написано правильно (с префиксом `NEXT_PUBLIC_`)

### 2. В компоненте

Компонент `AccessDeniedWithAuth` теперь проверяет наличие `botUsername`:

```typescript
const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
const isBotConfigured = Boolean(botUsername && botUsername.trim().length > 0)

{!isBotConfigured ? (
  // Показываем ошибку "Авторизация временно недоступна"
  <div className="bg-red-50 border border-red-200">
    Сервис находится в процессе настройки
  </div>
) : (
  // Показываем Telegram Login Widget
  <TelegramLogin botUsername={botUsername!} ... />
)}
```

### 3. Тестирование авторизации

1. Откройте ссылку на событие: `https://app.orbo.ru/p/[org]/events/[id]`
2. Должна появиться кнопка **"Log in with Telegram"** (синяя)
3. Нажмите на кнопку
4. Авторизуйтесь через Telegram
5. Должен произойти редирект и предоставление доступа

**Если кнопка не появляется**:
- Откройте DevTools → Console
- Проверьте наличие ошибок
- Проверьте, что `process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` не `undefined`

---

## Настройка Telegram Bot (если еще не настроен)

### 1. Создание бота

1. Откройте Telegram и найдите [@BotFather](https://t.me/BotFather)
2. Отправьте команду `/newbot`
3. Введите имя бота: `Orbo Community Bot`
4. Введите username: `orbo_community_bot` (должен быть уникальным и заканчиваться на `bot`)
5. Сохраните **Bot Token** (понадобится для `TELEGRAM_BOT_TOKEN`)

### 2. Настройка Domain для Login Widget

**⚠️ Важно**: Telegram Login Widget требует настройки домена.

1. Отправьте команду `/setdomain` в [@BotFather](https://t.me/BotFather)
2. Выберите бота `@orbo_community_bot`
3. Введите домен: `app.orbo.ru` (без https://)

**Для локальной разработки**:
- Telegram не поддерживает `localhost` для Login Widget
- Используйте туннель (ngrok, localtunnel) или тестируйте на production

### 3. Переменные окружения

Для полной работы нужны **две** переменные:

| Переменная | Где используется | Значение | Пример |
|------------|------------------|----------|--------|
| `TELEGRAM_BOT_TOKEN` | Сервер (проверка hash, отправка сообщений) | Token от @BotFather | `1234567890:ABCdefGHI...` |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Клиент (Telegram Login Widget) | Username без @ | `orbo_community_bot` |

**Установка через Vercel CLI**:

```bash
# Server-side (не виден в браузере)
vercel env add TELEGRAM_BOT_TOKEN

# Client-side (виден в браузере)
vercel env add NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
```

**В `.env.local`** (для локальной разработки):

```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=orbo_community_bot
```

---

## Отладка

### Ошибка: "Bot username required"

**Причина**: `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` не установлен или пустой

**Решение**:
1. Проверьте Vercel Environment Variables
2. Убедитесь, что переменная установлена для **Production**
3. Передеплойте проект
4. Очистите кэш браузера (Ctrl+Shift+R)

### Ошибка: "Авторизация временно недоступна"

**Причина**: Та же - отсутствует `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`

**Решение**: См. выше

### Ошибка: "Failed to load widget"

**Причина**: Домен не настроен в @BotFather

**Решение**:
1. Отправьте `/setdomain` в @BotFather
2. Выберите бота
3. Введите домен: `app.orbo.ru`

### Ошибка: "Invalid Telegram authentication"

**Причина**: `TELEGRAM_BOT_TOKEN` (server-side) не совпадает с ботом

**Решение**:
1. Проверьте, что `TELEGRAM_BOT_TOKEN` соответствует боту `@orbo_community_bot`
2. Получите новый token через `/token` в @BotFather (если нужно)

### Кнопка "Log in with Telegram" не появляется

**Возможные причины**:

1. **JavaScript заблокирован** - проверьте расширения браузера
2. **CSP (Content Security Policy)** блокирует `telegram.org`
3. **Скрипт не загружается** - проверьте Network tab в DevTools

**Решение**:
- Откройте DevTools → Console
- Проверьте наличие ошибок загрузки `telegram-widget.js`
- Проверьте, что `botUsername` не пустой

---

## Проверочный чек-лист

### Перед деплоем:

- [ ] Создан Telegram бот через @BotFather
- [ ] Получен Bot Token
- [ ] Получен Bot Username (например, `orbo_community_bot`)
- [ ] Настроен домен через `/setdomain` в @BotFather
- [ ] Установлен `TELEGRAM_BOT_TOKEN` в Vercel (Server)
- [ ] Установлен `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` в Vercel (Client)
- [ ] Проект передеплоен

### После деплоя:

- [ ] Открыта страница события: `/p/[org]/events/[id]`
- [ ] Видна кнопка "Log in with Telegram" (синяя)
- [ ] При клике открывается Telegram OAuth
- [ ] После авторизации происходит редирект
- [ ] Доступ к событию предоставлен

### Проверка в консоли браузера:

```javascript
// Должно вывести username бота
console.log(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME)
// Ожидаем: "orbo_community_bot"

// Не должно быть undefined
if (!process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME) {
  console.error('❌ NEXT_PUBLIC_TELEGRAM_BOT_USERNAME не установлен!')
} else {
  console.log('✅ Bot username настроен:', process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME)
}
```

---

## FAQ

### Q: Можно ли использовать несколько ботов?

**A**: Нет, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` - одна переменная для всего приложения. Но можно использовать один бот для всех организаций.

### Q: Что если я хочу переименовать бота?

**A**: 
1. Создайте нового бота через @BotFather (username нельзя изменить)
2. Обновите `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` в Vercel
3. Обновите `TELEGRAM_BOT_TOKEN` в Vercel
4. Передеплойте проект

### Q: Работает ли авторизация на localhost?

**A**: 
- Telegram Login Widget **не работает** на `localhost`
- Используйте ngrok/localtunnel для тестирования
- Или тестируйте на Vercel Preview/Production

### Q: Нужно ли устанавливать переменную для Development?

**A**: 
- В Vercel: можно установить для Preview/Development
- Локально: используйте `.env.local`
- `.env.local` не коммитится в git (в `.gitignore`)

---

## Итог

После правильной настройки:

✅ Участник группы открывает `/p/[org]/events/[id]`  
✅ Видит страницу "Доступ ограничен" с **кнопкой Telegram**  
✅ Нажимает "Log in with Telegram"  
✅ Авторизуется через Telegram OAuth  
✅ Система проверяет участие в группах  
✅ Создается participant  
✅ Предоставляется доступ к событию  

❌ **Если видит "Bot username required"**:
1. Установите `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` в Vercel
2. Передеплойте проект
3. Очистите кэш браузера

---

**Версия**: 1.0  
**Дата**: 10.10.2025  
**Автор**: AI Assistant

