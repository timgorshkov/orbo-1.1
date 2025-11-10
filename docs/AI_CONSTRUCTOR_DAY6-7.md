# AI Constructor - Day 6-7: Chat UI

## ✅ Что реализовано

### 1. Страница создания приложения (`/create-app`)
- Красивый landing с градиентом
- Заголовок и описание
- Встроенный чат компонент
- 3 карточки с преимуществами (быстро, гибко, интеграция)

### 2. Компонент чата (`AIConstructorChat.tsx`)
- **История сообщений**: Отображение user/assistant сообщений
- **Input**: Текстовое поле + кнопка "Отправить"
- **Loading states**: 
  - Typing indicator (3 animated dots)
  - Disabled input during loading
- **UX улучшения**:
  - Auto-scroll to bottom
  - Markdown-style **bold** parsing
  - Timestamps для каждого сообщения
  - Responsive дизайн
- **Цвета**: 
  - User messages: синий bg
  - Assistant messages: серый bg
  - Dark mode support

### 3. API Endpoint (`/api/ai/chat`)
- **POST** метод
- **Аутентификация**: Проверка пользователя
- **Conversation state**: In-memory хранение состояния диалога
- **Пошаговый диалог** (5 шагов):
  1. Тип контента (что публикуют?)
  2. Нужна ли модерация?
  3. Цена (обязательна/опционально/не нужна)
  4. Категории
  5. Геолокация
- **Генерация конфига**: `generateAppConfig()` создает JSON с:
  - app (name, description, icon, type)
  - collections (schema, permissions, workflows, views)

### 4. Навигация
- Добавлена иконка `AppWindow` в sidebar
- Новый пункт меню "Приложения" (доступен всем)
- Ссылка на `/app/[org]/apps`

### 5. Страница списка приложений (`/app/[org]/apps`)
- **Empty state**: 
  - Иконка + заголовок
  - Описание
  - CTA кнопка "Создать первое приложение"
- **Примеры**: 3 карточки с типами приложений (доски, события, заявки)
- **Header**: Заголовок + кнопка "+ Создать приложение"

## 📁 Созданные файлы

```
app/(authenticated)/create-app/page.tsx
components/ai-constructor/ai-constructor-chat.tsx
app/api/ai/chat/route.ts
app/app/[org]/apps/page.tsx
components/navigation/collapsible-sidebar.tsx (updated)
```

## 🎨 Примеры conversation flow

### Пример 1: Доска объявлений
```
AI: Что будут публиковать ваши пользователи?
User: Продажа и покупка вещей

AI: Нужна ли модерация?
User: Да, нужна

AI: Цена обязательна, опциональна, или не нужна?
User: Обязательна

AI: Какие категории нужны?
User: Техника, Одежда, Мебель, Транспорт

AI: Нужна ли геолокация?
User: Да

AI: 🎉 Готово! [показывает preview конфига]
```

## 🚧 Что НЕ реализовано (Day 8-10)

- [ ] OpenAI API integration (пока заглушка)
- [ ] Реальный prompt engineering
- [ ] Сохранение conversation history в БД
- [ ] Preview modal с JSON config
- [ ] Кнопка "Создать приложение" (финализация)
- [ ] API endpoint `/api/ai/generate-app`
- [ ] Валидация AI output
- [ ] Список существующих приложений (когда они есть)

## 🔄 Архитектурные решения

### In-memory state (временно)
```typescript
const conversationStates = new Map<string, ConversationState>();
```
- **Плюсы**: Быстро реализовать, нет задержек на DB
- **Минусы**: Теряется при перезапуске сервера
- **Решение**: В Day 8 перенести в таблицу `ai_conversations`

### Простой диалог без AI (MVP)
- Switch-case по шагам
- Регулярки для парсинга ответов (`includes('да')`)
- **Плюсы**: Работает без OpenAI, предсказуемо
- **Минусы**: Негибко, не понимает контекст
- **Решение**: В Day 8 заменить на OpenAI

### Markdown parsing (bold)
```typescript
line.split('**').map((part, j) =>
  j % 2 === 1 ? <strong>{part}</strong> : part
)
```
- Работает для `**текст**`
- Можно расширить (italic, links, etc)

## 📊 Формат appConfig

```json
{
  "app": {
    "name": "Объявления",
    "description": "Приложение для публикации: Объявления",
    "icon": "📦",
    "app_type": "classifieds"
  },
  "collections": [
    {
      "name": "items",
      "display_name": "Объявления",
      "icon": "📋",
      "schema": {
        "fields": [
          { "name": "title", "type": "string", "label": "Название", "required": true },
          { "name": "description", "type": "text", "label": "Описание", "required": true },
          { "name": "category", "type": "select", "label": "Категория", "options": [...] },
          { "name": "price", "type": "number", "label": "Цена", "required": true }
        ]
      },
      "permissions": {
        "create": ["member"],
        "read": ["member", "guest"],
        "update": ["owner", "admin"],
        "delete": ["owner", "admin"]
      },
      "workflows": {
        "initial_status": "pending",
        "statuses": ["pending", "published", "rejected", "archived"]
      },
      "views": ["grid", "list"],
      "moderation_enabled": true
    }
  ]
}
```

## 🎯 Следующие шаги (Day 8-9)

1. **OpenAI Integration**:
   ```typescript
   import OpenAI from 'openai';
   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
   ```

2. **System Prompt**:
   ```
   You are an AI assistant helping users create classifieds boards.
   Ask 5 questions in Russian, then generate a JSON config.
   
   Questions:
   1. What will users post?
   2. Moderation needed?
   3. Price field (required/optional/none)?
   4. Categories (suggest 5-7)?
   5. Location needed?
   
   Output format: {app: {...}, collections: [...]}
   ```

3. **Валидация JSON**:
   - Zod schema для appConfig
   - Fallback к defaults если AI fails

4. **DB Schema**:
   ```sql
   CREATE TABLE ai_conversations (
     id UUID PRIMARY KEY,
     user_id UUID REFERENCES auth.users,
     messages JSONB,
     app_config JSONB,
     status TEXT, -- 'in_progress', 'completed', 'abandoned'
     created_at TIMESTAMPTZ
   );
   ```

## 🐛 Known Issues

- [ ] Conversation state теряется при reload страницы
- [ ] Нет валидации user input (можно отправить пустое)
- [ ] Markdown parsing примитивный (только **bold**)
- [ ] Нет error recovery (если AI сломался)
- [ ] Нет rate limiting (можно спамить запросы)

## 💡 UX Improvements (future)

- [ ] "Начать сначала" кнопка
- [ ] Показывать прогресс (Step 1/5)
- [ ] Suggested replies (quick buttons)
- [ ] Редактирование предыдущих ответов
- [ ] Копирование сгенерированного JSON
- [ ] A/B тестирование промптов

