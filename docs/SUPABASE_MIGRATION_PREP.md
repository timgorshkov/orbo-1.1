# 📦 Подготовка к миграции с Supabase

**Дата:** Декабрь 2025  
**Статус:** Подготовительный этап

---

## 📊 Анализ текущих зависимостей от Supabase

### ✅ Уже готово (абстракции созданы)

| Компонент | Статус | Файлы |
|-----------|--------|-------|
| **Storage** | ✅ Готов | `lib/storage/` - S3/Selectel уже поддерживается |
| **Auth Abstraction** | ✅ Готов (STUB) | `lib/auth/` - интерфейсы готовы |
| **PostgreSQL** | ✅ Настроен | `deploy/docker-compose.yml` |
| **Selectel S3** | ✅ Настроен | `.env` на сервере |

### 🔄 Требует миграции

| Компонент | Использований | Сложность | Приоритет |
|-----------|---------------|-----------|-----------|
| **Database Queries** | 500+ вызовов | 🟡 Средняя | 1 |
| **RPC Functions** | 128 функций | 🔴 Высокая | 2 |
| **Auth (Email OTP)** | 13 файлов | 🟡 Средняя | 3 |
| **RLS Policies** | ~50 политик | 🟢 Низкая | 4 |
| **Realtime** | Минимально | 🟢 Низкая | 5 |

---

## 🎯 Архитектура после миграции

```
┌─────────────────────────────────────────────────────────────┐
│                    Selectel Server                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Next.js   │  │ PostgreSQL  │  │   Nginx     │         │
│  │    App      │──│   Docker    │  │   Proxy     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│         │                │                                  │
│         ▼                │                                  │
│  ┌─────────────┐         │                                  │
│  │   Adminer   │─────────┘                                  │
│  │  (DB View)  │                                            │
│  └─────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
    ┌─────────────┐              ┌─────────────┐
    │ Selectel S3 │              │Unisender Go │
    │  (Storage)  │              │   (Email)   │
    └─────────────┘              └─────────────┘
                     │
                     ▼
              ┌─────────────┐
              │   OAuth     │
              │ Yandex/Google│
              └─────────────┘
```

---

## 1️⃣ СУБД на сервере

### 1.1 Текущее состояние

PostgreSQL 16 уже работает в Docker:
- Контейнер: `orbo_postgres`
- Порт: `127.0.0.1:5432`
- Оптимизирован для 32GB RAM

### 1.2 Подготовительные шаги

```bash
# Проверить статус
ssh selectel-orbo 'docker exec orbo_postgres psql -U orbo -c "SELECT version();"'

# Создать расширения (если нужны RPC функции)
ssh selectel-orbo 'docker exec orbo_postgres psql -U orbo -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"'
ssh selectel-orbo 'docker exec orbo_postgres psql -U orbo -c "CREATE EXTENSION IF NOT EXISTS uuid-ossp;"'
```

---

## 2️⃣ Инструменты просмотра БД

### Вариант А: Adminer (рекомендуется — лёгкий)

Добавить в `docker-compose.yml`:

```yaml
  # ============================================
  # Adminer - Database UI (lightweight)
  # ============================================
  adminer:
    image: adminer:latest
    container_name: orbo_adminer
    restart: unless-stopped
    environment:
      ADMINER_DEFAULT_SERVER: postgres
      ADMINER_DESIGN: hydra
    ports:
      - "127.0.0.1:8080:8080"
    depends_on:
      - postgres
```

Доступ через SSH-туннель:
```bash
# Локально (Windows PowerShell)
ssh -L 8080:localhost:8080 selectel-orbo

# Затем открыть http://localhost:8080
# System: PostgreSQL
# Server: postgres
# Username: orbo
# Password: <из .env>
# Database: orbo
```

### Вариант Б: pgAdmin 4

```yaml
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: orbo_pgadmin
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@orbo.ru
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_PASSWORD}
      PGADMIN_LISTEN_PORT: 5050
    ports:
      - "127.0.0.1:5050:5050"
    volumes:
      - ./data/pgadmin:/var/lib/pgadmin
    depends_on:
      - postgres
```

### Вариант В: DBeaver (локально)

Установить DBeaver Community на Windows и подключиться через SSH-туннель.

---

## 3️⃣ Мониторинг и логирование PostgreSQL

### 3.1 Уже настроено в docker-compose

```yaml
-c logging_collector=on
-c log_directory='/var/lib/postgresql/data/log'
-c log_filename='postgresql-%Y-%m-%d_%H%M%S.log'
-c log_min_duration_statement=1000  # Логирует запросы >1 сек
```

### 3.2 Просмотр логов PostgreSQL

```bash
# Последние логи
ssh selectel-orbo 'docker exec orbo_postgres tail -100 /var/lib/postgresql/data/log/$(ls -t /var/lib/postgresql/data/log/ | head -1)'

# Медленные запросы
ssh selectel-orbo 'docker exec orbo_postgres grep -i duration /var/lib/postgresql/data/log/$(ls -t /var/lib/postgresql/data/log/ | head -1) | tail -20'
```

### 3.3 Статистика запросов (pg_stat_statements)

```sql
-- Топ-10 медленных запросов
SELECT query, calls, total_exec_time, mean_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

### 3.4 Дополнительный мониторинг (опционально)

Prometheus + Grafana с postgres_exporter:

```yaml
  postgres-exporter:
    image: prometheuscommunity/postgres-exporter
    container_name: orbo_pg_exporter
    environment:
      DATA_SOURCE_NAME: "postgresql://orbo:${POSTGRES_PASSWORD}@postgres:5432/orbo?sslmode=disable"
    ports:
      - "127.0.0.1:9187:9187"
```

---

## 4️⃣ Функционал Supabase (не-СУБД)

### 4.1 Авторизация (Auth)

**Текущее состояние:**
- `signInWithOtp` — Email Magic Link через Supabase
- `exchangeCodeForSession` — PKCE flow
- `auth.getUser()` — 165 вызовов
- Telegram Auth — кастомный (не зависит от Supabase Auth)

**План миграции:**
1. **Заменить Email OTP на Unisender Go + Custom JWT**
2. **Добавить OAuth через Yandex/Google**
3. **Сохранить Telegram Auth** (уже независим)

### 4.2 Хранилище (Storage)

**Buckets:**
- `materials` — логотипы организаций, обложки событий
- `participant-photos` — фото участников
- `app-files` — файлы приложений

**Статус:** ✅ Selectel S3 уже настроен и поддерживается через `lib/storage/`

**Переключение:**
```env
STORAGE_PROVIDER=s3
SELECTEL_ACCESS_KEY=your_key
SELECTEL_SECRET_KEY=your_secret
SELECTEL_BUCKET=orbo-materials
```

### 4.3 Realtime

**Использование:** Минимальное (только в документации)

**Решение:** При необходимости — Socket.io или Supabase Realtime self-hosted

---

## 5️⃣ Миграция Email: Mailgun → Unisender Go

### 5.1 Текущий emailService

`lib/services/emailService.ts` использует Mailgun.

### 5.2 Unisender Go API

```typescript
// lib/services/email/unisenderGoProvider.ts

interface UnisenderGoConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

export class UnisenderGoEmailProvider implements EmailProvider {
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;
  private baseUrl = 'https://go1.unisender.ru/ru/transactional/api/v1';

  async send(params: SendEmailParams): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/email/send.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apiKey,
      },
      body: JSON.stringify({
        message: {
          recipients: [{ email: params.to }],
          subject: params.subject,
          body: {
            html: params.html,
            plaintext: params.text,
          },
          from_email: this.fromEmail,
          from_name: this.fromName,
        },
      }),
    });

    const result = await response.json();
    return result.status === 'success';
  }
}
```

### 5.3 Environment Variables

```env
# Unisender Go
EMAIL_PROVIDER=unisender
UNISENDER_API_KEY=your_api_key
UNISENDER_FROM_EMAIL=noreply@orbo.ru
UNISENDER_FROM_NAME=Orbo
```

---

## 6️⃣ OAuth: Yandex и Google

### 6.1 Создание приложений

**Yandex:**
1. Перейти на https://oauth.yandex.ru/
2. Создать приложение
3. Redirect URI: `https://my.orbo.ru/api/auth/callback/yandex`
4. Получить Client ID и Secret

**Google:**
1. Перейти на https://console.developers.google.com/
2. Создать OAuth 2.0 credentials
3. Redirect URI: `https://my.orbo.ru/api/auth/callback/google`
4. Получить Client ID и Secret

### 6.2 NextAuth конфигурация

```typescript
// lib/auth/providers.ts

import GoogleProvider from 'next-auth/providers/google';
import YandexProvider from 'next-auth/providers/yandex';

export const oauthProviders = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  }),
  YandexProvider({
    clientId: process.env.YANDEX_CLIENT_ID!,
    clientSecret: process.env.YANDEX_CLIENT_SECRET!,
  }),
];
```

### 6.3 Environment Variables

```env
# OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
YANDEX_CLIENT_ID=xxx
YANDEX_CLIENT_SECRET=xxx
NEXTAUTH_SECRET=your_random_secret
NEXTAUTH_URL=https://my.orbo.ru
```

---

## ✅ Подготовительные шаги (можно сделать сейчас)

### Фаза 0: Без изменения хранения данных в Supabase

| # | Задача | Сложность | Время | Статус |
|---|--------|-----------|-------|--------|
| 1 | Добавить Adminer в docker-compose | 🟢 | 15 мин | ⬜ |
| 2 | Включить pg_stat_statements | 🟢 | 5 мин | ⬜ |
| 3 | Создать абстракцию EmailProvider | 🟡 | 1 час | ⬜ |
| 4 | Интегрировать Unisender Go | 🟡 | 2 часа | ⬜ |
| 5 | Создать OAuth приложения (Yandex, Google) | 🟢 | 30 мин | ⬜ |
| 6 | Настроить NextAuth с OAuth | 🟡 | 2 часа | ⬜ |
| 7 | Переключить Storage на Selectel S3 | 🟢 | 30 мин | ⬜ |
| 8 | Мигрировать файлы из Supabase Storage | 🟡 | 1 час | ⬜ |
| 9 | Создать скрипт экспорта пользователей | 🟢 | 30 мин | ⬜ |
| 10 | Подготовить таблицу users в PostgreSQL | 🟢 | 30 мин | ⬜ |

---

## 🚀 Порядок выполнения

### Этап 1: Инфраструктура (без изменений в коде приложения)

1. **Добавить Adminer** — инструмент для просмотра БД
2. **Настроить pg_stat_statements** — мониторинг запросов
3. **Создать OAuth приложения** — подготовка к авторизации

### Этап 2: Обвязка (параллельно с Supabase)

4. **Создать Email Abstraction Layer**
5. **Интегрировать Unisender Go**
6. **Переключить Storage на Selectel S3**
7. **Мигрировать файлы**

### Этап 3: Auth (финальный этап)

8. **Настроить NextAuth**
9. **Экспортировать пользователей**
10. **Переключить авторизацию**

---

## 📝 Команды для быстрого старта

```bash
# 1. Добавить Adminer (скопировать конфиг и перезапустить)
ssh selectel-orbo 'cd ~/orbo && docker compose up -d adminer'

# 2. SSH-туннель для доступа к Adminer
ssh -L 8080:localhost:8080 selectel-orbo
# Открыть http://localhost:8080

# 3. Проверить PostgreSQL расширения
ssh selectel-orbo 'docker exec orbo_postgres psql -U orbo -c "\dx"'

# 4. Переключить Storage (изменить .env)
ssh selectel-orbo 'cd ~/orbo && sed -i "s/STORAGE_PROVIDER=supabase/STORAGE_PROVIDER=s3/" .env'
ssh selectel-orbo 'cd ~/orbo && docker compose restart app'
```

---

## ⚠️ Важные замечания

1. **Telegram Auth** уже независим от Supabase Auth — не требует миграции
2. **RLS политики** нужно будет заменить на код (guard функции уже есть в `lib/orgGuard.ts`)
3. **RPC функции** можно перенести в PostgreSQL как есть или переписать на TypeScript
4. **Миграция БД** — самый сложный этап, делать в последнюю очередь

---

*Документ создан: 17 декабря 2025*

