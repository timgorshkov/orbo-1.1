# 🎫 Улучшения регистрации на события — Анализ и реализация

## ✅ Что исправлено

### 1. **Проверка регистрации пользователя**

**Проблема:**
- Использовалась несуществующая таблица `telegram_identities` с фильтром по `user_id`
- После регистрации и обновления страницы снова показывалась кнопка "Зарегистрироваться"

**Решение:**
```typescript
// БЫЛО (неправильно):
const { data: telegramIdentity } = await supabase
  .from('telegram_identities')
  .select('tg_user_id')
  .eq('user_id', user.id)  // ❌ user_id не существует в telegram_identities
  .maybeSingle()

// СТАЛО (правильно):
const { data: telegramAccount } = await supabase
  .from('user_telegram_accounts')
  .select('telegram_user_id')
  .eq('user_id', user.id)
  .eq('org_id', params.org)
  .maybeSingle()

// + Fallback по email для пользователей без Telegram
if (!participant && user.email) {
  const { data: foundByEmail } = await adminSupabase
    .from('participants')
    .select('id')
    .eq('org_id', event.org_id)
    .eq('email', user.email)
    .is('merged_into', null)
    .maybeSingle()
  
  participant = foundByEmail
}
```

**Файлы:**
- ✅ `app/app/[org]/events/[id]/page.tsx` - внутренняя страница события
- ✅ `app/p/[org]/events/[id]/page.tsx` - публичная страница события

---

### 2. **Отмена регистрации на публичной странице**

**Проблема:**
- Публичная страница не показывала статус регистрации
- Не было кнопки отмены регистрации
- После регистрации пользователь не видел, что он зарегистрирован

**Решение:**
```typescript
// Добавлен state для отслеживания
const [isRegistered, setIsRegistered] = useState(event.is_user_registered || false)

// Добавлен handler отмены
const handleUnregister = () => {
  // ... DELETE запрос к /api/events/[id]/register
  setIsRegistered(false)
  router.refresh()
}

// UI теперь показывает разные состояния:
{isRegistered ? (
  <>
    <div>✓ Вы зарегистрированы</div>
    <Button>Добавить в календарь</Button>
    <Button onClick={handleUnregister}>Отменить регистрацию</Button>
  </>
) : (
  <Button onClick={handleRegister}>Зарегистрироваться</Button>
)}
```

**Файлы:**
- ✅ `components/events/public-event-detail.tsx`

---

### 3. **Счётчик участников**

**Проверка:**
```typescript
// ✅ Правильно учитывает merged_into
const registeredCount = event.event_registrations?.filter(
  (reg: any) => reg.status === 'registered' && reg.participants?.merged_into === null
).length || 0

// ✅ Правильно фильтрует список участников
const participants = event.event_registrations
  ?.filter(reg => reg.status === 'registered' && reg.participants?.merged_into === null)
  .sort((a, b) => new Date(a.registered_at).getTime() - new Date(b.registered_at).getTime())
  || []
```

**Результат:** Дубли участников (merged) **не учитываются** в счётчике. ✅

**Файлы:**
- ✅ `app/app/[org]/events/[id]/page.tsx` (строки 61-63)
- ✅ `components/events/event-detail.tsx` (строки 182-184)

---

### 4. **Функционал .ics календаря**

**Проверка:**
- ✅ Endpoint `/api/events/[id]/ics/route.ts` **существует и работает**
- ✅ Генерирует корректный `.ics` файл
- ✅ Включает 2 напоминания: за 1 час и за 1 день
- ✅ Правильно форматирует дату/время
- ✅ Поддерживает Unicode (русские символы)

**Текущая реализация:**
```typescript
// Организатор события
ORGANIZER;CN=Organization Name:MAILTO:noreply@orbo.app

// Напоминания
BEGIN:VALARM
TRIGGER:-PT1H          // За 1 час до события
ACTION:DISPLAY
DESCRIPTION:Событие начнется через 1 час
END:VALARM

BEGIN:VALARM
TRIGGER:-P1D           // За 1 день до события
ACTION:DISPLAY
DESCRIPTION:Событие завтра
END:VALARM
```

**Файлы:**
- ✅ `app/api/events/[id]/ics/route.ts`

---

## 📋 Рекомендации по дальнейшим улучшениям

### 1. **Telegram-напоминания через `orbo_assistant_bot`** (Среднеприоритетно)

#### Концепция:
При регистрации на событие, если у участника подключён `orbo_assistant_bot`, предлагать включить напоминание в Telegram.

#### Архитектура:

```sql
-- Новая таблица для напоминаний
CREATE TABLE event_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_registration_id UUID REFERENCES event_registrations(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reminder_type TEXT CHECK (reminder_type IN ('1_hour', '1_day', 'custom')),
  reminder_time TIMESTAMPTZ NOT NULL,
  is_sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE (event_registration_id, reminder_type)
);

CREATE INDEX idx_event_reminders_due 
  ON event_reminders (reminder_time) 
  WHERE is_sent = FALSE;
```

#### Реализация:

**1. При регистрации (UI):**
```typescript
// В components/events/event-detail.tsx
const [enableTelegramReminder, setEnableTelegramReminder] = useState(true)

// При регистрации
const handleRegister = async () => {
  const response = await fetch(`/api/events/${event.id}/register`, {
    method: 'POST',
    body: JSON.stringify({
      enable_telegram_reminder: enableTelegramReminder
    })
  })
  // ...
}

// UI чекбокс
{hasTelegramBot && (
  <label className="flex items-center text-sm">
    <input 
      type="checkbox" 
      checked={enableTelegramReminder}
      onChange={e => setEnableTelegramReminder(e.target.checked)}
    />
    <span className="ml-2">Напомнить в Telegram за 1 час до события</span>
  </label>
)}
```

**2. API endpoint (`/api/events/[id]/register`):**
```typescript
// app/api/events/[id]/register/route.ts

// После создания регистрации
if (body.enable_telegram_reminder && telegramAccount?.telegram_user_id) {
  // Проверяем, что у пользователя подключён orbo_assistant_bot
  const { data: botStatus } = await supabase
    .from('user_telegram_accounts')
    .select('telegram_username')
    .eq('telegram_user_id', telegramAccount.telegram_user_id)
    .eq('org_id', event.org_id)
    .single()
  
  if (botStatus) {
    // Создаём напоминание
    const reminderTime = new Date(event.starts_at)
    reminderTime.setHours(reminderTime.getHours() - 1) // За 1 час

    await supabase
      .from('event_reminders')
      .insert({
        event_registration_id: registration.id,
        participant_id: participant.id,
        org_id: event.org_id,
        reminder_type: '1_hour',
        reminder_time: reminderTime.toISOString()
      })
  }
}
```

**3. Cron job для отправки напоминаний:**
```typescript
// app/api/cron/send-event-reminders/route.ts

export async function GET(request: NextRequest) {
  // Проверка секрета cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminServer()
  
  // Находим напоминания, которые нужно отправить
  const { data: reminders } = await supabase
    .from('event_reminders')
    .select(`
      *,
      event_registrations!inner(
        event_id,
        events!inner(
          title,
          event_date,
          start_time,
          location_info,
          org_id,
          organizations!inner(name)
        )
      ),
      participants!inner(
        tg_user_id
      )
    `)
    .eq('is_sent', false)
    .lte('reminder_time', new Date().toISOString())
  
  if (!reminders || reminders.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  let sentCount = 0

  for (const reminder of reminders) {
    try {
      const event = reminder.event_registrations.events
      const tgUserId = reminder.participants.tg_user_id
      
      const message = `🔔 Напоминание о событии!

📅 ${event.title}
⏰ Начало через 1 час
📍 ${event.location_info || 'Онлайн'}

Ждём вас!`

      // Отправка через orbo_assistant_bot
      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgUserId,
            text: message,
            parse_mode: 'Markdown'
          })
        }
      )

      if (telegramResponse.ok) {
        // Отмечаем как отправленное
        await supabase
          .from('event_reminders')
          .update({ 
            is_sent: true, 
            sent_at: new Date().toISOString() 
          })
          .eq('id', reminder.id)
        
        sentCount++
      }
    } catch (error) {
      console.error(`Error sending reminder ${reminder.id}:`, error)
    }
  }

  return NextResponse.json({ sent: sentCount })
}
```

**4. Добавить в `vercel.json`:**
```json
{
  "crons": [
    {
      "path": "/api/cron/send-event-reminders",
      "schedule": "*/5 * * * *"  // Каждые 5 минут
    }
  ]
}
```

---

### 2. **Улучшение .ics календаря** (Низкоприоритетно)

#### Текущие проблемы:
- Организатор = `noreply@orbo.app` (не персонализировано)
- Нет ссылки на событие в календаре

#### Предложения:

**Вариант A: Email владельца организации**
```typescript
// Получить email владельца
const { data: owner } = await supabase
  .from('memberships')
  .select('user_id, auth.users(email)')
  .eq('org_id', event.org_id)
  .eq('role', 'owner')
  .single()

const organizerEmail = owner?.users?.email || 'noreply@orbo.app'

// В .ics
ORGANIZER;CN=${orgName}:MAILTO:${organizerEmail}
```

**Вариант B: Ссылка на событие**
```typescript
// Добавить URL события в .ics
URL:https://app.orbo.ru/p/${orgId}/events/${eventId}

// Или в описание
DESCRIPTION:${description}\n\nПодробнее: https://app.orbo.ru/p/${orgId}/events/${eventId}
```

**Вариант C: Кастомный домен организации** (если будет в будущем)
```typescript
ORGANIZER;CN=${orgName}:MAILTO:events@${org.custom_domain || 'orbo.app'}
```

---

### 3. **Автоматическое добавление в календарь** (Дополнительно)

#### Интеграция с Google Calendar

**При регистрации:**
```typescript
// Кнопка "Добавить в Google Calendar"
const addToGoogleCalendar = () => {
  const startDate = formatForGoogleCalendar(event.event_date, event.start_time)
  const endDate = formatForGoogleCalendar(event.event_date, event.end_time)
  
  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${startDate}/${endDate}&details=${encodeURIComponent(event.description)}&location=${encodeURIComponent(event.location_info)}`
  
  window.open(googleUrl, '_blank')
}
```

---

## 📊 Приоритизация

| Улучшение | Приоритет | Сложность | Польза | Срок |
|-----------|-----------|-----------|--------|------|
| ✅ Исправление проверки регистрации | 🔴 Критично | Низкая | Высокая | **Готово** |
| ✅ Отмена регистрации | 🟠 Высокий | Низкая | Средняя | **Готово** |
| ✅ Счётчик участников | 🟢 Низкий | - | - | **Работает** |
| ✅ Функционал .ics | 🟢 Низкий | - | - | **Работает** |
| Telegram-напоминания | 🟡 Средний | Средняя | Высокая | 2-3 дня |
| Улучшение .ics | 🟢 Низкий | Низкая | Низкая | 1 час |
| Google Calendar | 🟢 Низкий | Низкая | Средняя | 2 часа |

---

## 🧪 Тестирование

### После деплоя проверить:

1. **Регистрация на событие**
   ```
   ✅ Авторизоваться как участник
   ✅ Зарегистрироваться на событие
   ✅ Обновить страницу
   ✅ Должен показывать "✓ Вы зарегистрированы"
   ✅ Кнопка "Отменить регистрацию" должна работать
   ```

2. **Публичная страница**
   ```
   ✅ Открыть публичный URL события /p/{org}/events/{id}
   ✅ Зарегистрироваться
   ✅ Обновить страницу
   ✅ Статус должен сохраниться
   ✅ Кнопка отмены должна работать
   ```

3. **Счётчик участников**
   ```
   ✅ Проверить, что merged participants не учитываются
   ✅ SQL: 
   SELECT COUNT(*) FROM event_registrations er
   JOIN participants p ON p.id = er.participant_id
   WHERE er.event_id = '{event_id}' 
     AND er.status = 'registered'
     AND p.merged_into IS NULL
   ```

4. **Календарь .ics**
   ```
   ✅ Нажать "Добавить в календарь"
   ✅ Файл должен скачаться
   ✅ Открыть в Google Calendar/Outlook
   ✅ Событие должно добавиться с правильным временем
   ```

---

## 📦 Файлы изменены

```
✅ app/app/[org]/events/[id]/page.tsx
✅ app/p/[org]/events/[id]/page.tsx
✅ components/events/public-event-detail.tsx
📝 docs/EVENT_REGISTRATION_IMPROVEMENTS.md
```

---

## 🚀 Готово к деплою

Все критичные исправления готовы. Можно деплоить:

```bash
git add .
git commit -m "feat: fix event registration status check and add unregister button

- Fix: use user_telegram_accounts instead of telegram_identities
- Add: unregister button on public event page
- Add: registration status check with email fallback
- Verify: participant counter excludes merged participants
- Verify: .ics calendar file generation works correctly"
git push
```

**После деплоя:** протестировать регистрацию и отмену регистрации.

**Следующие шаги (опционально):**
1. Telegram-напоминания (если востребовано)
2. Улучшение .ics (персонализация организатора)
3. Google Calendar интеграция (one-click add)

