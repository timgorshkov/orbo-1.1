# 📱 Исследование Telegram MiniApp для событий

**Дата:** 19 декабря 2025  
**Статус:** В работе  
**Цель:** Реализовать регистрацию на события через Telegram MiniApp

---

## 🔍 РЕФЕРЕНС: @invites_tgbot

**URL:** https://t.me/invites_tgbot?startapp=e-51

### Что делает
- Позволяет создавать события прямо в Telegram
- Регистрация участников через MiniApp
- Без необходимости выхода из Telegram

### Deep Link формат
```
t.me/{bot_username}?startapp={payload}

Примеры:
t.me/invites_tgbot?startapp=e-51       # Событие с ID 51
t.me/orbo_event_bot?startapp=e-{uuid}  # Наш формат
```

### UX особенности
- [ ] Изучить flow регистрации
- [ ] Отметить удачные UI решения
- [ ] Понять структуру payload

---

## 📐 АРХИТЕКТУРА ДЛЯ ORBO

### Вариант A: Единый бот @orbo_event_bot (рекомендуется для MVP)

```
Плюсы:
+ Простая настройка — один бот на все организации
+ Быстрая реализация
+ Единая точка входа

Минусы:
- Нет кастомизации под бренд организации
- Все события под одним ботом
```

**Формат ссылки:**
```
t.me/orbo_event_bot?startapp=e-{eventId}
```

### Вариант B: Кастомный бот на организацию (v2)

```
Плюсы:
+ Полная кастомизация (имя, аватар, описание)
+ Бренд организации
+ Можно использовать для других MiniApps

Минусы:
- Сложнее в реализации
- Нужен UI создания ботов
- Хранение токенов ботов
```

**Формат ссылки:**
```
t.me/{org_custom_bot}?startapp=e-{eventId}
```

---

## 🔧 TELEGRAM WEBAPP API

### Инициализация
```typescript
// В MiniApp (клиент)
import WebApp from '@twa-dev/sdk';

WebApp.ready();

// Данные пользователя
const user = WebApp.initDataUnsafe.user;
// { id, first_name, last_name, username, language_code, photo_url }
```

### Валидация на сервере
```typescript
// lib/telegram/webAppAuth.ts
import crypto from 'crypto';

export function validateInitData(initData: string, botToken: string): boolean {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');
  
  // Сортировка параметров
  const sortedParams = [...urlParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  
  // HMAC-SHA256
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(sortedParams)
    .digest('hex');
  
  return calculatedHash === hash;
}

export function parseInitData(initData: string): TelegramUser {
  const urlParams = new URLSearchParams(initData);
  const userJson = urlParams.get('user');
  return JSON.parse(userJson || '{}');
}
```

### Закрытие и навигация
```typescript
// Закрыть MiniApp
WebApp.close();

// Развернуть на весь экран
WebApp.expand();

// Показать кнопку "Назад"
WebApp.BackButton.show();
WebApp.BackButton.onClick(() => { /* ... */ });

// Main Button (кнопка внизу)
WebApp.MainButton.setText('Зарегистрироваться');
WebApp.MainButton.show();
WebApp.MainButton.onClick(() => { /* submit */ });
```

---

## 📋 ПЛАН РЕАЛИЗАЦИИ

### Phase 1: Базовая инфраструктура
- [ ] Создать/настроить @orbo_event_bot в BotFather
- [ ] Добавить WebApp URL в настройки бота
- [ ] Создать endpoint для обработки startapp параметра

### Phase 2: WebApp страница
- [ ] `app/tg-app/events/[id]/page.tsx` — страница события
- [ ] Адаптировать UI под Telegram (цвета, размеры)
- [ ] Интегрировать @twa-dev/sdk
- [ ] Форма регистрации с предзаполнением из TG

### Phase 3: Авторизация и регистрация
- [ ] Валидация initData на сервере
- [ ] Связывание TG user с participant
- [ ] Создание регистрации без email/пароля
- [ ] Подтверждение регистрации

### Phase 4: UI для владельца
- [ ] Выбор способа распространения события
- [ ] Генерация deep link для MiniApp
- [ ] Кнопка "Копировать ссылку на MiniApp"

---

## 🎨 UI/UX ТРЕБОВАНИЯ

### Адаптация под Telegram
```css
/* Использовать Telegram theme variables */
:root {
  --tg-theme-bg-color: var(--tg-theme-bg-color);
  --tg-theme-text-color: var(--tg-theme-text-color);
  --tg-theme-hint-color: var(--tg-theme-hint-color);
  --tg-theme-link-color: var(--tg-theme-link-color);
  --tg-theme-button-color: var(--tg-theme-button-color);
  --tg-theme-button-text-color: var(--tg-theme-button-text-color);
}
```

### Ключевые элементы
- Компактный header с названием события
- Дата/время/место крупно
- Описание со скроллом
- Фиксированная кнопка регистрации внизу (MainButton)
- Быстрое предзаполнение из профиля TG

---

## 📦 ЗАВИСИМОСТИ

```json
{
  "@twa-dev/sdk": "^7.0.0"
}
```

### Установка
```bash
npm install @twa-dev/sdk
```

---

## 🔗 РЕСУРСЫ

- [Telegram WebApp Documentation](https://core.telegram.org/bots/webapps)
- [TWA SDK](https://github.com/AirScript/twa-sdk)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [@invites_tgbot](https://t.me/invites_tgbot?startapp=e-51) — референс

---

**Last Updated:** 19 декабря 2025

