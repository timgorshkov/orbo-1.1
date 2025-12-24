# План интеграции мессенджера MAX

**Дата создания:** 24 декабря 2024  
**Статус:** В процессе (Этап 1 завершён)  
**API документация:** https://dev.max.ru/docs-api  
**SDK:** https://github.com/max-messenger/max-bot-api-client-ts (`@maxhub/max-bot-api`)

---

## Обзор

MAX — российский мессенджер с API, похожим на Telegram. Интеграция позволит пользователям Orbo управлять группами и участниками из MAX параллельно с Telegram.

---

## Этапы реализации

### ✅ Этап 1: Инфраструктура (ЗАВЕРШЁН)

**Миграция БД (`177_add_messenger_platform_enum.sql`):**
```sql
-- Enum для платформ
CREATE TYPE messenger_platform AS ENUM ('telegram', 'max', 'whatsapp');

-- Новые колонки (с DEFAULT 'telegram' для обратной совместимости):
telegram_groups.platform
org_telegram_groups.platform
participants.platform
participants.platform_user_id  -- универсальный ID (строка)
activity_events.platform
participant_messages.platform
```

**Абстрактный слой адаптеров (`lib/messenger/`):**
- `types.ts` — универсальные типы (User, Chat, Message, etc.)
- `adapter.ts` — интерфейс MessengerAdapter
- `adapters/telegram-adapter.ts` — реализация для Telegram
- `factory.ts` — фабрика адаптеров
- `index.ts` — экспорты модуля

---

### ⏳ Этап 2: MAX Adapter (Backend)

**Шаг 2.1: Установка SDK**
```bash
npm install @maxhub/max-bot-api
# или
pnpm add @maxhub/max-bot-api
```

**Шаг 2.2: Создание MaxAdapter**

Создать файл `lib/messenger/adapters/max-adapter.ts`:

```typescript
import { Bot } from '@maxhub/max-bot-api';
import { BaseMessengerAdapter } from '../adapter';
import type { MessengerPlatform, MessengerUser, ... } from '../types';

export class MaxAdapter extends BaseMessengerAdapter {
  readonly platform: MessengerPlatform = 'max';
  readonly platformName = 'MAX';
  
  private bot: Bot;

  constructor(token: string) {
    super(token, 'MaxAdapter');
    this.bot = new Bot(token);
  }

  async getMe(): Promise<ApiResult<MessengerUser>> {
    // Использовать this.bot.api методы
  }

  // Реализовать все методы интерфейса...
}
```

**Шаг 2.3: Маппинг методов MAX API**

| MessengerAdapter | MAX API | Примечание |
|------------------|---------|------------|
| `getMe()` | `GET /me` | ✅ Прямой маппинг |
| `getChat(id)` | `GET /chats/{id}` | ✅ Прямой маппинг |
| `getChatAdministrators(id)` | `GET /chats/{id}/admins` | ✅ Прямой маппинг |
| `getChatMemberCount(id)` | Из `getChat().participants_count` | ⚠️ Немного иначе |
| `sendMessage()` | `POST /messages` | ✅ Прямой маппинг |
| `editMessage()` | `PUT /messages/{id}` | ✅ Прямой маппинг |
| `deleteMessage()` | `DELETE /messages/{id}` | ✅ Прямой маппинг |
| `setWebhook()` | `POST /subscriptions` | ⚠️ Другой формат |
| `getUserProfilePhotos()` | Через объект User | ⚠️ Адаптация |

**Шаг 2.4: Обновить фабрику**

В `lib/messenger/factory.ts` раскомментировать case 'max':
```typescript
case 'max':
  return new MaxAdapter(config.token);
```

---

### ⏳ Этап 3: Webhook и обработка событий

**Шаг 3.1: Создать webhook endpoint**

`app/api/max/webhook/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const update = await req.json();
  
  // Типы событий MAX:
  // - message_created
  // - message_callback  
  // - bot_added, bot_removed
  // - user_added, user_removed
  // - chat_title_changed
  
  await processMaxUpdate(update);
  return NextResponse.json({ ok: true });
}
```

**Шаг 3.2: Процессор событий**

`lib/messenger/processors/max-processor.ts`:
```typescript
export async function processMaxUpdate(update: MaxUpdate) {
  switch (update.update_type) {
    case 'message_created':
      await processMaxMessage(update.message);
      break;
    case 'user_added':
      await processMaxUserJoin(update);
      break;
    case 'user_removed':
      await processMaxUserLeft(update);
      break;
  }
}
```

**Шаг 3.3: Унификация записи в БД**

- Добавить `platform: 'max'` при записи в `activity_events`
- Добавить `platform: 'max'` при записи в `participant_messages`
- Использовать `platform_user_id` вместо `tg_user_id` для MAX

---

### ⏳ Этап 4: UI настроек (Frontend)

**Шаг 4.1: Табы платформ**

`components/settings/messenger-platform-tabs.tsx`:
```tsx
<Tabs value={platform} onValueChange={setPlatform}>
  <TabsList>
    <TabsTrigger value="telegram">
      <TelegramIcon /> Telegram
    </TabsTrigger>
    <TabsTrigger value="max">
      <MaxIcon /> MAX
    </TabsTrigger>
  </TabsList>
  
  <TabsContent value="telegram">
    <TelegramSettings orgId={orgId} />
  </TabsContent>
  
  <TabsContent value="max">
    <MaxSettings orgId={orgId} />
  </TabsContent>
</Tabs>
```

**Шаг 4.2: Страница настроек MAX**

`components/settings/max-settings.tsx`:
- Инструкция по созданию бота (@PrimeBot в MAX)
- Поле для ввода токена бота
- Кнопка "Подключить"
- Список групп MAX
- Синхронизация участников

**Шаг 4.3: Иконка MAX**

Создать или найти иконку MAX для UI.

---

### ⏳ Этап 5: Аналитика и уведомления

**Шаг 5.1: Фильтр платформы в аналитике**

```tsx
<Select value={platform} onValueChange={setPlatform}>
  <SelectItem value="all">Все платформы</SelectItem>
  <SelectItem value="telegram">Telegram</SelectItem>
  <SelectItem value="max">MAX</SelectItem>
</Select>
```

**Шаг 5.2: Отправка уведомлений через MAX**

- Добавить MaxAdapter в notification rules engine
- Отправлять уведомления в MAX если у пользователя есть MAX-аккаунт

---

## Переменные окружения

Добавить в `.env`:
```env
# MAX Bot tokens
MAX_BOT_TOKEN=xxx
MAX_NOTIFICATIONS_BOT_TOKEN=xxx
MAX_WEBHOOK_SECRET=xxx
```

---

## Тестирование

### Чек-лист для Этапа 2:
- [ ] `npm install @maxhub/max-bot-api` проходит без ошибок
- [ ] MaxAdapter создаётся без ошибок
- [ ] `getMe()` возвращает информацию о боте
- [ ] `sendMessage()` отправляет сообщение

### Чек-лист для Этапа 3:
- [ ] Webhook регистрируется в MAX
- [ ] События от MAX приходят на endpoint
- [ ] Сообщения сохраняются в `participant_messages` с `platform='max'`
- [ ] Участники создаются с `platform='max'`

### Чек-лист для Этапа 4:
- [ ] Табы Telegram/MAX отображаются
- [ ] Можно подключить MAX-бота
- [ ] Список MAX-групп отображается
- [ ] Синхронизация участников работает

### Чек-лист обратной совместимости:
- [ ] Существующие Telegram-группы работают как раньше
- [ ] Webhook Telegram работает
- [ ] Аналитика показывает данные Telegram
- [ ] Уведомления отправляются в Telegram

---

## Риски и митигация

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| API MAX нестабилен | Средняя | Высокое | Retry-логика, graceful degradation |
| Отличия в формате событий | Высокая | Среднее | Тщательный маппинг, адаптеры |
| SDK не обновляется | Низкая | Среднее | Можно писать свой клиент |

---

## Оценка трудозатрат

| Этап | Время | Статус |
|------|-------|--------|
| 1. Инфраструктура | 3-4 часа | ✅ Завершён |
| 2. MAX Adapter | 4-6 часов | ⏳ Следующий |
| 3. Webhook | 3-4 часа | ⏳ |
| 4. UI настроек | 4-6 часов | ⏳ |
| 5. Аналитика | 2-3 часа | ⏳ |
| **Итого** | **16-23 часа** | |

---

## Ссылки

- [MAX API Documentation](https://dev.max.ru/docs-api)
- [MAX Bot SDK (TypeScript)](https://github.com/max-messenger/max-bot-api-client-ts)
- [Telegram Bot API](https://core.telegram.org/bots/api) — для сравнения

