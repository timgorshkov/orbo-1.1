# 🚀 План миграции с Supabase

> ✅ **МИГРАЦИЯ ЗАВЕРШЕНА** (Январь 2026)
> 
> - ✅ База данных: PostgreSQL на сервере Selectel
> - ✅ Storage: Selectel S3
> - ✅ Auth: NextAuth.js (Google, Yandex, Email magic link)
> 
> Этот документ сохранён для истории.

## 📊 Текущие зависимости от Supabase

### 1. Database (PostgreSQL)
| Компонент | Использований | Сложность миграции |
|-----------|---------------|-------------------|
| Supabase Client | 504 вызовов в 172 файлах | 🟡 Средняя |
| RPC Functions | 70+ вызовов, 128 функций | 🔴 Высокая |
| RLS Policies | ~50 политик | 🟢 Можно заменить на код |
| Triggers | ~20 триггеров | 🟡 Средняя |

### 2. Auth
| Функция | Использований | Альтернатива |
|---------|---------------|--------------|
| `auth.getUser()` | 165 вызовов | NextAuth / Lucia / Custom JWT |
| `auth.signInWithOtp()` | Email OTP | Resend + Custom |
| `auth.exchangeCodeForSession()` | PKCE | NextAuth |
| Telegram Auth | Custom | Оставить как есть |

### 3. Storage
| Bucket | Файлы | Альтернатива |
|--------|-------|--------------|
| `materials` | org logos, event covers, photos | S3 / Cloudflare R2 |

---

## 🎯 Стратегия миграции

### Фаза 1: Абстракция (1-2 недели)
**Цель:** Создать абстракционный слой, изолирующий код от Supabase

#### 1.1 Database Abstraction Layer

```typescript
// lib/db/client.ts - Абстракция клиента БД
export interface DbClient {
  from(table: string): QueryBuilder;
  rpc(name: string, params: Record<string, any>): Promise<any>;
}

// lib/db/supabase.ts - Текущая реализация
export class SupabaseDbClient implements DbClient { ... }

// lib/db/postgres.ts - Будущая реализация
export class PostgresDbClient implements DbClient { ... }

// lib/db/index.ts - Factory
export function createDbClient(): DbClient {
  if (process.env.DB_PROVIDER === 'postgres') {
    return new PostgresDbClient();
  }
  return new SupabaseDbClient();
}
```

#### 1.2 Auth Abstraction Layer

```typescript
// lib/auth/types.ts
export interface AuthUser {
  id: string;
  email?: string;
  telegram_user_id?: number;
}

export interface AuthProvider {
  getUser(): Promise<AuthUser | null>;
  signInWithEmail(email: string): Promise<void>;
  signInWithTelegram(code: string): Promise<AuthUser>;
  signOut(): Promise<void>;
}

// lib/auth/supabase.ts - Текущая реализация
export class SupabaseAuthProvider implements AuthProvider { ... }

// lib/auth/nextauth.ts - Будущая реализация  
export class NextAuthProvider implements AuthProvider { ... }
```

#### 1.3 Storage Abstraction Layer

```typescript
// lib/storage/types.ts
export interface StorageProvider {
  upload(bucket: string, path: string, file: Buffer): Promise<string>;
  getPublicUrl(bucket: string, path: string): string;
  delete(bucket: string, path: string): Promise<void>;
}

// lib/storage/supabase.ts
export class SupabaseStorage implements StorageProvider { ... }

// lib/storage/s3.ts
export class S3Storage implements StorageProvider { ... }
```

---

### Фаза 2: Рефакторинг RLS → Code (1 неделя)

**Проблема:** RLS в Supabase выполняется на уровне БД. При переходе на обычный PostgreSQL нужно перенести эту логику в код.

#### 2.1 Текущие RLS политики → Guard функции

```typescript
// lib/guards/orgGuard.ts
export async function requireOrgMembership(
  db: DbClient,
  userId: string,
  orgId: string
): Promise<{ role: 'owner' | 'admin' | 'member' }> {
  const membership = await db
    .from('memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .single();
  
  if (!membership) {
    throw new ForbiddenError('Not a member of organization');
  }
  
  return { role: membership.role };
}

export async function requireOrgAdmin(
  db: DbClient,
  userId: string,
  orgId: string
): Promise<void> {
  const { role } = await requireOrgMembership(db, userId, orgId);
  if (!['owner', 'admin'].includes(role)) {
    throw new ForbiddenError('Admin access required');
  }
}
```

#### 2.2 Middleware для защиты роутов

```typescript
// middleware/auth.ts
export function withOrgAccess(handler: Handler, requiredRole?: string) {
  return async (req: Request, ctx: Context) => {
    const user = await auth.getUser();
    if (!user) throw new UnauthorizedError();
    
    const orgId = ctx.params.org;
    await requireOrgMembership(db, user.id, orgId);
    
    return handler(req, ctx);
  };
}
```

---

### Фаза 3: Миграция RPC функций (1-2 недели)

**128 SQL функций** нужно либо:
- Перенести в PostgreSQL как есть (если используете PostgreSQL)
- Переписать на TypeScript (если другая БД)

#### 3.1 Критические функции для миграции

| Функция | Сложность | Решение |
|---------|-----------|---------|
| `sync_telegram_admins` | 🔴 | Переписать на TS |
| `get_churning_participants` | 🟡 | SQL или TS |
| `get_inactive_newcomers` | 🟡 | SQL или TS |
| `user_is_member_of_org` | 🟢 | TS guard |
| `user_is_org_admin` | 🟢 | TS guard |
| `log_error` | 🟢 | TS service |
| `log_admin_action` | 🟢 | TS service |

#### 3.2 Пример миграции функции

**SQL (Supabase):**
```sql
CREATE FUNCTION get_churning_participants(p_org_id UUID, p_days_silent INT)
RETURNS TABLE(...) AS $$
  SELECT ...
  FROM participants p
  WHERE p.org_id = p_org_id
  AND p.last_active_at < NOW() - (p_days_silent || ' days')::interval
$$;
```

**TypeScript (миграция):**
```typescript
// lib/services/participantAnalytics.ts
export async function getChurningParticipants(
  db: DbClient,
  orgId: string,
  daysSilent: number
): Promise<ChurningParticipant[]> {
  const cutoffDate = subDays(new Date(), daysSilent);
  
  const { data } = await db
    .from('participants')
    .select('id, full_name, last_active_at')
    .eq('org_id', orgId)
    .lt('last_active_at', cutoffDate.toISOString());
  
  return data || [];
}
```

---

### Фаза 4: Миграция Auth (1 неделя)

#### 4.1 Рекомендуемые альтернативы

| Решение | Плюсы | Минусы |
|---------|-------|--------|
| **NextAuth.js** | Популярный, много провайдеров | Нет Telegram из коробки |
| **Lucia Auth** | Легковесный, гибкий | Меньше документации |
| **Custom JWT** | Полный контроль | Больше кода |

#### 4.2 План миграции Auth

1. **Сохранить Telegram Auth** - уже custom, не зависит от Supabase Auth
2. **Заменить Email OTP:**
   ```typescript
   // Текущий: Supabase Auth OTP
   await supabase.auth.signInWithOtp({ email });
   
   // Новый: Resend + Custom token
   const code = generateOTPCode();
   await db.from('auth_codes').insert({ email, code, expires_at });
   await resend.send({ to: email, code });
   ```

3. **Session Management:**
   ```typescript
   // Использовать JWT в httpOnly cookie
   // middleware.ts проверяет и обновляет токен
   ```

#### 4.3 Миграция пользователей

```sql
-- Экспорт пользователей из Supabase
SELECT 
  id,
  email,
  created_at,
  last_sign_in_at
FROM auth.users;

-- Импорт в новую таблицу
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
);
```

---

### Фаза 5: Миграция Storage (3-5 дней)

#### 5.1 Альтернативы

| Решение | Стоимость | Плюсы |
|---------|-----------|-------|
| **Selectel S3** | ~₽0.92/GB/mo | 🇷🇺 Российский, S3-совместимый, низкая латентность |
| **Cloudflare R2** | $0.015/GB/mo | S3-совместимый, без egress fees |
| **AWS S3** | $0.023/GB/mo | Стандарт индустрии |
| **MinIO** | Self-hosted | Бесплатный, S3-совместимый |

#### 5.1.1 Selectel Object Storage (рекомендуется)

Selectel предоставляет S3-совместимое объектное хранилище:

```typescript
// lib/storage/selectel-storage.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: 'ru-1', // Selectel region
  endpoint: 'https://s3.storage.selcloud.ru',
  credentials: {
    accessKeyId: process.env.SELECTEL_ACCESS_KEY!,
    secretAccessKey: process.env.SELECTEL_SECRET_KEY!,
  },
  forcePathStyle: true, // Важно для Selectel
});

export class SelectelStorageProvider implements StorageProvider {
  // Реализация аналогична S3
}
```

**Environment Variables для Selectel:**
```env
STORAGE_PROVIDER=s3
SELECTEL_ACCESS_KEY=your_access_key
SELECTEL_SECRET_KEY=your_secret_key
SELECTEL_BUCKET=orbo-materials
SELECTEL_ENDPOINT=https://s3.storage.selcloud.ru
SELECTEL_REGION=ru-1
```

#### 5.2 Миграция файлов

```typescript
// scripts/migrate-storage.ts
async function migrateStorage() {
  const supabase = createClient(...);
  const s3 = new S3Client(...);
  
  // 1. Получить список файлов
  const { data: files } = await supabase.storage
    .from('materials')
    .list();
  
  // 2. Скопировать каждый файл
  for (const file of files) {
    const { data } = await supabase.storage
      .from('materials')
      .download(file.name);
    
    await s3.send(new PutObjectCommand({
      Bucket: 'orbo-materials',
      Key: file.name,
      Body: data
    }));
  }
  
  // 3. Обновить URLs в БД
  await db.raw(`
    UPDATE organizations 
    SET logo_url = REPLACE(logo_url, 'supabase.co', 'r2.cloudflarestorage.com')
  `);
}
```

---

### Фаза 6: Миграция Database (1-2 недели)

#### 6.1 Экспорт данных из Supabase

```bash
# Через Supabase CLI
supabase db dump -f supabase_dump.sql

# Или через pg_dump
pg_dump -h db.xxx.supabase.co -U postgres -d postgres > dump.sql
```

#### 6.2 Настройка нового PostgreSQL

**Рекомендуемые хостинги:**
| Хостинг | Бесплатный план | Платный | Плюсы |
|---------|-----------------|---------|-------|
| **Selectel DBaaS** | - | от ₽500/mo | 🇷🇺 Российский, низкая латентность, managed |
| **Neon** | 0.5GB | $19/mo | Serverless, auto-scaling |
| **Railway** | $5 кредит | Pay-as-you-go | Простота |
| **Supabase Self-hosted** | - | Self-hosted | Знакомый API |

#### 6.2.1 Selectel Managed PostgreSQL (рекомендуется)

Selectel предоставляет managed PostgreSQL с автоматическими бэкапами:

```env
# Selectel DBaaS PostgreSQL
DATABASE_URL=postgresql://user:password@node-xxx.db.selcloud.ru:5432/orbo?sslmode=require
DB_PROVIDER=postgres

# Connection pooling (PgBouncer встроен в Selectel)
DATABASE_POOL_SIZE=20
```

**Преимущества Selectel для российского проекта:**
- 🇷🇺 Данные хранятся в России (соответствие 152-ФЗ)
- ⚡ Низкая латентность для российских пользователей
- 💰 Оплата в рублях
- 📞 Русскоязычная поддержка

#### 6.3 Connection Pooling

```typescript
// lib/db/postgres.ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}
```

---

## 📋 Чеклист миграции

### Подготовка
- [ ] Создать абстракцию для DB клиента
- [ ] Создать абстракцию для Auth
- [ ] Создать абстракцию для Storage
- [ ] Написать тесты для критических функций

### Миграция RLS → Code
- [ ] Создать guard функции для memberships
- [ ] Создать guard функции для participants
- [ ] Создать guard функции для events
- [ ] Обновить все API routes

### Миграция RPC
- [ ] Перенести `sync_telegram_admins`
- [ ] Перенести `get_churning_participants`
- [ ] Перенести `get_inactive_newcomers`
- [ ] Перенести аналитические функции
- [ ] Перенести функции логирования

### Миграция Auth
- [ ] Настроить NextAuth или альтернативу
- [ ] Мигрировать Email OTP на Resend
- [ ] Сохранить Telegram Auth
- [ ] Экспортировать/импортировать пользователей
- [ ] Тестировать все auth flows

### Миграция Storage
- [ ] Настроить S3/R2
- [ ] Скопировать все файлы
- [ ] Обновить URLs в БД
- [ ] Обновить код загрузки файлов

### Миграция Database
- [ ] Экспортировать данные из Supabase
- [ ] Настроить новый PostgreSQL
- [ ] Импортировать данные
- [ ] Настроить connection pooling
- [ ] Проверить все RPC функции

### Финализация
- [ ] Обновить environment variables
- [ ] Тестировать все функции
- [ ] Обновить CI/CD
- [ ] Отключить Supabase

---

## ⏱️ Оценка времени

| Фаза | Время | Зависимости |
|------|-------|-------------|
| 1. Абстракция | 1-2 недели | - |
| 2. RLS → Code | 1 неделя | Фаза 1 |
| 3. Миграция RPC | 1-2 недели | Фаза 1, 2 |
| 4. Миграция Auth | 1 неделя | Фаза 1 |
| 5. Миграция Storage | 3-5 дней | - |
| 6. Миграция Database | 1-2 недели | Фаза 1-4 |

**Общее время:** 6-10 недель при работе 1 разработчика

---

## 🔧 Рекомендуемый стек после миграции

### Вариант 1: Selectel (🇷🇺 рекомендуется для России)
```
Frontend: Next.js 15 (Vercel или Selectel Cloud)
Auth: NextAuth.js v5 + Resend/Unisender (Email OTP)
Database: Selectel Managed PostgreSQL
Storage: Selectel S3 Object Storage
ORM: Drizzle ORM или Prisma
Hosting: Selectel Cloud или Vercel
```

### Вариант 2: Международный стек
```
Frontend: Next.js 15 (Vercel)
Auth: NextAuth.js v5 + Resend (Email OTP)
Database: Neon PostgreSQL или Railway PostgreSQL
Storage: Cloudflare R2
ORM: Drizzle ORM или Prisma
```

### Сравнение вариантов

| Критерий | Selectel | Международный |
|----------|----------|---------------|
| Латентность для РФ | ⭐⭐⭐ Отличная | ⭐ Средняя |
| Соответствие 152-ФЗ | ✅ Да | ❌ Нет |
| Оплата в рублях | ✅ Да | ❌ Нет |
| Стоимость | ~₽3000-5000/mo | ~$50-100/mo |

---

## 💡 Альтернативный подход: Supabase Self-hosted

Если цель - снизить затраты без полной миграции:

```yaml
# docker-compose.yml
services:
  supabase-db:
    image: supabase/postgres
  supabase-auth:
    image: supabase/gotrue
  supabase-storage:
    image: supabase/storage-api
  supabase-kong:
    image: kong:2.8.1
```

**Плюсы:**
- Минимальные изменения в коде
- Знакомый API
- Сохраняются все RLS и RPC

**Минусы:**
- Нужен сервер для хостинга
- Требуется DevOps экспертиза

