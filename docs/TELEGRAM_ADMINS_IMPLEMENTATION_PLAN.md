# План реализации логики администраторов (Вариант Б)

## Выбранный подход: Автоматическое создание профилей с постепенной активацией

### Принципы

1. ✅ **Автоматическое обнаружение** - система создаёт профиль при обнаружении админа
2. ✅ **Режим чтения без email** - админы без email могут только просматривать
3. ✅ **Возможность активации** - админ может добавить email и получить полные права
4. ✅ **Ручное добавление** - владелец может пригласить админа по email

---

## Архитектура решения

### 1. Создание "теневых" профилей

**Таблица:** `auth.users` + `memberships`

```sql
-- Теневой профиль создаётся так:
INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES (
  gen_random_uuid(),
  NULL, -- email пока нет
  NULL
);

INSERT INTO memberships (org_id, user_id, role, role_source, metadata)
VALUES (
  p_org_id,
  user_id,
  'admin',
  'telegram_admin',
  jsonb_build_object(
    'shadow_profile', true,
    'awaiting_email', true,
    'telegram_groups', [...]
  )
);
```

**Триггер:** Автоматическое создание при `sync_telegram_admins`

---

### 2. Права доступа

#### Без email (shadow_profile = true)

```typescript
// RLS политики
{
  role: 'admin',
  role_source: 'telegram_admin',
  metadata: { shadow_profile: true }
}

// Права:
✅ Просмотр материалов (read_only)
✅ Просмотр событий (read_only)
✅ Просмотр участников (read_only)
❌ Создание материалов
❌ Создание событий
❌ Редактирование
```

#### С подтверждённым email

```typescript
{
  role: 'admin',
  role_source: 'telegram_admin',
  metadata: { shadow_profile: false }
}

// Права:
✅ Все права чтения
✅ Создание материалов
✅ Создание событий
✅ Редактирование своих материалов/событий
✅ Управление участниками в своих группах
```

---

### 3. Процесс активации профиля

#### Шаг 1: Админ заходит в систему через Telegram

```typescript
// Через Telegram auth code
// Система находит user_id по tg_user_id
// Показывает список организаций, где он админ
```

#### Шаг 2: Предложение активировать профиль

```typescript
// UI показывает баннер:
"Вы администратор, но без подтверждённого email можете только просматривать.
Добавьте email для полного доступа."

[Добавить email →]
```

#### Шаг 3: Добавление email

```typescript
// Форма:
- Email input
- Отправить код подтверждения
- Ввод кода

// После подтверждения:
UPDATE auth.users SET email = ?, email_confirmed_at = NOW()
WHERE id = ?;

UPDATE memberships SET metadata = metadata - 'shadow_profile'
WHERE user_id = ? AND org_id = ?;
```

---

### 4. Конфликт email

**Проблема:** Email уже используется другим пользователем с другим Telegram.

**Сценарии:**

#### Сценарий А: Email существует, но без Telegram

```typescript
// Предложить объединить аккаунты
"Email уже используется. Это ваш аккаунт?
Мы можем привязать ваш Telegram к существующему профилю."

[Да, это я] [Нет, другой email]
```

Если "Да":
1. Проверка через email-код
2. Привязка tg_user_id к существующему user_id
3. Объединение memberships
4. Удаление теневого профиля

#### Сценарий Б: Email существует с другим Telegram

```typescript
"Этот email уже привязан к другому Telegram-аккаунту.
Возможные варианты:
1. Использовать другой email
2. Отвязать Telegram от старого аккаунта (требуется подтверждение)"

[Использовать другой email] [Запросить отвязку →]
```

#### Сценарий В: Email свободен

```typescript
// Стандартная процедура:
1. Отправить код на email
2. Подтвердить код
3. Привязать email к теневому профилю
```

---

### 5. Ручное добавление админов

**UI:** Настройки → Команда организации → [+ Добавить администратора]

**Форма:**
```typescript
interface AddAdminForm {
  email: string;              // Обязательно
  role: 'admin';              // Фиксировано
  groups?: string[];          // Опционально: к каким группам дать доступ
  send_invite?: boolean;      // Отправить приглашение на email
}
```

**Процесс:**

1. Проверка существования email в системе
2. Если email существует:
   - Добавить membership
   - Обновить metadata с указанием групп
   - Отправить уведомление
3. Если email не существует:
   - Создать приглашение (таблица `invitations`)
   - Отправить email с ссылкой
   - При переходе по ссылке - регистрация и создание membership

---

### 6. UI/UX для админов

#### Индикация статуса профиля

**Баннер в шапке (для теневых профилей):**
```tsx
<div className="bg-amber-50 border-b border-amber-200 p-3">
  <div className="flex items-center justify-between max-w-7xl mx-auto">
    <div className="flex items-center gap-2">
      <AlertCircle className="text-amber-600" size={20} />
      <span className="text-sm text-amber-800">
        Вы администратор, но с ограниченным доступом.
        Добавьте email для создания и редактирования материалов.
      </span>
    </div>
    <Button variant="amber" size="sm" onClick={() => router.push('/settings/profile')}>
      Добавить email
    </Button>
  </div>
</div>
```

#### Страница настроек профиля

```tsx
// /settings/profile

<Card>
  <CardHeader>
    <CardTitle>Активация профиля</CardTitle>
  </CardHeader>
  <CardContent>
    {!user.email ? (
      <>
        <p>Добавьте email для получения полных прав администратора:</p>
        <EmailVerificationForm onSuccess={handleEmailAdded} />
      </>
    ) : (
      <>
        <p>Email: {user.email} ✓</p>
        <p>У вас есть полные права администратора</p>
      </>
    )}
  </CardContent>
</Card>
```

#### Индикация прав в интерфейсе

```tsx
// Кнопки создания показываются только с email
{user.email ? (
  <Button onClick={handleCreate}>Создать материал</Button>
) : (
  <Tooltip content="Добавьте email для создания материалов">
    <Button disabled>Создать материал</Button>
  </Tooltip>
)}
```

---

## Реализация по шагам

### Этап 1: Обновление sync_telegram_admins (создание теневых профилей)

**Файл:** `db/migrations/46_sync_telegram_admins_with_shadow_profiles.sql`

```sql
CREATE OR REPLACE FUNCTION sync_telegram_admins(p_org_id UUID)
RETURNS TABLE(
  user_id UUID,
  action TEXT,
  groups_count INTEGER,
  is_shadow BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_admin_record RECORD;
BEGIN
  -- Получаем админов из Telegram
  FOR v_admin_record IN (
    SELECT DISTINCT
      uta.user_id AS admin_user_id,
      uta.telegram_user_id,
      ARRAY_AGG(DISTINCT tg.id) as group_ids,
      ARRAY_AGG(DISTINCT tg.title) as group_titles,
      ARRAY_AGG(DISTINCT tga.custom_title) FILTER (WHERE tga.custom_title IS NOT NULL) as custom_titles
    FROM telegram_group_admins tga
    INNER JOIN user_telegram_accounts uta ON uta.id = tga.user_telegram_account_id
    INNER JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
    INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tg.tg_chat_id
    WHERE 
      otg.org_id = p_org_id
      AND tga.is_admin = true
      AND uta.is_verified = true
      AND tga.expires_at > NOW()
    GROUP BY uta.user_id, uta.telegram_user_id
  ) LOOP
  
    -- Проверяем, есть ли уже membership
    IF NOT EXISTS (
      SELECT 1 FROM memberships 
      WHERE org_id = p_org_id AND user_id = v_admin_record.admin_user_id
    ) THEN
      -- Проверяем, есть ли email у пользователя
      DECLARE
        v_has_email BOOLEAN;
      BEGIN
        SELECT email IS NOT NULL INTO v_has_email
        FROM auth.users
        WHERE id = v_admin_record.admin_user_id;
        
        -- Создаём membership с отметкой о теневом профиле
        INSERT INTO memberships (org_id, user_id, role, role_source, metadata)
        VALUES (
          p_org_id,
          v_admin_record.admin_user_id,
          'admin',
          'telegram_admin',
          jsonb_build_object(
            'telegram_groups', v_admin_record.group_ids,
            'telegram_group_titles', v_admin_record.group_titles,
            'custom_titles', v_admin_record.custom_titles,
            'shadow_profile', NOT v_has_email,
            'synced_at', NOW()
          )
        );
        
        RETURN QUERY SELECT 
          v_admin_record.admin_user_id,
          'added'::TEXT,
          array_length(v_admin_record.group_ids, 1),
          NOT v_has_email;
      END;
    ELSE
      -- Обновляем существующий membership
      UPDATE memberships m
      SET 
        metadata = jsonb_build_object(
          'telegram_groups', v_admin_record.group_ids,
          'telegram_group_titles', v_admin_record.group_titles,
          'custom_titles', v_admin_record.custom_titles,
          'shadow_profile', (
            SELECT email IS NULL FROM auth.users WHERE id = m.user_id
          ),
          'synced_at', NOW()
        )
      WHERE m.org_id = p_org_id AND m.user_id = v_admin_record.admin_user_id;
      
      RETURN QUERY SELECT 
        v_admin_record.admin_user_id,
        'updated'::TEXT,
        array_length(v_admin_record.group_ids, 1),
        FALSE;
    END IF;
  END LOOP;
  
  -- Удаляем админов, потерявших права
  FOR v_admin_record IN (
    DELETE FROM memberships m
    WHERE 
      m.org_id = p_org_id
      AND m.role = 'admin'
      AND m.role_source = 'telegram_admin'
      AND NOT EXISTS (
        SELECT 1 
        FROM telegram_group_admins tga
        INNER JOIN user_telegram_accounts uta ON uta.id = tga.user_telegram_account_id
        INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
        WHERE 
          uta.user_id = m.user_id
          AND otg.org_id = p_org_id
          AND tga.is_admin = true
          AND tga.expires_at > NOW()
      )
    RETURNING user_id
  ) LOOP
    RETURN QUERY SELECT 
      v_admin_record.user_id,
      'removed'::TEXT,
      0,
      FALSE;
  END LOOP;
END;
$$;
```

---

### Этап 2: RLS политики для прав доступа

**Файл:** `db/migrations/47_rls_policies_for_shadow_admins.sql`

```sql
-- Функция для проверки, является ли админ активированным
CREATE OR REPLACE FUNCTION is_activated_admin(p_user_id UUID, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM memberships m
    INNER JOIN auth.users u ON u.id = m.user_id
    WHERE 
      m.user_id = p_user_id
      AND m.org_id = p_org_id
      AND m.role IN ('owner', 'admin')
      AND (
        m.role = 'owner' 
        OR u.email IS NOT NULL  -- Админы должны иметь email
      )
  );
$$;

-- Обновляем политики для материалов
DROP POLICY IF EXISTS "Admins can create materials" ON material_pages;
CREATE POLICY "Admins can create materials"
  ON material_pages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_activated_admin(auth.uid(), org_id)
  );

DROP POLICY IF EXISTS "Admins can update materials" ON material_pages;
CREATE POLICY "Admins can update materials"
  ON material_pages
  FOR UPDATE
  TO authenticated
  USING (
    is_activated_admin(auth.uid(), org_id)
  );

-- Обновляем политики для событий
DROP POLICY IF EXISTS "Admins can create events" ON events;
CREATE POLICY "Admins can create events"
  ON events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_activated_admin(auth.uid(), org_id)
  );

DROP POLICY IF EXISTS "Admins can update events" ON events;
CREATE POLICY "Admins can update events"
  ON events
  FOR UPDATE
  TO authenticated
  USING (
    is_activated_admin(auth.uid(), org_id)
  );

-- Политики чтения остаются прежними (все админы могут читать)
```

---

### Этап 3: UI для активации профиля

**Файл:** `app/settings/profile/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle } from 'lucide-react'

export default function ProfileActivationPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'input' | 'verify' | 'success'>('input')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSendCode = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/auth/activate-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action: 'send_code' })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Не удалось отправить код')
      }
      
      if (data.conflict) {
        // Показать диалог разрешения конфликта
        setError(data.message)
        return
      }
      
      setStep('verify')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/auth/activate-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, action: 'verify_code' })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Неверный код')
      }
      
      setStep('success')
      
      // Перезагрузить страницу через 2 секунды
      setTimeout(() => window.location.reload(), 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Активация профиля администратора</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'input' && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertCircle className="text-blue-600 flex-shrink-0" size={20} />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Для получения полных прав администратора</p>
                    <p>Добавьте и подтвердите ваш email. После этого вы сможете создавать и редактировать материалы и события.</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Email адрес
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button
                onClick={handleSendCode}
                disabled={!email || loading}
                className="w-full"
              >
                {loading ? 'Отправка...' : 'Отправить код подтверждения'}
              </Button>
            </>
          )}

          {step === 'verify' && (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                Код подтверждения отправлен на <strong>{email}</strong>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Код подтверждения
                </label>
                <Input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep('input')}
                  disabled={loading}
                >
                  Назад
                </Button>
                <Button
                  onClick={handleVerifyCode}
                  disabled={!code || loading}
                  className="flex-1"
                >
                  {loading ? 'Проверка...' : 'Подтвердить'}
                </Button>
              </div>
            </>
          )}

          {step === 'success' && (
            <div className="text-center py-6">
              <CheckCircle className="text-green-600 mx-auto mb-4" size={48} />
              <h3 className="text-lg font-semibold mb-2">Email подтверждён!</h3>
              <p className="text-neutral-600 text-sm">
                Теперь у вас есть полные права администратора. Страница перезагрузится...
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

---

### Этап 4: API endpoint для активации

**Файл:** `app/api/auth/activate-profile/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, code, action } = body

    const supabase = await createClientServer()
    const adminSupabase = createAdminServer()

    // Получаем текущего пользователя
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (action === 'send_code') {
      // Проверяем, не занят ли email
      const { data: existingUser } = await adminSupabase
        .from('auth.users')
        .select('id, email')
        .eq('email', email)
        .maybeSingle()

      if (existingUser && existingUser.id !== user.id) {
        // Проверяем, есть ли у того пользователя Telegram
        const { data: existingTelegram } = await adminSupabase
          .from('user_telegram_accounts')
          .select('telegram_user_id')
          .eq('user_id', existingUser.id)
          .eq('is_verified', true)
          .maybeSingle()

        if (existingTelegram) {
          return NextResponse.json({
            error: 'Email уже используется другим Telegram-аккаунтом',
            conflict: 'telegram_mismatch'
          }, { status: 409 })
        } else {
          // Предложить объединить аккаунты
          return NextResponse.json({
            conflict: 'merge_accounts',
            message: 'Email уже используется. Это ваш аккаунт? Мы можем привязать ваш Telegram.'
          }, { status: 409 })
        }
      }

      // Генерируем код
      const verificationCode = crypto.randomInt(100000, 999999).toString()
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 минут

      // Сохраняем код (можно в отдельную таблицу или в metadata пользователя)
      await adminSupabase
        .from('user_telegram_accounts')
        .update({
          metadata: {
            email_verification_code: verificationCode,
            email_verification_expires: expiresAt.toISOString(),
            pending_email: email
          }
        })
        .eq('user_id', user.id)

      // TODO: Отправить email с кодом
      // await sendVerificationEmail(email, verificationCode)

      // В dev режиме возвращаем код
      console.log(`Verification code for ${email}: ${verificationCode}`)

      return NextResponse.json({
        success: true,
        message: 'Код отправлен на email',
        // В dev режиме показываем код
        ...(process.env.NODE_ENV === 'development' && { code: verificationCode })
      })
    }

    if (action === 'verify_code') {
      // Проверяем код
      const { data: account } = await adminSupabase
        .from('user_telegram_accounts')
        .select('metadata')
        .eq('user_id', user.id)
        .single()

      if (!account?.metadata?.email_verification_code) {
        return NextResponse.json({ error: 'Код не найден' }, { status: 400 })
      }

      const expiresAt = new Date(account.metadata.email_verification_expires)
      if (expiresAt < new Date()) {
        return NextResponse.json({ error: 'Код истёк' }, { status: 400 })
      }

      if (account.metadata.email_verification_code !== code) {
        return NextResponse.json({ error: 'Неверный код' }, { status: 400 })
      }

      // Код верный, обновляем email
      await adminSupabase.auth.admin.updateUserById(user.id, {
        email: account.metadata.pending_email,
        email_confirm: true
      })

      // Обновляем memberships (убираем shadow_profile)
      await adminSupabase
        .from('memberships')
        .update({
          metadata: adminSupabase.raw(`metadata - 'shadow_profile'`)
        })
        .eq('user_id', user.id)
        .eq('role_source', 'telegram_admin')

      // Очищаем временные данные
      await adminSupabase
        .from('user_telegram_accounts')
        .update({
          metadata: null
        })
        .eq('user_id', user.id)

      return NextResponse.json({
        success: true,
        message: 'Email подтверждён'
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('Error in activate-profile:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
```

---

### Этап 5: Компонент баннера для теневых профилей

**Файл:** `components/shadow-profile-banner.tsx`

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

interface ShadowProfileBannerProps {
  isShadowProfile: boolean
}

export function ShadowProfileBanner({ isShadowProfile }: ShadowProfileBannerProps) {
  const router = useRouter()

  if (!isShadowProfile) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-amber-600 flex-shrink-0" size={20} />
            <p className="text-sm text-amber-800">
              Вы работаете в режиме чтения. 
              <strong className="ml-1">Добавьте email</strong> для создания и редактирования материалов.
            </p>
          </div>
          <Button
            size="sm"
            variant="default"
            onClick={() => router.push('/settings/profile')}
            className="bg-amber-600 hover:bg-amber-700"
          >
            Добавить email
          </Button>
        </div>
      </div>
    </div>
  )
}
```

---

### Этап 6: Форма ручного добавления админов

**Файл:** `components/settings/add-admin-dialog.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus } from 'lucide-react'

interface AddAdminDialogProps {
  organizationId: string
  onAdminAdded?: () => void
}

export function AddAdminDialog({ organizationId, onAdminAdded }: AddAdminDialogProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/organizations/${organizationId}/team/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Не удалось добавить администратора')
      }

      setSuccess(true)
      setEmail('')
      
      setTimeout(() => {
        setOpen(false)
        setSuccess(false)
        onAdminAdded?.()
      }, 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus size={16} className="mr-2" />
          Добавить администратора
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить администратора</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-2">
              Email администратора
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
            />
            <p className="text-xs text-neutral-500 mt-1">
              Если пользователь уже зарегистрирован, он сразу получит права.
              Иначе будет отправлено приглашение.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
              Администратор успешно добавлен!
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Добавление...' : 'Добавить'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

**Добавление в organization-team.tsx:**
```typescript
import { AddAdminDialog } from './add-admin-dialog'

// В CardHeader:
<CardHeader className="flex flex-row items-center justify-between">
  <CardTitle>Команда организации</CardTitle>
  <div className="flex gap-2">
    <AddAdminDialog 
      organizationId={organizationId}
      onAdminAdded={() => fetchTeam()}
    />
    <Button
      onClick={handleSync}
      disabled={isPending}
      variant="outline"
    >
      Синхронизировать с Telegram
    </Button>
  </div>
</CardHeader>
```

---

## Миграции для применения

1. `46_sync_telegram_admins_with_shadow_profiles.sql`
2. `47_rls_policies_for_shadow_admins.sql`

## Следующие шаги

- [ ] Применить миграции
- [ ] Создать UI компоненты
- [ ] Создать API endpoints
- [ ] Добавить отправку email с кодами
- [ ] Добавить иконки админов в списки участников
- [ ] Протестировать все сценарии

---

**Дата:** 2025-10-19  
**Статус:** План утверждён, готов к реализации

