# Решения для проблем с Telegram инфраструктурой

## Дата: 13.10.2025

## Обзор

Документ содержит аргументированные решения для двух проблем:
1. **Webhook отваливается** - требуется стабилизация
2. **Telegram Login Widget глючит** - нужна альтернатива

---

## Проблема 4: Стабилизация Telegram Webhook

### Симптомы

- Webhook перестает получать обновления
- Требуется ручной переуста

новка командой `setWebhook`
- Происходит периодически

### Возможные причины

1. **Vercel serverless timeout**
   - Vercel функции имеют лимит execution time (10 секунд для hobby plan)
   - Долгая обработка webhook может приводить к timeout
   - Telegram считает webhook неработающим

2. **SSL проблемы**
   - Telegram требует HTTPS и валидный SSL
   - Временные проблемы с SSL на стороне Vercel

3. **Rate limiting**
   - Если бот получает много обновлений, Telegram может временно блокировать webhook

4. **Неправильная обработка ошибок**
   - Если webhook возвращает не-200 статус, Telegram может отключить его

### Реком

ендуемые решения

#### ✅ Решение 1: Мониторинг и автовосстановление

**Создать cron job для проверки webhook**:

```typescript
// app/api/cron/check-webhook/route.ts

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    
    if (!botToken) {
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 })
    }
    
    // 1. Проверяем текущий webhook
    const checkResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getWebhookInfo`
    )
    
    const webhookInfo = await checkResponse.json()
    
    console.log('[Webhook Check] Current webhook:', webhookInfo.result)
    
    const webhookUrl = webhookInfo.result?.url
    const expectedUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/telegram/webhook`
    
    // 2. Если webhook не установлен или неправильный - переустанавливаем
    if (!webhookUrl || webhookUrl !== expectedUrl) {
      console.log(`[Webhook Check] Webhook mismatch. Expected: ${expectedUrl}, Got: ${webhookUrl}`)
      
      const setResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/setWebhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: expectedUrl,
            allowed_updates: ['message', 'chat_member']
          })
        }
      )
      
      const setResult = await setResponse.json()
      
      if (setResult.ok) {
        console.log('[Webhook Check] Webhook restored successfully')
        return NextResponse.json({
          status: 'restored',
          webhook: expectedUrl,
          message: 'Webhook was restored'
        })
      } else {
        console.error('[Webhook Check] Failed to restore webhook:', setResult)
        return NextResponse.json({
          status: 'error',
          error: setResult.description
        }, { status: 500 })
      }
    }
    
    // 3. Webhook в порядке
    return NextResponse.json({
      status: 'ok',
      webhook: webhookUrl,
      pending_updates: webhookInfo.result?.pending_update_count || 0
    })
  } catch (error) {
    console.error('[Webhook Check] Error:', error)
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
```

**Настройка в Vercel**:
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/check-webhook",
      "schedule": "*/15 * * * *"  // Каждые 15 минут
    }
  ]
}
```

**Плюсы**:
- ✅ Автоматическое восстановление webhook
- ✅ Мониторинг состояния
- ✅ Минимальные изменения в коде

**Минусы**:
- ⚠️ Требует Vercel Pro для cron jobs (или можно использовать внешний cron)

---

#### ✅ Решение 2: Улучшение webhook обработчика

**Проблемы текущего обработчика**:
```typescript
// app/api/telegram/webhook/route.ts

// ❌ Может быть долгая обработка
await processMessage(message)  // Может занять >10 секунд

// ❌ Блокирующая обработка
```

**Улучшенный обработчик**:
```typescript
// app/api/telegram/webhook/route.ts

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // ✅ Сразу отвечаем 200 OK
    const response = NextResponse.json({ ok: true })
    
    // ✅ Обработка в фоне (не блокируем ответ)
    setTimeout(async () => {
      try {
        await processWebhookUpdate(body)
      } catch (error) {
        console.error('[Webhook] Background processing error:', error)
      }
    }, 0)
    
    return response
  } catch (error) {
    // ✅ Всегда возвращаем 200, даже при ошибке
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ ok: true })
  }
}
```

**Плюсы**:
- ✅ Быстрый ответ Telegram (< 1 секунда)
- ✅ Предотвращает timeout
- ✅ Telegram не отключит webhook

**Минусы**:
- ⚠️ Нет гарантии обработки (если функция завершится)

---

#### ✅ Решение 3: Queue-based обработка (рекомендуется для production)

**Использовать очередь для обработки**:

```typescript
// 1. Webhook сразу возвращает 200 и кладет в очередь
// app/api/telegram/webhook/route.ts

import { Queue } from '@upstash/qstash'

const queue = new Queue({
  token: process.env.QSTASH_TOKEN!
})

export async function POST(request: Request) {
  const body = await request.json()
  
  // Добавляем в очередь
  await queue.enqueue({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/telegram/process-update`,
    body: JSON.stringify(body)
  })
  
  // Сразу отвечаем
  return NextResponse.json({ ok: true })
}

// 2. Обработчик из очереди
// app/api/telegram/process-update/route.ts

export async function POST(request: Request) {
  const update = await request.json()
  
  // Обработка может занимать сколько угодно времени
  await processWebhookUpdate(update)
  
  return NextResponse.json({ ok: true })
}
```

**Плюсы**:
- ✅ Быстрый ответ Telegram
- ✅ Гарантированная обработка
- ✅ Retry при ошибках
- ✅ Масштабируемость

**Минусы**:
- ⚠️ Требует Upstash QStash (платный после лимита)
- ⚠️ Дополнительная инфраструктура

---

### 📊 Рекомендация

**Для MVP**: Решение 1 (мониторинг) + Решение 2 (быстрый ответ)
**Для production**: Решение 3 (очередь)

**Немедленные действия**:
1. Обновить webhook handler для быстрого ответа
2. Добавить логирование webhook статуса
3. Настроить мониторинг (даже вручную через отдельный скрипт)

---

## Проблема 5: Альтернатива Telegram Login Widget

### Симптомы

- Login Widget запрашивает телефон
- Код не приходит
- Плохой UX для пользователей

### Почему Widget работает плохо

1. **Требует телефон** - дополнительный шаг
2. **SMS не всегда доставляется** - зависит от оператора
3. **Браузерные ограничения** - может не работать во встроенном браузере Telegram
4. **Зависимость от Telegram OAuth** - их инфраструктура

### ✅ Решение: Авторизация через бота (рекомендуется)

**Идея**: Использовать тот же механизм, что для верификации владельца

#### Как это работает

```
1. Пользователь → Клик "Войти через Telegram"
2. Генерируется уникальный код (например, 6-значный)
3. Пользователь → Отправляет команду боту: /start CODE
4. Бот → Проверяет код, создает сессию
5. Пользователь → Автоматически залогинен
```

#### Реализация

**Шаг 1: Генерация кода авторизации**

```typescript
// app/api/auth/telegram-code/generate/route.ts

import { createAdminServer } from '@/lib/server/supabaseServer'
import { randomBytes } from 'crypto'

export async function POST(request: Request) {
  const { orgId, eventId } = await request.json()
  
  // Генерируем 6-значный код
  const code = randomBytes(3).toString('hex').toUpperCase()
  
  // Сохраняем в базу (временно, 10 минут)
  const supabase = createAdminServer()
  
  const { data, error } = await supabase
    .from('telegram_auth_codes')
    .insert({
      code,
      org_id: orgId,
      event_id: eventId,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      is_used: false
    })
    .select()
    .single()
  
  if (error) {
    return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 })
  }
  
  return NextResponse.json({ code, expiresIn: 600 })
}
```

**Шаг 2: Обработка команды в боте**

```typescript
// app/api/telegram/webhook/route.ts

async function handleBotCommand(message: any) {
  if (message.text?.startsWith('/start ')) {
    const code = message.text.replace('/start ', '').trim().toUpperCase()
    
    // Проверяем код
    const { data: authCode, error } = await supabase
      .from('telegram_auth_codes')
      .select('*')
      .eq('code', code)
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    
    if (!authCode) {
      await sendMessage(message.chat.id, '❌ Код недействителен или истек. Попробуйте снова.')
      return
    }
    
    // Создаем или находим пользователя
    const { data: user } = await createOrFindUser(message.from)
    
    // Создаем сессию
    const { data: session } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: `tg${message.from.id}@telegram.user`
    })
    
    // Отмечаем код как использованный
    await supabase
      .from('telegram_auth_codes')
      .update({
        is_used: true,
        used_at: new Date().toISOString(),
        user_id: user.id,
        telegram_user_id: message.from.id
      })
      .eq('code', code)
    
    // Отправляем ссылку для входа
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?token=${session.properties.hashed_token}`
    
    await sendMessage(
      message.chat.id,
      `✅ Авторизация успешна!\n\nНажмите на кнопку ниже для входа:`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '🔐 Войти в приложение', url: loginUrl }
          ]]
        }
      }
    )
  }
}
```

**Шаг 3: UI для пользователя**

```typescript
// components/auth/telegram-bot-auth.tsx

'use client'

import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'

export function TelegramBotAuth({ orgId, eventId }: { orgId: string, eventId?: string }) {
  const [code, setCode] = useState<string | null>(null)
  const [botUsername] = useState(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME)
  
  useEffect(() => {
    // Генерируем код
    fetch('/api/auth/telegram-code/generate', {
      method: 'POST',
      body: JSON.stringify({ orgId, eventId })
    })
      .then(res => res.json())
      .then(data => setCode(data.code))
  }, [orgId, eventId])
  
  if (!code) return <div>Загрузка...</div>
  
  const botLink = `https://t.me/${botUsername}?start=${code}`
  
  return (
    <div className="text-center">
      <h3 className="text-lg font-semibold mb-4">Войдите через Telegram</h3>
      
      {/* QR код */}
      <div className="mb-4 flex justify-center">
        <QRCodeSVG value={botLink} size={200} />
      </div>
      
      <p className="text-sm text-gray-600 mb-4">
        Отсканируйте QR-код или нажмите на кнопку ниже
      </p>
      
      {/* Кнопка */}
      <a
        href={botLink}
        target="_blank"
        className="inline-flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
      >
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z" />
        </svg>
        Открыть бота
      </a>
      
      <p className="text-xs text-gray-500 mt-4">
        Код: <span className="font-mono font-bold text-lg">{code}</span>
      </p>
      <p className="text-xs text-gray-500">
        Действителен 10 минут
      </p>
    </div>
  )
}
```

#### Преимущества решения

✅ **Высокая конверсия**:
- Один клик для пользователей Telegram
- Не требует телефона
- Не требует SMS

✅ **Надежность**:
- Не зависит от Telegram OAuth
- Контроль над процессом авторизации
- Можно добавить retry

✅ **UX**:
- Привычный интерфейс (как верификация владельца)
- QR-код для десктопа
- Прямая ссылка для мобильных

✅ **Безопасность**:
- Код одноразовый
- Срок действия 10 минут
- Привязка к конкретной организации/событию

#### Недостатки

⚠️ **Требует дополнительную таблицу** `telegram_auth_codes`
⚠️ **Пользователь должен иметь доступ к боту**

---

### 📊 Рекомендация по авторизации

**Использовать авторизацию через бота** вместо Telegram Login Widget

**Почему**:
1. Лучший UX (один клик)
2. Выше надежность (нет зависимости от SMS)
3. Уже есть опыт с verification через бота
4. Единообразный подход

**Немедленные действия**:
1. Создать таблицу `telegram_auth_codes`
2. Обновить webhook handler для обработки `/start CODE`
3. Заменить `TelegramLoginWidget` на `TelegramBotAuth`

---

## SQL миграция для auth codes

```sql
-- db/migrations/33_telegram_auth_codes.sql

CREATE TABLE IF NOT EXISTS telegram_auth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) UNIQUE NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  telegram_user_id BIGINT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ
);

CREATE INDEX idx_telegram_auth_codes_code ON telegram_auth_codes(code) WHERE NOT is_used;
CREATE INDEX idx_telegram_auth_codes_expires ON telegram_auth_codes(expires_at) WHERE NOT is_used;

COMMENT ON TABLE telegram_auth_codes IS 'Temporary codes for Telegram bot authentication';
```

---

## Итоговые рекомендации

### Немедленно (MVP)

1. ✅ **Webhook**: Обновить handler для быстрого ответа
2. ✅ **Auth**: Заменить Login Widget на авторизацию через бота

### Краткосрочно (1-2 недели)

3. ✅ **Webhook**: Добавить cron мониторинг
4. ✅ **Логирование**: Расширенное логирование webhook событий

### Долгосрочно (production)

5. ✅ **Queue**: Внедрить очередь для обработки webhook
6. ✅ **Alerting**: Настроить уведомления при проблемах с webhook

---

**Версия**: 1.0  
**Автор**: AI Assistant  
**Дата**: 13.10.2025

