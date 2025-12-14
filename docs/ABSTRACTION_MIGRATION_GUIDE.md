# 📚 Руководство по миграции на абстракции

Это руководство описывает, как постепенно мигрировать код с прямого использования Supabase на новые абстракции.

## 📁 Структура абстракций

```
lib/
├── db/                  # Database Abstraction
│   ├── types.ts         # Типы и интерфейсы
│   ├── supabase-client.ts # Supabase реализация
│   └── index.ts         # Entry point и factory
├── auth/                # Auth Abstraction
│   ├── types.ts         # Типы и интерфейсы
│   ├── supabase-auth.ts # Supabase реализация
│   └── index.ts         # Entry point и factory
└── storage/             # Storage Abstraction
    ├── types.ts         # Типы и интерфейсы
    ├── supabase-storage.ts # Supabase реализация
    └── index.ts         # Entry point и factory
```

---

## 🔄 Примеры миграции

### 1. Database Client

**БЫЛО (старый код):**
```typescript
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'

export async function GET() {
  const supabase = await createClientServer()
  const adminSupabase = createAdminServer()
  
  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('org_id', orgId)
  
  const { data: adminData } = await adminSupabase
    .from('users')
    .select('*')
}
```

**СТАЛО (новый код):**
```typescript
import { createServerDb, createAdminDb } from '@/lib/db'

export async function GET() {
  const db = await createServerDb()
  const adminDb = createAdminDb()
  
  const { data, error } = await db
    .from('participants')
    .select('*')
    .eq('org_id', orgId)
  
  const { data: adminData } = await adminDb
    .from('users')
    .select('*')
}
```

### 2. Auth

**БЫЛО (старый код):**
```typescript
import { createClientServer } from '@/lib/server/supabaseServer'

export async function GET() {
  const supabase = await createClientServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
```

**СТАЛО (новый код):**
```typescript
import { createServerAuth, requireAuth } from '@/lib/auth'

export async function GET() {
  // Вариант 1: Ручная проверка
  const auth = createServerAuth()
  const { data: user, error } = await auth.getUser()
  
  if (error || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Вариант 2: Хелпер (выбросит исключение если не авторизован)
  const user = await requireAuth()
}
```

### 3. Storage

**БЫЛО (старый код):**
```typescript
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const { data, error } = await supabase.storage
    .from('materials')
    .upload(`org-logos/${orgId}.jpg`, file, {
      contentType: 'image/jpeg',
      upsert: true
    })
  
  const { data: { publicUrl } } = supabase.storage
    .from('materials')
    .getPublicUrl(`org-logos/${orgId}.jpg`)
}
```

**СТАЛО (новый код):**
```typescript
import { createStorage, uploadOrgLogo } from '@/lib/storage'

export async function POST(request: Request) {
  // Вариант 1: Через общий интерфейс
  const storage = createStorage()
  
  const { data, error } = await storage.upload(
    'materials',
    `org-logos/${orgId}.jpg`,
    file,
    { contentType: 'image/jpeg', upsert: true }
  )
  
  const publicUrl = storage.getPublicUrl('materials', `org-logos/${orgId}.jpg`)
  
  // Вариант 2: Через хелпер
  const { url, error } = await uploadOrgLogo(orgId, file, 'image/jpeg')
}
```

---

## 🎯 Стратегия постепенной миграции

### Этап 1: Новый код
Весь новый код пишется с использованием абстракций:
```typescript
import { createServerDb } from '@/lib/db'
import { createServerAuth } from '@/lib/auth'
import { createStorage } from '@/lib/storage'
```

### Этап 2: Критические пути
Мигрируем критические API routes:
- `/api/auth/*`
- `/api/dashboard/*`
- `/api/events/*`

### Этап 3: Остальной код
Постепенно мигрируем остальные файлы по мере их изменения.

---

## ⚙️ Environment Variables

Добавьте в `.env`:

```env
# Текущий провайдер (по умолчанию 'supabase')
DB_PROVIDER=supabase
AUTH_PROVIDER=supabase
STORAGE_PROVIDER=supabase

# После миграции измените на:
# DB_PROVIDER=postgres
# AUTH_PROVIDER=nextauth
# STORAGE_PROVIDER=r2
```

---

## 🔧 Когда нужен прямой Supabase клиент

Иногда нужен прямой доступ к Supabase (например, для realtime или специфичных операций):

```typescript
import { getSupabaseClient, getSupabaseAdminClient } from '@/lib/db'

// Для операций с realtime
const supabase = await getSupabaseClient()
supabase.channel('changes').on('postgres_changes', ...)

// Для admin операций
const adminSupabase = getSupabaseAdminClient()
```

---

## 📋 Чеклист миграции файла

- [ ] Заменить импорты
- [ ] Заменить `supabase.auth.*` на методы `AuthProvider`
- [ ] Заменить `supabase.storage.*` на методы `StorageProvider`
- [ ] Заменить `supabase.from()` на `db.from()`
- [ ] Заменить `supabase.rpc()` на `db.rpc()`
- [ ] Проверить типизацию
- [ ] Протестировать функционал

---

## 🚨 Важные отличия

### 1. Типы результатов
Абстракции используют унифицированные типы:
```typescript
interface DbResult<T> {
  data: T | null;
  error: DbError | null;
  count?: number | null;
}
```

### 2. RPC функции
RPC вызовы работают так же:
```typescript
const { data, error } = await db.rpc('get_churning_participants', {
  p_org_id: orgId,
  p_days_silent: 14
})
```

### 3. Транзакции
Для транзакций пока используйте raw SQL:
```typescript
// TODO: Добавить поддержку транзакций в абстракцию
const supabase = getSupabaseAdminClient()
await supabase.rpc('transaction_function', { ... })
```

