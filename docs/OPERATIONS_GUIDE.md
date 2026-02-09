# Руководство по операциям: Деплой, SSH, База данных

> **Версия:** 1.0 (9 февраля 2026)
> **Сервер:** Selectel VPS
> **Домены:** orbo.ru (лендинг), my.orbo.ru (приложение)

---

## 1. SSH-подключение к серверу

### Быстрое подключение

```bash
# Используем настроенный SSH alias
ssh selectel-orbo
```

### SSH Config (файл `~/.ssh/config`)

```
Host selectel-orbo
    HostName <IP-адрес сервера>
    User deploy
    IdentityFile ~/.ssh/selectel_key
    ServerAliveInterval 60
```

### Полезные команды после подключения

```bash
# Перейти в директорию проекта
cd ~/orbo

# Посмотреть статус контейнеров
docker compose ps

# Посмотреть логи приложения (последние 100 строк)
docker compose logs --tail=100 app

# Следить за логами в реальном времени
docker compose logs -f app

# Использование ресурсов
docker stats --no-stream
free -h
df -h
```

---

## 2. Процесс деплоя

### 2.1 Стандартный деплой (с локальной Windows-машины)

```powershell
# 1. Из корня проекта скопировать файлы на сервер
scp -r app/ components/ lib/ deploy/ package.json package-lock.json next.config.js tailwind.config.js tsconfig.json postcss.config.js middleware.ts auth.ts public/ deploy@selectel-orbo:~/orbo/

# 2. Подключиться к серверу
ssh selectel-orbo

# 3. На сервере: пересобрать и перезапустить
cd ~/orbo
docker compose build app && docker compose up -d app

# 4. Проверить логи на ошибки
docker compose logs --tail=50 app
```

### 2.2 Быстрый деплой (только приложение)

```powershell
# Скрипт deploy.ps1 автоматизирует шаги выше
.\deploy\scripts\deploy.ps1
```

### 2.3 Применение миграций БД

Миграции применяются **вручную** после деплоя, если были добавлены новые файлы в `db/migrations/`.

```bash
# На сервере
ssh selectel-orbo
cd ~/orbo

# 1. Скопировать миграции (если не скопированы при деплое)
# С локальной машины:
# scp db/migrations/NEW_MIGRATION.sql deploy@selectel-orbo:~/orbo/db/migrations/

# 2. Применить конкретную миграцию
docker exec -i orbo_postgres psql -U orbo -d orbo < db/migrations/223_your_migration.sql

# 3. Проверить результат
docker exec -it orbo_postgres psql -U orbo -d orbo -c "\dt"
```

### 2.4 Проверка после деплоя

```bash
# Health check
curl -s https://my.orbo.ru/api/health | jq

# Проверить логи на ошибки
docker compose logs --tail=200 app | grep -i "error\|warn"

# Проверить webhook-статус
curl -s "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo" | jq
```

---

## 3. Работа с базой данных

### 3.1 Подключение к PostgreSQL

```bash
# Интерактивная консоль psql
docker exec -it orbo_postgres psql -U orbo -d orbo

# Выполнить одну команду
docker exec -it orbo_postgres psql -U orbo -d orbo -c "SELECT count(*) FROM organizations;"
```

### 3.2 Полезные SQL-запросы

```sql
-- Количество организаций и участников
SELECT 
  (SELECT count(*) FROM organizations) as orgs,
  (SELECT count(*) FROM participants) as participants,
  (SELECT count(*) FROM users) as users,
  (SELECT count(*) FROM events) as events;

-- Активные организации с количеством участников
SELECT o.name, o.id, 
  (SELECT count(*) FROM participants p WHERE p.org_id = o.id AND p.merged_into IS NULL) as participants_count,
  (SELECT count(*) FROM org_telegram_groups otg WHERE otg.org_id = o.id) as groups_count
FROM organizations o
WHERE o.status = 'active'
ORDER BY participants_count DESC;

-- Последние ошибки
SELECT created_at, error_type, message, url 
FROM error_logs 
ORDER BY created_at DESC 
LIMIT 20;

-- Статус уведомлений по организации
SELECT item_type, count(*), 
  count(*) FILTER (WHERE resolved_at IS NOT NULL) as resolved
FROM attention_zone_items 
WHERE org_id = 'ORG_ID_HERE'
GROUP BY item_type;

-- Проверить суперадминов
SELECT s.user_id, u.email, s.is_active, s.last_login_at
FROM superadmins s
JOIN users u ON u.id = s.user_id;
```

### 3.3 Резервное копирование

```bash
# Создать бэкап
docker exec orbo_postgres pg_dump -U orbo -d orbo --format=custom > backup_$(date +%Y%m%d_%H%M%S).dump

# Восстановить из бэкапа
docker exec -i orbo_postgres pg_restore -U orbo -d orbo --clean --if-exists < backup_file.dump

# Автоматические бэкапы (настроены через cron)
crontab -l  # Посмотреть расписание
```

### 3.4 Миграции

Миграции хранятся в `db/migrations/` и нумеруются последовательно (001, 002, ..., 223+).

```bash
# Посмотреть какие миграции есть
ls -la ~/orbo/db/migrations/ | tail -20

# Применить все новые миграции (пример скрипта)
for f in ~/orbo/db/migrations/NEW_*.sql; do
  echo "Applying $f..."
  docker exec -i orbo_postgres psql -U orbo -d orbo < "$f"
done

# Проверить, что RPC-функции созданы
docker exec -it orbo_postgres psql -U orbo -d orbo -c "
  SELECT routine_name FROM information_schema.routines 
  WHERE routine_type = 'FUNCTION' AND routine_schema = 'public' 
  ORDER BY routine_name;"
```

---

## 4. Docker-управление

### 4.1 Контейнеры

```bash
# Статус контейнеров
docker compose ps

# Перезапуск конкретного контейнера
docker compose restart app
docker compose restart nginx
docker compose restart postgres

# Пересборка приложения с нуля (без кэша)
docker compose build --no-cache app

# Обновление Docker образов
docker compose pull
```

### 4.2 Очистка

```bash
# Очистка неиспользуемых образов и кэша
docker system prune -a

# Проверка размера Docker данных
docker system df

# Очистка логов контейнеров
sudo truncate -s 0 /var/lib/docker/containers/*/*-json.log
```

### 4.3 Мониторинг

```bash
# Использование CPU/памяти контейнерами
docker stats --no-stream

# Размер базы данных
docker exec -it orbo_postgres psql -U orbo -d orbo -c "
  SELECT pg_size_pretty(pg_database_size('orbo'));"

# Проверка дискового пространства
df -h
du -sh ~/orbo/*
```

---

## 5. Nginx и SSL

### 5.1 Конфигурация

```bash
# Проверить конфигурацию nginx
docker compose exec nginx nginx -t

# Перезагрузить nginx после изменений
docker compose exec nginx nginx -s reload

# Конфиг файл
cat ~/orbo/nginx/nginx.conf
```

### 5.2 SSL-сертификаты

```bash
# Обновить сертификаты (Let's Encrypt)
docker compose exec nginx certbot renew

# Проверить срок действия
docker compose exec nginx certbot certificates
```

---

## 6. Логирование

### 6.1 Просмотр логов

```bash
# Логи приложения
docker compose logs --tail=100 app

# Только ошибки
docker compose logs app 2>&1 | grep -i "level=error"

# Логи за последний час
docker compose logs --since="1h" app

# Логи nginx (access)
tail -100 ~/orbo/nginx/logs/access.log

# Логи PostgreSQL
docker compose logs --tail=50 postgres
```

### 6.2 Ротация логов

Настроена через logrotate (`/etc/logrotate.d/orbo-docker`):
- Docker JSON logs: ротация при >50MB, хранение 5 файлов
- Nginx access logs: ротация еженедельно, хранение 4 файлов

---

## 7. Troubleshooting

### Приложение не запускается

```bash
# 1. Проверить логи
docker compose logs app

# 2. Проверить переменные окружения
docker exec orbo_app env | grep -E "POSTGRES|NEXTAUTH|TELEGRAM"

# 3. Проверить доступность БД
docker exec orbo_app wget -qO- http://postgres:5432 2>&1 || echo "DB reachable"

# 4. Проверить health check
curl -s http://localhost:3000/api/health
```

### Ошибки "Cannot read properties of undefined (reading 'searchParams')"

Проблема с подключением к БД. Проверить:
```bash
# Корректность переменных подключения
docker exec orbo_app env | grep POSTGRES

# Должны быть: POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
# НЕ должно быть: DATABASE_URL (устаревший формат)
```

### Webhook не работает

```bash
# Проверить статус webhook
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN_MAIN}/getWebhookInfo" | jq

# Переустановить webhook
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN_MAIN}/setWebhook?url=https://my.orbo.ru/api/telegram/webhook&secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

### Высокое потребление памяти

```bash
# Проверить потребление
free -h
docker stats --no-stream

# PostgreSQL: проверить shared_buffers
docker exec -it orbo_postgres psql -U orbo -d orbo -c "SHOW shared_buffers;"
# Рекомендуемое значение: 256MB-512MB для сервера с 4GB RAM
```

---

## 8. Переменные окружения

### Обязательные

| Переменная | Описание |
|------------|----------|
| `POSTGRES_HOST` | Хост БД (обычно `postgres` в Docker) |
| `POSTGRES_PORT` | Порт БД (обычно `5432`) |
| `POSTGRES_DB` | Имя базы данных |
| `POSTGRES_USER` | Пользователь БД |
| `POSTGRES_PASSWORD` | Пароль БД |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | Секрет для JWT-сессий |
| `NEXTAUTH_URL` | URL приложения (https://my.orbo.ru) |
| `TELEGRAM_BOT_TOKEN_MAIN` | Токен основного бота |
| `TELEGRAM_BOT_TOKEN_ASSISTANT` | Токен бота уведомлений |
| `TELEGRAM_WEBHOOK_SECRET` | Секрет для Telegram webhook |
| `CRON_SECRET` | Секрет для cron-эндпоинтов |

### S3 Storage

| Переменная | Описание |
|------------|----------|
| `STORAGE_PROVIDER` | `s3` |
| `SELECTEL_ENDPOINT` | `https://s3.storage.selcloud.ru` |
| `SELECTEL_BUCKET` | Имя bucket |
| `SELECTEL_ACCESS_KEY` | Access key |
| `SELECTEL_SECRET_KEY` | Secret key |

### Опциональные

| Переменная | Описание |
|------------|----------|
| `OPENAI_API_KEY` | Для AI-анализа |
| `OPENAI_PROXY_URL` | Proxy для OpenAI (если заблокирован) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `YANDEX_CLIENT_ID` / `YANDEX_CLIENT_SECRET` | Yandex OAuth |

---

*Обновлено: 9 февраля 2026*
