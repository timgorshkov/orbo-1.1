# Дизайн авторизации для участников

## Проблемы текущей системы

### ❌ Что не работает:
1. **Участники Telegram-групп** есть в базе (`participants`), но **не могут войти в веб-интерфейс**
2. Нет механизма приглашения внешних участников
3. Нет публичных ссылок на материалы/события
4. Owner/Admin должны вручную привязывать Telegram через сложный flow с кодами

### ✅ Что работает:
- Telegram-бот собирает участников из групп
- Бот отправляет коды верификации для owner/admin
- RLS политики разграничивают доступ по ролям

## Предлагаемое решение

### 1. Telegram Login Widget (главный вход)

Используем официальный [Telegram Login Widget](https://core.telegram.org/widgets/login) для быстрой OAuth-авторизации.

**Преимущества:**
- ✅ Официальный механизм Telegram
- ✅ Не требует бота
- ✅ Пользователь авторизуется за 1 клик
- ✅ Получаем: `id`, `first_name`, `last_name`, `username`, `photo_url`
- ✅ Высокая конверсия

**Flow:**
```
1. Пользователь → кнопка "Войти через Telegram"
2. Telegram Widget → редирект на telegram.org
3. Пользователь подтверждает → callback на наш сайт
4. Мы получаем данные + хеш для проверки
5. Создаём/обновляем auth.users + связываем с participants
```

### 2. Типы доступа

#### A. Через Telegram-группу (автоматически)
```
Участник группы → попадает в participants → 
→ при первом входе через Login Widget → 
→ создаётся auth.users + связка
→ доступ к материалам/событиям организации
```

#### B. Через публичную ссылку (приглашение)
```
/join/[org]/[inviteToken]
→ Login через Telegram Widget
→ создаётся auth.users
→ создаётся participants со статусом 'event_attendee' или 'candidate'
→ доступ к материалам (если разрешено в ссылке)
```

#### C. Через публичное событие
```
/p/[org]/events/[eventId]
→ может просмотреть без авторизации
→ для регистрации → Login через Telegram Widget
→ создаётся participants со статусом 'event_attendee'
```

### 3. Приглашения (Invite Links)

#### Типы приглашений:
1. **Полный доступ**: материалы + события + участники
2. **Только события**: регистрация на события
3. **Ограниченный**: конкретные материалы/события

#### База данных:
```sql
CREATE TABLE organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL, -- короткий токен для ссылки
  created_by UUID NOT NULL REFERENCES auth.users(id),
  
  -- Настройки доступа
  access_type TEXT NOT NULL CHECK (access_type IN ('full', 'events_only', 'materials_only', 'limited')),
  allowed_materials UUID[], -- массив ID материалов (если limited)
  allowed_events UUID[], -- массив ID событий (если limited)
  
  -- Ограничения
  max_uses INTEGER, -- максимум использований (NULL = неограниченно)
  current_uses INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ, -- дата истечения (NULL = бессрочно)
  
  -- Метаданные
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invites_token ON organization_invites(token);
CREATE INDEX idx_invites_org ON organization_invites(org_id);

-- Таблица использований (аудит)
CREATE TABLE organization_invite_uses (
  id BIGSERIAL PRIMARY KEY,
  invite_id UUID NOT NULL REFERENCES organization_invites(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  telegram_user_id BIGINT,
  used_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. Telegram Login Widget - Реализация

#### Клиентский компонент:
```typescript
// components/auth/telegram-login.tsx
'use client'

import { useEffect, useRef } from 'react'

interface TelegramLoginProps {
  botUsername: string // @your_bot_username
  onAuth: (user: TelegramUser) => void
  buttonSize?: 'large' | 'medium' | 'small'
  cornerRadius?: number
  requestAccess?: boolean
}

interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export default function TelegramLogin({
  botUsername,
  onAuth,
  buttonSize = 'large',
  cornerRadius = 5,
  requestAccess = true
}: TelegramLoginProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Создаём callback функцию глобально
    ;(window as any).telegramLoginCallback = (user: TelegramUser) => {
      onAuth(user)
    }

    // Загружаем Telegram Widget скрипт
    if (containerRef.current && !containerRef.current.hasChildNodes()) {
      const script = document.createElement('script')
      script.src = 'https://telegram.org/js/telegram-widget.js?22'
      script.setAttribute('data-telegram-login', botUsername)
      script.setAttribute('data-size', buttonSize)
      script.setAttribute('data-radius', cornerRadius.toString())
      script.setAttribute('data-onauth', 'telegramLoginCallback(user)')
      script.setAttribute('data-request-access', requestAccess ? 'write' : '')
      script.async = true
      
      containerRef.current.appendChild(script)
    }

    return () => {
      delete (window as any).telegramLoginCallback
    }
  }, [botUsername, buttonSize, cornerRadius, requestAccess, onAuth])

  return <div ref={containerRef} />
}
```

#### API endpoint для обработки:
```typescript
// app/api/auth/telegram/route.ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Проверка хеша от Telegram
function verifyTelegramAuth(data: any, botToken: string): boolean {
  const { hash, ...fields } = data
  const dataCheckString = Object.keys(fields)
    .sort()
    .map(key => `${key}=${fields[key]}`)
    .join('\n')
  
  const secretKey = crypto.createHash('sha256').update(botToken).digest()
  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')
  
  return computedHash === hash
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { telegramData, orgId, inviteToken } = body
    
    // Проверяем подлинность данных от Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN!
    if (!verifyTelegramAuth(telegramData, botToken)) {
      return NextResponse.json({ error: 'Invalid Telegram authentication' }, { status: 400 })
    }
    
    const { id: tgUserId, first_name, last_name, username, photo_url } = telegramData
    
    // 1. Ищем существующего пользователя по Telegram ID
    const { data: existingUser } = await supabaseAdmin
      .from('user_telegram_accounts')
      .select('user_id, auth.users(email)')
      .eq('telegram_user_id', tgUserId)
      .eq('is_verified', true)
      .maybeSingle()
    
    let userId: string
    
    if (existingUser?.user_id) {
      // Пользователь уже существует
      userId = existingUser.user_id
    } else {
      // Создаём нового пользователя
      // Используем Telegram ID как основу для email (можно позже изменить)
      const email = `tg${tgUserId}@telegram.user`
      const password = crypto.randomBytes(32).toString('hex')
      
      const { data: newUser, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // автоматически подтверждаем
        user_metadata: {
          telegram_id: tgUserId,
          telegram_username: username,
          full_name: `${first_name}${last_name ? ' ' + last_name : ''}`
        }
      })
      
      if (signUpError || !newUser.user) {
        console.error('Error creating user:', signUpError)
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
      }
      
      userId = newUser.user.id
      
      // Сохраняем связку с Telegram
      await supabaseAdmin
        .from('user_telegram_accounts')
        .insert({
          user_id: userId,
          org_id: orgId,
          telegram_user_id: tgUserId,
          telegram_username: username,
          telegram_first_name: first_name,
          telegram_last_name: last_name,
          is_verified: true,
          verified_at: new Date().toISOString()
        })
    }
    
    // 2. Обрабатываем доступ к организации
    if (inviteToken) {
      // Используем invite token
      const { data: invite } = await supabaseAdmin
        .from('organization_invites')
        .select('*')
        .eq('token', inviteToken)
        .eq('is_active', true)
        .maybeSingle()
      
      if (invite) {
        // Проверяем ограничения
        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
          return NextResponse.json({ error: 'Invite expired' }, { status: 400 })
        }
        
        if (invite.max_uses && invite.current_uses >= invite.max_uses) {
          return NextResponse.json({ error: 'Invite limit reached' }, { status: 400 })
        }
        
        // Создаём participant
        await supabaseAdmin
          .from('participants')
          .upsert({
            org_id: invite.org_id,
            tg_user_id: tgUserId,
            username: username,
            full_name: `${first_name}${last_name ? ' ' + last_name : ''}`,
            participant_status: invite.access_type === 'full' ? 'participant' : 'event_attendee',
            source: 'invite'
          }, {
            onConflict: 'org_id,tg_user_id'
          })
        
        // Увеличиваем счётчик использований
        await supabaseAdmin
          .from('organization_invites')
          .update({ current_uses: invite.current_uses + 1 })
          .eq('id', invite.id)
        
        // Логируем использование
        await supabaseAdmin
          .from('organization_invite_uses')
          .insert({
            invite_id: invite.id,
            user_id: userId,
            telegram_user_id: tgUserId
          })
      }
    } else {
      // Проверяем, есть ли участник в базе (через Telegram-группы)
      const { data: existingParticipant } = await supabaseAdmin
        .from('participants')
        .select('id')
        .eq('org_id', orgId)
        .eq('tg_user_id', tgUserId)
        .maybeSingle()
      
      if (!existingParticipant) {
        return NextResponse.json({ 
          error: 'No access to this organization. Please use an invite link.' 
        }, { status: 403 })
      }
    }
    
    // 3. Создаём сессию для пользователя
    const { data: session, error: sessionError } = await supabaseAdmin.auth.admin.createSession({
      user_id: userId,
      session_not_after: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 дней
    })
    
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        telegram_id: tgUserId,
        username,
        full_name: `${first_name}${last_name ? ' ' + last_name : ''}`
      },
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token
      }
    })
    
  } catch (error) {
    console.error('Telegram auth error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### 5. Страницы для входа

#### A. Публичная страница приглашения
```typescript
// app/join/[org]/[token]/page.tsx
import TelegramLogin from '@/components/auth/telegram-login'

export default async function JoinPage({ 
  params 
}: { 
  params: Promise<{ org: string; token: string }> 
}) {
  const { org: orgId, token } = await params
  
  // Проверяем валидность invite
  // ... fetch invite info
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-4">
          Присоединяйтесь к {orgName}
        </h1>
        
        <p className="text-gray-600 mb-6">
          Войдите через Telegram, чтобы получить доступ к материалам и событиям организации.
        </p>
        
        <TelegramLogin
          botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME!}
          onAuth={async (user) => {
            // Отправляем на сервер
            const res = await fetch('/api/auth/telegram', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                telegramData: user,
                orgId,
                inviteToken: token
              })
            })
            
            const data = await res.json()
            
            if (data.success) {
              // Устанавливаем сессию
              // Редиректим в организацию
              window.location.href = `/app/${orgId}`
            }
          }}
        />
      </div>
    </div>
  )
}
```

#### B. Логин для существующих участников
```typescript
// app/login/page.tsx (обновить)
'use client'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        {/* Telegram Login */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-4">Войти через Telegram</h2>
          <p className="text-gray-600 mb-6">
            Быстрый вход для участников организаций
          </p>
          
          <TelegramLogin
            botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME!}
            onAuth={handleTelegramAuth}
          />
        </div>
        
        {/* Разделитель */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-gray-50 text-gray-500">или</span>
          </div>
        </div>
        
        {/* Email/Password для владельцев */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-4">Вход для владельцев</h2>
          {/* Существующая форма email/password */}
        </div>
      </div>
    </div>
  )
}
```

### 6. Управление приглашениями (для админов)

```typescript
// app/app/[org]/settings/invites/page.tsx
// Страница управления invite links
// - Создание новых приглашений
// - Просмотр статистики использования
// - Деактивация/удаление
```

## Итоговый Flow

### Новый участник (не в Telegram-группах):
```
1. Админ → создаёт invite link → /join/[org]/abc123
2. Участник → переходит по ссылке
3. Участник → "Войти через Telegram" → 1 клик
4. Система → создаёт auth.users + participants
5. Участник → автоматически попадает в /app/[org]
```

### Участник из Telegram-группы (уже в participants):
```
1. Участник → переходит на orbo.app
2. Участник → "Войти через Telegram" → 1 клик
3. Система → находит существующий participants по tg_user_id
4. Система → создаёт auth.users + связывает
5. Участник → автоматически видит свои организации
```

### Регистрация на публичное событие:
```
1. Участник → /p/[org]/events/[eventId]
2. Участник → может просмотреть без входа
3. Участник → "Зарегистрироваться" → Login через Telegram
4. Система → создаёт participants со статусом 'event_attendee'
5. Участник → зарегистрирован на событие
```

## Преимущества решения

✅ **Простота**: 1 клик для входа через Telegram  
✅ **Безопасность**: официальный механизм + проверка хеша  
✅ **Гибкость**: поддержка invite links с разными уровнями доступа  
✅ **Автосвязка**: автоматическое объединение данных из Telegram-групп и веб-входа  
✅ **Высокая конверсия**: минимум трения для участников  
✅ **Масштабируемость**: легко добавлять новые типы доступа

## Настройки бота

Для работы Telegram Login Widget нужно:
1. Получить имя бота: `@YourBotName`
2. Включить Domain в BotFather: `/setdomain` → `yourapp.com`
3. Добавить в `.env`:
```env
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=YourBotName
TELEGRAM_BOT_TOKEN=your_bot_token
```

## Следующие шаги реализации

1. ✅ Создать миграцию для `organization_invites`
2. ✅ Реализовать `TelegramLogin` компонент
3. ✅ Создать `/api/auth/telegram` endpoint
4. ✅ Создать страницу `/join/[org]/[token]`
5. ✅ Обновить `/login` страницу
6. ✅ Создать UI для управления приглашениями
7. ✅ Обновить публичные страницы событий
8. ✅ Документация для пользователей

---

**Готово к обсуждению и реализации!** 🚀

