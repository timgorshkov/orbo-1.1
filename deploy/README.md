# Orbo Deployment Files

Этот каталог содержит все файлы, необходимые для развёртывания Orbo на выделенном сервере Selectel.

## Структура

```
deploy/
├── docker-compose.yml      # Конфигурация Docker контейнеров
├── Dockerfile              # Образ Next.js приложения
├── env.example             # Шаблон переменных окружения
├── README.md               # Этот файл
├── ssh-config-template.txt # Шаблон SSH конфигурации
├── nginx/
│   └── nginx.conf          # Конфигурация Nginx
└── scripts/
    ├── setup-server.sh     # Первоначальная настройка сервера
    ├── backup.sh           # Скрипт резервного копирования БД
    ├── restore.sh          # Скрипт восстановления БД
    ├── deploy.ps1          # Скрипт деплоя (Windows)
    └── ssl-setup.sh        # Настройка SSL сертификатов
```

## Быстрый старт

### 1. Подготовка локальной машины (Windows)

```powershell
# Создать SSH-ключ
ssh-keygen -t ed25519 -C "orbo-selectel" -f "$env:USERPROFILE\.ssh\selectel_key"

# Настроить SSH config (скопируйте шаблон)
notepad "$env:USERPROFILE\.ssh\config"
# Вставьте содержимое из ssh-config-template.txt
```

### 2. Первоначальная настройка сервера

```bash
# Подключиться к серверу (первый раз по паролю)
ssh root@IP_СЕРВЕРА

# Скопировать и запустить скрипт настройки
nano setup-server.sh
# Вставить содержимое scripts/setup-server.sh
chmod +x setup-server.sh
./setup-server.sh
```

### 3. Настройка S3 Selectel

1. Войти в [my.selectel.ru](https://my.selectel.ru)
2. Создать контейнер "orbo-materials" в Объектном хранилище
3. Создать сервисного пользователя с правами на хранилище
4. Сохранить Access Key и Secret Key

### 4. Копирование файлов на сервер

```bash
# На сервере под пользователем deploy
cd ~/orbo

# Скопировать конфигурационные файлы
# (из этого каталога)
scp docker-compose.yml deploy@selectel-orbo:~/orbo/
scp Dockerfile deploy@selectel-orbo:~/orbo/app/
scp nginx/nginx.conf deploy@selectel-orbo:~/orbo/nginx/
scp scripts/* deploy@selectel-orbo:~/orbo/scripts/

# Создать .env файл
cp env.example .env
nano .env  # Заполнить все значения
```

### 5. Запуск

```bash
# На сервере
cd ~/orbo

# Запустить PostgreSQL
docker compose up -d postgres
# Подождать ~10 секунд пока БД инициализируется

# Запустить приложение
docker compose up -d app

# Настроить SSL (после настройки DNS)
./scripts/ssl-setup.sh yourdomain.ru your@email.com

# Запустить Nginx
docker compose up -d nginx

# Проверить статус
docker compose ps
```

## Команды управления

```bash
# Просмотр логов
docker compose logs -f app
docker compose logs -f nginx
docker compose logs -f postgres

# Перезапуск приложения
docker compose restart app

# Остановка всего
docker compose down

# Пересборка приложения
docker compose build app
docker compose up -d app

# Резервное копирование БД
./scripts/backup.sh

# Восстановление БД
./scripts/restore.sh
```

## Деплой обновлений (с Windows)

```powershell
# Из корня проекта
.\deploy\scripts\deploy.ps1
```

## Мониторинг

```bash
# Использование ресурсов
docker stats

# Состояние контейнеров
docker compose ps

# Проверка здоровья PostgreSQL
docker exec orbo_postgres pg_isready -U orbo

# Проверка логов nginx
tail -f ~/orbo/nginx/logs/access.log
```

## Troubleshooting

### Приложение не запускается

```bash
# Проверить логи
docker compose logs app

# Проверить что БД доступна
docker exec orbo_app wget -qO- http://postgres:5432 || echo "DB connection ok"
```

### Ошибка SSL

```bash
# Проверить сертификаты
docker compose exec nginx nginx -t

# Перевыпустить сертификат
./scripts/ssl-setup.sh yourdomain.ru
```

### Проблемы с памятью

```bash
# Проверить использование памяти
free -h
docker stats --no-stream

# Очистить Docker кэш
docker system prune -a
```

## Архитектура

```
Internet
    ↓
[Nginx :80/:443]  ← SSL termination, rate limiting
    ↓
[Next.js :3000]   ← Application server
    ↓
[PostgreSQL :5432] ← Database
    
[Selectel S3]     ← File storage (accessed directly)
```

## Безопасность

- SSH доступ только по ключам (пароли отключены)
- Firewall разрешает только порты 22, 80, 443
- PostgreSQL доступен только localhost
- Все секреты в .env файле (не в Git)
- fail2ban защищает от брутфорса

