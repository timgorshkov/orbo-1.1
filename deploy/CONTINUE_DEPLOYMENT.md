# Продолжение развёртывания Orbo

Эта инструкция для вас — продолжение с учётом возникших проблем.

---

## Исправление 1: Перегенерация SSH-ключей без пароля

Ваши текущие ключи с паролем — это неудобно для скриптов. Перегенерируем.

### Шаг 1: Создаём новый ключ

```powershell
# В PowerShell
ssh-keygen -t ed25519 -C "orbo-selectel" -f "$env:USERPROFILE\.ssh\selectel_key" -N '""'
```

Флаг `-N '""'` означает пустой пароль. Если спросит перезаписать — отвечаем **y**.

### Шаг 2: Копируем новый ключ на сервер

Поскольку старый ключ ещё работает (просто с паролем), используем его:

```powershell
# Показываем новый публичный ключ
type "$env:USERPROFILE\.ssh\selectel_key.pub"
```

Скопируйте вывод. Затем подключитесь к серверу (введите пароль от ключа):

```powershell
ssh deploy@ВАШ_IP_СЕРВЕРА
```

На сервере:

```bash
# Заменяем ключ
echo "ВСТАВЬТЕ_НОВЫЙ_ПУБЛИЧНЫЙ_КЛЮЧ_СЮДА" > ~/.ssh/authorized_keys
```

### Шаг 3: Проверяем

Выйдите (`exit`) и подключитесь заново:

```powershell
ssh selectel-orbo
```

Должно подключиться **без запроса пароля**.

---

## Исправление 2: Копирование файлов проекта

Я создал специальный PowerShell скрипт, который:
1. Создаёт ZIP-архив **без** node_modules, .next, .git
2. Копирует один файл на сервер (быстро!)
3. Распаковывает на сервере

### Запуск скрипта

```powershell
cd "C:\Cursor WS\orbo-1.1.1\orbo-1.1\deploy\scripts"
.\copy-to-server.ps1
```

Если появится ошибка про политику выполнения:

```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
.\copy-to-server.ps1
```

### Что делает скрипт

1. Собирает все файлы проекта, исключая:
   - `node_modules/` (гигантская папка)
   - `.next/` (кэш сборки)
   - `.git/` (история)
   - `.env*` (секреты)
   - `temp/`, логи и прочее

2. Создаёт ZIP-архив (~10-50 MB вместо гигабайтов)

3. Копирует один архив через scp (быстро)

4. Распаковывает на сервере

---

## Продолжение с шага 7.5

После успешного копирования файлов:

### 7.5 Обновление nginx.conf

На сервере:

```bash
ssh selectel-orbo

cd ~/orbo
# Замените my.orbo.ru на ваш реальный домен
sed -i 's/YOUR_DOMAIN\.ru/my.orbo.ru/g' nginx/nginx.conf
```

### 7.6 Копирование Dockerfile и docker-compose.yml

Эти файлы нужно скопировать отдельно (они в папке deploy, а не в app):

**На локальной машине:**

```powershell
cd "C:\Cursor WS\orbo-1.1.1\orbo-1.1"

# Копируем конфигурационные файлы
scp deploy/docker-compose.yml selectel-orbo:~/orbo/
scp deploy/Dockerfile selectel-orbo:~/orbo/app/
scp deploy/nginx/nginx.conf selectel-orbo:~/orbo/nginx/
scp deploy/env.example selectel-orbo:~/orbo/.env
scp deploy/scripts/*.sh selectel-orbo:~/orbo/scripts/

# Делаем скрипты исполняемыми
ssh selectel-orbo "chmod +x ~/orbo/scripts/*.sh"
```

### 7.7 Настройка .env

На сервере:

```bash
cd ~/orbo
nano .env
```

Заполните реальные значения. Генерация паролей:

```bash
# Пароль БД (скопируйте в POSTGRES_PASSWORD)
openssl rand -base64 32

# Webhook secret (скопируйте в TELEGRAM_WEBHOOK_SECRET)
openssl rand -hex 32
```

### 7.8 Запуск PostgreSQL

```bash
cd ~/orbo
docker compose up -d postgres

# Ждём инициализации
sleep 15

# Проверяем
docker compose logs postgres
docker exec orbo_postgres pg_isready -U orbo
```

### 7.9 Запуск приложения

```bash
# Сборка (5-10 минут)
docker compose build app

# Запуск
docker compose up -d app

# Смотрим логи
docker compose logs -f app
```

Нажмите `Ctrl+C` чтобы выйти из логов.

---

## Шаг 8: Настройка SSL

**Только после настройки DNS!** (домен должен указывать на IP сервера)

```bash
cd ~/orbo
./scripts/ssl-setup.sh my.orbo.ru your@email.com
```

---

## Шаг 9: Проверка

```bash
# Статус контейнеров
docker compose ps

# Health check
curl http://localhost:3000/api/health

# Через HTTPS (после SSL)
curl https://my.orbo.ru/api/health
```

Откройте в браузере: https://my.orbo.ru

---

## Шаг 10: Бэкапы

```bash
# Тестовый бэкап
./scripts/backup.sh

# Настройка автоматических бэкапов
crontab -e
# Добавьте строку:
# 0 3 * * * /home/deploy/orbo/scripts/backup.sh >> /home/deploy/orbo/scripts/backup.log 2>&1
```

---

## Примечание про s3cmd

Ваша установка s3cmd работает, просто вызывайте так:

```powershell
python C:\s3cmd\s3cmd ls
python C:\s3cmd\s3cmd ls s3://orbo-materials
```

Или добавьте в PATH:
1. Поиск Windows → "Переменные среды"
2. Переменные среды → Path → Изменить
3. Добавить: `C:\s3cmd`
4. Перезапустить PowerShell

После этого можно будет просто: `s3cmd ls`

---

## Быстрый чеклист

- [ ] Перегенерировать SSH ключ без пароля
- [ ] Скопировать файлы проекта скриптом `copy-to-server.ps1`
- [ ] Скопировать конфигурационные файлы (docker-compose, Dockerfile, etc.)
- [ ] Настроить .env на сервере
- [ ] Запустить PostgreSQL
- [ ] Собрать и запустить приложение
- [ ] Настроить DNS
- [ ] Получить SSL сертификат
- [ ] Настроить бэкапы

---

## Если что-то пошло не так

### Ошибка SSH "Permission denied"

```powershell
# Проверьте что ключ правильный
ssh -v selectel-orbo
```

### Ошибка сборки Docker

```bash
# Смотрим логи
docker compose logs app

# Пересобираем с нуля
docker compose build --no-cache app
```

### PostgreSQL не запускается

```bash
# Проверяем логи
docker compose logs postgres

# Проверяем права на папку
ls -la ~/orbo/data/postgres
```

### Приложение не отвечает

```bash
# Проверяем что контейнер запущен
docker compose ps

# Проверяем логи
docker compose logs app

# Проверяем что порт слушается
curl http://localhost:3000
```

