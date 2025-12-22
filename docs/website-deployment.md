# Деплой публичного сайта orbo.ru

## Обзор архитектуры

Сайт и приложение работают из одного Next.js проекта, разделяясь по доменам:

| Домен | Назначение | Роуты |
|-------|------------|-------|
| `orbo.ru`, `www.orbo.ru` | Публичный сайт | `/`, `/product`, `/events`, `/notifications`, `/crm`, `/journal` |
| `my.orbo.ru` | Приложение | `/app/*`, `/orgs/*`, `/signin`, `/signup`, etc. |

Логика разделения реализована в `middleware.ts`.

---

## Структура файлов

```
app/
├── site/               # Публичный сайт (rewrite с orbo.ru через middleware)
│   ├── layout.tsx      # Layout для сайта
│   ├── page.tsx        # Главная страница с Orb-эффектом
│   ├── product/
│   ├── events/
│   ├── notifications/
│   ├── crm/
│   └── journal/
├── (auth)/             # Страницы авторизации
├── (authenticated)/    # Защищённые страницы приложения
└── ...

components/
└── website/            # Компоненты сайта
    ├── Orb.tsx         # Анимированный Orb-фон
    ├── Header.tsx      # Шапка сайта
    ├── Footer.tsx      # Подвал сайта
    ├── website.css     # Стили сайта
    └── index.ts        # Barrel export
```

---

## Вариант 1: Vercel (рекомендуется)

### Настройка доменов

1. Откройте проект в Vercel Dashboard
2. Settings → Domains
3. Добавьте домены:
   - `my.orbo.ru` (основной для приложения)
   - `orbo.ru` (для публичного сайта)
   - `www.orbo.ru` (редирект на `orbo.ru`)

### Конфигурация

Никаких дополнительных настроек не требуется. Middleware автоматически определяет домен и показывает нужные страницы.

---

## Вариант 2: Selectel + Docker

### Подготовка

1. Соберите Docker-образ:
```bash
docker build -t orbo-website .
```

2. Загрузите в registry:
```bash
docker tag orbo-website registry.your-domain.com/orbo-website:latest
docker push registry.your-domain.com/orbo-website:latest
```

### Настройка Nginx (reverse proxy)

```nginx
# /etc/nginx/sites-available/orbo

# Публичный сайт
server {
    listen 443 ssl http2;
    server_name orbo.ru www.orbo.ru;
    
    ssl_certificate /etc/letsencrypt/live/orbo.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/orbo.ru/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Приложение
server {
    listen 443 ssl http2;
    server_name my.orbo.ru;
    
    ssl_certificate /etc/letsencrypt/live/my.orbo.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/my.orbo.ru/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Docker Compose

```yaml
version: '3.8'
services:
  orbo:
    image: registry.your-domain.com/orbo-website:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_APP_URL=https://my.orbo.ru
      - NEXT_PUBLIC_WEBSITE_URL=https://orbo.ru
      # ... другие переменные окружения
    restart: unless-stopped
```

---

## Локальная разработка

### Запуск с разделением доменов

Для тестирования разделения доменов локально:

1. Добавьте в `/etc/hosts` (Windows: `C:\Windows\System32\drivers\etc\hosts`):
```
127.0.0.1 local.orbo.ru
127.0.0.1 local-my.orbo.ru
```

2. Запустите Next.js:
```bash
npm run dev
```

3. Откройте:
   - `http://local.orbo.ru:3000` — публичный сайт
   - `http://local-my.orbo.ru:3000` — приложение

Или используйте разные порты:
- `localhost:3000` — приложение (по умолчанию)
- `localhost:3001` — сайт (middleware определяет по порту)

---

## Кастомизация дизайна

### CSS переменные

Все стили сайта в `components/website/website.css`. Основные переменные:

```css
:root {
  /* Brand colors */
  --website-primary: #8b5cf6;
  --website-primary-dark: #7c3aed;
  
  /* Orb colors */
  --orb-primary: hsl(260, 70%, 60%);
  --orb-secondary: hsl(300, 80%, 50%);
  --orb-tertiary: hsl(340, 60%, 70%);
  --orb-bg: #f0eef5;
  
  /* ... */
}
```

### Orb компонент

```tsx
import { Orb } from '@/components/website';

// Изменение оттенка (hue)
<Orb hue={260} />  // фиолетовый (по умолчанию)
<Orb hue={200} />  // синий
<Orb hue={0} />    // красный

// Усиленный эффект
<Orb hue={260} forceHoverState />
```

---

## Добавление новых страниц

1. Создайте папку в `app/site/`:
```
app/site/pricing/page.tsx
```

2. Добавьте роут в `WEBSITE_ROUTES` в `middleware.ts`:
```typescript
const WEBSITE_ROUTES = ['/', '/product', '/events', '/notifications', '/crm', '/journal', '/pricing']
```

3. Обновите навигацию в `Header.tsx` и `Footer.tsx`

---

## Интеграция с WordPress (legacy)

Если нужно оставить часть контента (блог) на WordPress:

1. Настройте WordPress на поддомене `blog.orbo.ru`
2. В `Header.tsx` измените ссылку:
```tsx
<a href="https://blog.orbo.ru">Журнал</a>
```

Или используйте Next.js rewrites для проксирования:
```json
// next.config.js
{
  "rewrites": [
    {
      "source": "/journal/:path*",
      "destination": "https://blog.orbo.ru/:path*"
    }
  ]
}
```

---

## Метрики и аналитика

Рекомендуется добавить:

1. **Yandex Metrica** — в `app/site/layout.tsx`
2. **Google Analytics** — через `next/script`
3. **Plausible** — privacy-friendly альтернатива

Пример:
```tsx
// app/site/layout.tsx
import Script from 'next/script';

export default function WebsiteLayout({ children }) {
  return (
    <div className="website-root">
      {children}
      <Script 
        src="https://mc.yandex.ru/metrika/tag.js" 
        strategy="afterInteractive"
      />
    </div>
  );
}
```
