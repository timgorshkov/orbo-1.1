# 🧩 Спецификация: Приложения и Партнёрский каталог

**Дата:** 7 января 2026  
**Спринт:** Февраль W1-2  
**Статус:** In Development  
**Первый партнёр:** Votum (@votumfit_bot)

---

## 📋 СОДЕРЖАНИЕ

1. [Обзор](#обзор)
2. [База данных](#база-данных)
3. [API эндпоинты](#api-эндпоинты)
4. [UI компоненты](#ui-компоненты)
5. [Superadmin панель](#superadmin-панель)
6. [Интеграция Votum](#интеграция-votum)
7. [Файлы для создания](#файлы-для-создания)
8. [Чеклист реализации](#чеклист-реализации)

---

## 1. ОБЗОР

### 1.1 Цели

1. **Единый список приложений** — подключённые из каталога и созданные в конструкторе отображаются вместе
2. **Все приложения = Telegram MiniApps** — унифицированный формат
3. **Партнёрский каталог** — возможность подключать внешние MiniApps
4. **Superadmin управление** — добавление/редактирование партнёрских приложений
5. **Трекинг подключений** — какие организации подключили, в каких группах

### 1.2 Архитектура

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ORBO APPS ECOSYSTEM                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    СТРАНИЦА ПРИЛОЖЕНИЙ                        │   │
│  │                    /p/[org]/apps                              │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │                                                               │   │
│  │  ┌─────────────────────────────────────────────────────────┐ │   │
│  │  │  📱 ВАШИ ПРИЛОЖЕНИЯ (единый список)                     │ │   │
│  │  │                                                          │ │   │
│  │  │  ┌────────────┐ ┌────────────┐ ┌────────────┐           │ │   │
│  │  │  │ Барахолка  │ │ Votum      │ │ Вакансии   │           │ │   │
│  │  │  │ собственное│ │ из каталога│ │ собственное│           │ │   │
│  │  │  │ [Открыть]  │ │ [Открыть]  │ │ [Открыть]  │           │ │   │
│  │  │  └────────────┘ └────────────┘ └────────────┘           │ │   │
│  │  └─────────────────────────────────────────────────────────┘ │   │
│  │                                                               │   │
│  │  ────────────────────────────────────────────────────────────│   │
│  │                                                               │   │
│  │  [📂 Каталог приложений]        [✨ Создать своё приложение] │   │
│  │                                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    КАТАЛОГ ПРИЛОЖЕНИЙ                         │   │
│  │                    /p/[org]/apps/catalog                      │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │  🔍 [Поиск...]                      Категория: [Все ▼]       │   │
│  │                                                               │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐                │   │
│  │  │ 🤝 Votum   │ │ 📊 [App 2] │ │ 🎯 [App 3] │                │   │
│  │  │ Мэтчинг   │ │ ...        │ │ ...        │                │   │
│  │  │ запросов  │ │            │ │            │                │   │
│  │  │[Подробнее]│ │[Подробнее] │ │[Подробнее] │                │   │
│  │  └────────────┘ └────────────┘ └────────────┘                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. БАЗА ДАННЫХ

### 2.1 Миграция: `db/migrations/180_public_apps_catalog.sql`

```sql
-- ============================================================
-- ПУБЛИЧНЫЙ КАТАЛОГ ПРИЛОЖЕНИЙ
-- ============================================================

-- Каталог партнёрских/публичных приложений (управляется superadmin)
CREATE TABLE public_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Основная информация
  name TEXT NOT NULL,                      -- "Votum"
  slug TEXT NOT NULL UNIQUE,               -- "votum" (для URL)
  short_description TEXT,                  -- "Мэтчинг запросов участников"
  full_description TEXT,                   -- Полное описание (Markdown)
  
  -- Визуал
  icon_url TEXT,                           -- URL иконки приложения
  banner_url TEXT,                         -- URL баннера (опционально)
  screenshots JSONB DEFAULT '[]'::jsonb,   -- [{url, caption}]
  
  -- Telegram MiniApp
  bot_username TEXT NOT NULL,              -- "votumfit_bot"
  miniapp_url TEXT,                        -- t.me/votumfit_bot/app (если есть)
  bot_deep_link_template TEXT,             -- "t.me/votumfit_bot?startgroup={org_id}"
  
  -- Инструкции
  setup_instructions TEXT,                 -- Markdown инструкции по подключению
  features JSONB DEFAULT '[]'::jsonb,      -- ["Мэтчинг", "Запросы", "Предложения"]
  
  -- Категоризация
  category TEXT DEFAULT 'other',           -- 'engagement', 'moderation', 'analytics', 'ai', 'other'
  tags JSONB DEFAULT '[]'::jsonb,          -- ["нетворкинг", "запросы", "мэтчинг"]
  
  -- Партнёрство
  partner_name TEXT,                       -- "Votum Team"
  partner_website TEXT,                    -- "https://votum.fit"
  partner_contact TEXT,                    -- Email или Telegram
  
  -- Статус и сортировка
  status TEXT DEFAULT 'draft',             -- 'draft', 'active', 'paused', 'deprecated'
  featured BOOLEAN DEFAULT false,          -- Показывать в топе каталога
  sort_order INTEGER DEFAULT 0,
  
  -- Метаданные (для будущих интеграций)
  config JSONB DEFAULT '{}'::jsonb
);

-- Индексы
CREATE INDEX idx_public_apps_status ON public_apps(status);
CREATE INDEX idx_public_apps_category ON public_apps(category);
CREATE INDEX idx_public_apps_featured ON public_apps(featured) WHERE featured = true;

-- ============================================================
-- ПОДКЛЮЧЕНИЯ ПРИЛОЖЕНИЙ К ОРГАНИЗАЦИЯМ
-- ============================================================

CREATE TABLE public_app_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Связи
  public_app_id UUID NOT NULL REFERENCES public_apps(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Кто подключил
  connected_by UUID REFERENCES auth.users(id),
  
  -- В каких группах установлено (обновляется вручную или через API)
  connected_groups JSONB DEFAULT '[]'::jsonb,
  -- Формат: [{chat_id: -123456, title: "Группа", connected_at: "2026-01-15T12:00:00Z"}]
  
  -- Статус
  status TEXT DEFAULT 'active',            -- 'active', 'paused', 'disconnected'
  
  -- Заметки (для админа организации)
  notes TEXT,
  
  UNIQUE(public_app_id, org_id)
);

-- Индексы
CREATE INDEX idx_public_app_connections_org ON public_app_connections(org_id);
CREATE INDEX idx_public_app_connections_app ON public_app_connections(public_app_id);

-- ============================================================
-- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
-- ============================================================

-- Получить приложения организации (подключённые + собственные)
CREATE OR REPLACE FUNCTION get_org_apps(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  icon_url TEXT,
  app_type TEXT,           -- 'own' или 'catalog'
  source_id UUID,          -- org_app.id или public_app.id
  miniapp_url TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  -- Собственные приложения (из конструктора)
  SELECT 
    oa.id,
    oa.name,
    oa.description,
    oa.icon_url,
    'own'::TEXT as app_type,
    oa.id as source_id,
    oa.miniapp_url,
    oa.status,
    oa.created_at
  FROM org_apps oa
  WHERE oa.org_id = p_org_id
    AND oa.status != 'deleted'
  
  UNION ALL
  
  -- Подключённые из каталога
  SELECT 
    pac.id,
    pa.name,
    pa.short_description as description,
    pa.icon_url,
    'catalog'::TEXT as app_type,
    pa.id as source_id,
    pa.miniapp_url,
    pac.status,
    pac.created_at
  FROM public_app_connections pac
  JOIN public_apps pa ON pa.id = pac.public_app_id
  WHERE pac.org_id = p_org_id
    AND pac.status = 'active'
  
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Получить статистику подключений для superadmin
CREATE OR REPLACE FUNCTION get_public_app_stats(p_app_id UUID)
RETURNS TABLE (
  total_connections BIGINT,
  active_connections BIGINT,
  total_groups BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_connections,
    COUNT(*) FILTER (WHERE status = 'active')::BIGINT as active_connections,
    (
      SELECT COALESCE(SUM(jsonb_array_length(connected_groups)), 0)::BIGINT
      FROM public_app_connections
      WHERE public_app_id = p_app_id AND status = 'active'
    ) as total_groups
  FROM public_app_connections
  WHERE public_app_id = p_app_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE public_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_app_connections ENABLE ROW LEVEL SECURITY;

-- Public apps: все могут читать активные
CREATE POLICY "Public apps are viewable by authenticated users"
  ON public_apps FOR SELECT
  TO authenticated
  USING (status = 'active');

-- Public apps: только superadmin может изменять
CREATE POLICY "Only superadmin can manage public apps"
  ON public_apps FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND raw_user_meta_data->>'is_superadmin' = 'true'
    )
  );

-- Connections: пользователи видят подключения своих организаций
CREATE POLICY "Users can view own org connections"
  ON public_app_connections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members 
      WHERE org_id = public_app_connections.org_id 
      AND user_id = auth.uid()
    )
  );

-- Connections: админы могут управлять подключениями
CREATE POLICY "Admins can manage org connections"
  ON public_app_connections FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members 
      WHERE org_id = public_app_connections.org_id 
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );
```

### 2.2 Начальные данные: Votum

```sql
-- Вставка Votum в каталог
INSERT INTO public_apps (
  name,
  slug,
  short_description,
  full_description,
  bot_username,
  miniapp_url,
  bot_deep_link_template,
  setup_instructions,
  features,
  category,
  tags,
  partner_name,
  partner_website,
  status,
  featured,
  sort_order
) VALUES (
  'Votum',
  'votum',
  'Мэтчинг запросов участников сообщества',
  '## Votum — умный мэтчинг для сообществ

Votum помогает участникам вашего сообщества находить друг друга:

- 📝 **Запросы** — участники публикуют что ищут
- 💡 **Предложения** — бот находит релевантные предложения
- 🤝 **Мэтчинг** — автоматическое соединение нужных людей

### Как это работает

1. Участник пишет в чат свой запрос
2. Votum анализирует запрос и ищет подходящие предложения
3. Бот предлагает релевантные связи

### Идеально для

- Бизнес-клубов и нетворкинг-сообществ
- Профессиональных комьюнити
- Клиентских чатов с взаимопомощью',
  'votumfit_bot',
  't.me/votumfit_bot/app',
  't.me/votumfit_bot?startgroup=orbo_{org_id}',
  '## Подключение Votum

### Шаг 1: Добавьте бота в группу

1. Откройте вашу Telegram-группу
2. Нажмите на название группы → "Добавить участников"
3. Найдите @votumfit_bot и добавьте

### Шаг 2: Дайте боту права

Для полноценной работы бот должен:
- Читать сообщения
- Отправлять сообщения

### Шаг 3: Активируйте

Напишите в группе `/start` — бот активируется и пришлёт приветствие.

### Готово!

Теперь участники могут публиковать запросы, а Votum будет искать мэтчи.',
  '["Мэтчинг запросов", "Автоматический поиск", "Нетворкинг", "Telegram MiniApp"]'::jsonb,
  'engagement',
  '["нетворкинг", "запросы", "мэтчинг", "b2b", "комьюнити"]'::jsonb,
  'Votum Team',
  'https://t.me/votumfit_bot',
  'active',
  true,
  1
);
```

---

## 3. API ЭНДПОИНТЫ

### 3.1 Каталог приложений

#### GET `/api/apps/catalog`
Получить список приложений в каталоге.

```typescript
// app/api/apps/catalog/route.ts

import { createClientServer } from '@/lib/supabase/server';
import { createAPILogger } from '@/lib/logger';

const logger = createAPILogger('apps-catalog');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const search = searchParams.get('search');
  
  const supabase = await createClientServer();
  
  let query = supabase
    .from('public_apps')
    .select('*')
    .eq('status', 'active')
    .order('featured', { ascending: false })
    .order('sort_order', { ascending: true });
  
  if (category && category !== 'all') {
    query = query.eq('category', category);
  }
  
  if (search) {
    query = query.or(`name.ilike.%${search}%,short_description.ilike.%${search}%`);
  }
  
  const { data, error } = await query;
  
  if (error) {
    logger.error('Failed to fetch catalog', { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  }
  
  return Response.json({ apps: data });
}
```

#### GET `/api/apps/catalog/[appId]`
Получить детали приложения.

```typescript
// app/api/apps/catalog/[appId]/route.ts

export async function GET(
  request: Request,
  { params }: { params: { appId: string } }
) {
  const supabase = await createClientServer();
  
  const { data: app, error } = await supabase
    .from('public_apps')
    .select('*')
    .eq('id', params.appId)
    .eq('status', 'active')
    .single();
  
  if (error || !app) {
    return Response.json({ error: 'App not found' }, { status: 404 });
  }
  
  return Response.json({ app });
}
```

### 3.2 Подключения приложений

#### POST `/api/apps/catalog/[appId]/connect`
Подключить приложение к организации.

```typescript
// app/api/apps/catalog/[appId]/connect/route.ts

import { requireOrgAccess } from '@/lib/auth/requireOrgAccess';

export async function POST(
  request: Request,
  { params }: { params: { appId: string } }
) {
  const { orgId } = await request.json();
  
  // Проверка прав
  const { user, error: authError } = await requireOrgAccess(orgId, ['owner', 'admin']);
  if (authError) {
    return Response.json({ error: authError }, { status: 403 });
  }
  
  const supabase = await createAdminServer();
  
  // Проверить, что приложение существует и активно
  const { data: app } = await supabase
    .from('public_apps')
    .select('id, name')
    .eq('id', params.appId)
    .eq('status', 'active')
    .single();
  
  if (!app) {
    return Response.json({ error: 'App not found' }, { status: 404 });
  }
  
  // Создать или обновить подключение
  const { data: connection, error } = await supabase
    .from('public_app_connections')
    .upsert({
      public_app_id: params.appId,
      org_id: orgId,
      connected_by: user.id,
      status: 'active',
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'public_app_id,org_id'
    })
    .select()
    .single();
  
  if (error) {
    logger.error('Failed to connect app', { error: error.message, appId: params.appId, orgId });
    return Response.json({ error: error.message }, { status: 500 });
  }
  
  logger.info('App connected', { appId: params.appId, orgId, appName: app.name });
  
  return Response.json({ connection, app });
}
```

#### DELETE `/api/apps/catalog/[appId]/connect`
Отключить приложение от организации.

```typescript
export async function DELETE(
  request: Request,
  { params }: { params: { appId: string } }
) {
  const { orgId } = await request.json();
  
  const { user, error: authError } = await requireOrgAccess(orgId, ['owner', 'admin']);
  if (authError) {
    return Response.json({ error: authError }, { status: 403 });
  }
  
  const supabase = await createAdminServer();
  
  const { error } = await supabase
    .from('public_app_connections')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('public_app_id', params.appId)
    .eq('org_id', orgId);
  
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  
  return Response.json({ success: true });
}
```

### 3.3 Приложения организации (единый список)

#### GET `/api/apps/org/[orgId]`
Получить все приложения организации (собственные + подключённые).

```typescript
// app/api/apps/org/[orgId]/route.ts

export async function GET(
  request: Request,
  { params }: { params: { orgId: string } }
) {
  const { error: authError } = await requireOrgAccess(params.orgId);
  if (authError) {
    return Response.json({ error: authError }, { status: 403 });
  }
  
  const supabase = await createClientServer();
  
  // Используем RPC функцию для объединённого списка
  const { data: apps, error } = await supabase
    .rpc('get_org_all_apps', { p_org_id: params.orgId });
  
  if (error) {
    logger.error('Failed to fetch org apps', { error: error.message, orgId: params.orgId });
    return Response.json({ error: error.message }, { status: 500 });
  }
  
  return Response.json({ apps });
}
```

### 3.4 Обновление групп подключения

#### PATCH `/api/apps/connections/[connectionId]/groups`
Обновить список групп, где установлено приложение.

```typescript
// app/api/apps/connections/[connectionId]/groups/route.ts

export async function PATCH(
  request: Request,
  { params }: { params: { connectionId: string } }
) {
  const { groups } = await request.json();
  // groups: [{chat_id: -123456, title: "Группа"}]
  
  const supabase = await createAdminServer();
  
  // Получить connection и проверить права
  const { data: connection } = await supabase
    .from('public_app_connections')
    .select('org_id')
    .eq('id', params.connectionId)
    .single();
  
  if (!connection) {
    return Response.json({ error: 'Connection not found' }, { status: 404 });
  }
  
  const { error: authError } = await requireOrgAccess(connection.org_id, ['owner', 'admin']);
  if (authError) {
    return Response.json({ error: authError }, { status: 403 });
  }
  
  // Добавляем timestamp к каждой группе
  const groupsWithTimestamp = groups.map((g: any) => ({
    ...g,
    connected_at: g.connected_at || new Date().toISOString()
  }));
  
  const { error } = await supabase
    .from('public_app_connections')
    .update({ 
      connected_groups: groupsWithTimestamp,
      updated_at: new Date().toISOString()
    })
    .eq('id', params.connectionId);
  
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  
  return Response.json({ success: true });
}
```

---

## 4. UI КОМПОНЕНТЫ

### 4.1 Страница приложений `/p/[org]/apps/page.tsx`

```tsx
// app/p/[org]/apps/page.tsx

import { Suspense } from 'react';
import { OrgAppsContent } from './org-apps-content';
import { Skeleton } from '@/components/ui/skeleton';

export default async function AppsPage({ 
  params 
}: { 
  params: { org: string } 
}) {
  return (
    <div className="container py-6">
      <Suspense fallback={<AppsPageSkeleton />}>
        <OrgAppsContent orgSlug={params.org} />
      </Suspense>
    </div>
  );
}

function AppsPageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </div>
  );
}
```

### 4.2 Контент страницы приложений

```tsx
// app/p/[org]/apps/org-apps-content.tsx

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AppCard } from '@/components/apps/app-card';
import { FolderOpen, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface OrgApp {
  id: string;
  name: string;
  description: string;
  icon_url: string | null;
  app_type: 'own' | 'catalog';
  source_id: string;
  miniapp_url: string | null;
  status: string;
  created_at: string;
}

export function OrgAppsContent({ orgSlug }: { orgSlug: string }) {
  const [apps, setApps] = useState<OrgApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    async function loadApps() {
      // Получить orgId по slug
      const orgRes = await fetch(`/api/organizations/by-slug/${orgSlug}`);
      const { org } = await orgRes.json();
      setOrgId(org.id);
      
      // Загрузить приложения
      const res = await fetch(`/api/apps/org/${org.id}`);
      const { apps } = await res.json();
      setApps(apps || []);
      setLoading(false);
    }
    
    loadApps();
  }, [orgSlug]);

  if (loading) {
    return <div>Загрузка...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-bold">Приложения</h1>
        <p className="text-muted-foreground">
          Telegram MiniApps для вашего сообщества
        </p>
      </div>

      {/* Список приложений */}
      {apps.length > 0 ? (
        <div>
          <h2 className="text-lg font-semibold mb-4">📱 Ваши приложения</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apps.map(app => (
              <AppCard 
                key={app.id} 
                app={app} 
                orgSlug={orgSlug}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-muted/30 rounded-lg">
          <p className="text-muted-foreground mb-4">
            У вас пока нет приложений
          </p>
          <p className="text-sm text-muted-foreground">
            Подключите готовое из каталога или создайте своё
          </p>
        </div>
      )}

      {/* Действия */}
      <div className="flex gap-4 pt-4 border-t">
        <Button variant="outline" asChild>
          <Link href={`/p/${orgSlug}/apps/catalog`}>
            <FolderOpen className="w-4 h-4 mr-2" />
            Каталог приложений
          </Link>
        </Button>
        
        <Button asChild>
          <Link href={`/p/${orgSlug}/apps/new`}>
            <Sparkles className="w-4 h-4 mr-2" />
            Создать своё приложение
          </Link>
        </Button>
      </div>
    </div>
  );
}
```

### 4.3 Карточка приложения

```tsx
// components/apps/app-card.tsx

'use client';

import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Settings } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

interface AppCardProps {
  app: {
    id: string;
    name: string;
    description: string;
    icon_url: string | null;
    app_type: 'own' | 'catalog';
    source_id: string;
    miniapp_url: string | null;
    status: string;
  };
  orgSlug: string;
}

export function AppCard({ app, orgSlug }: AppCardProps) {
  const isOwn = app.app_type === 'own';
  
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row gap-3 items-start space-y-0">
        {/* Иконка */}
        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
          {app.icon_url ? (
            <Image 
              src={app.icon_url} 
              alt={app.name} 
              width={48} 
              height={48}
              className="object-cover"
            />
          ) : (
            <span className="text-2xl">📱</span>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{app.name}</h3>
          <Badge variant={isOwn ? 'secondary' : 'outline'} className="text-xs">
            {isOwn ? 'Собственное' : 'Из каталога'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {app.description || 'Без описания'}
        </p>
      </CardContent>
      
      <CardFooter className="gap-2">
        {app.miniapp_url && (
          <Button variant="default" size="sm" asChild className="flex-1">
            <a href={app.miniapp_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-1" />
              Открыть
            </a>
          </Button>
        )}
        
        <Button variant="outline" size="sm" asChild>
          <Link href={`/p/${orgSlug}/apps/${app.id}/settings`}>
            <Settings className="w-4 h-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
```

### 4.4 Страница каталога

```tsx
// app/p/[org]/apps/catalog/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CatalogAppCard } from '@/components/apps/catalog-app-card';
import { Search } from 'lucide-react';

const CATEGORIES = [
  { value: 'all', label: 'Все категории' },
  { value: 'engagement', label: 'Вовлечение' },
  { value: 'moderation', label: 'Модерация' },
  { value: 'analytics', label: 'Аналитика' },
  { value: 'ai', label: 'AI' },
  { value: 'other', label: 'Другое' },
];

export default function CatalogPage({ params }: { params: { org: string } }) {
  const [apps, setApps] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCatalog() {
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      if (search) params.set('search', search);
      
      const res = await fetch(`/api/apps/catalog?${params}`);
      const { apps } = await res.json();
      setApps(apps || []);
      setLoading(false);
    }
    
    const debounce = setTimeout(loadCatalog, 300);
    return () => clearTimeout(debounce);
  }, [search, category]);

  return (
    <div className="container py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Каталог приложений</h1>
        <p className="text-muted-foreground">
          Готовые Telegram MiniApps для вашего сообщества
        </p>
      </div>
      
      {/* Фильтры */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Поиск приложений..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(cat => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Список */}
      {loading ? (
        <div>Загрузка...</div>
      ) : apps.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Приложения не найдены
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((app: any) => (
            <CatalogAppCard 
              key={app.id} 
              app={app} 
              orgSlug={params.org}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

### 4.5 Карточка приложения в каталоге

```tsx
// components/apps/catalog-app-card.tsx

'use client';

import { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Plus, Check } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useToast } from '@/components/ui/use-toast';

interface CatalogAppCardProps {
  app: {
    id: string;
    name: string;
    short_description: string;
    icon_url: string | null;
    category: string;
    featured: boolean;
    tags: string[];
  };
  orgSlug: string;
  isConnected?: boolean;
}

export function CatalogAppCard({ app, orgSlug, isConnected = false }: CatalogAppCardProps) {
  const [connected, setConnected] = useState(isConnected);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleConnect() {
    setLoading(true);
    try {
      // Получить orgId
      const orgRes = await fetch(`/api/organizations/by-slug/${orgSlug}`);
      const { org } = await orgRes.json();
      
      const res = await fetch(`/api/apps/catalog/${app.id}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: org.id })
      });
      
      if (res.ok) {
        setConnected(true);
        toast({
          title: 'Приложение подключено',
          description: `${app.name} добавлено в ваши приложения`
        });
      } else {
        throw new Error('Failed to connect');
      }
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось подключить приложение',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row gap-3 items-start space-y-0">
        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
          {app.icon_url ? (
            <Image src={app.icon_url} alt={app.name} width={48} height={48} />
          ) : (
            <span className="text-2xl">🤝</span>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{app.name}</h3>
            {app.featured && (
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
            )}
          </div>
          <Badge variant="outline" className="text-xs">
            {app.category}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {app.short_description}
        </p>
        
        {app.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {app.tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
      
      <CardFooter className="gap-2">
        <Button variant="outline" size="sm" asChild className="flex-1">
          <Link href={`/p/${orgSlug}/apps/catalog/${app.id}`}>
            Подробнее
          </Link>
        </Button>
        
        {connected ? (
          <Button variant="secondary" size="sm" disabled>
            <Check className="w-4 h-4 mr-1" />
            Подключено
          </Button>
        ) : (
          <Button 
            size="sm" 
            onClick={handleConnect}
            disabled={loading}
          >
            <Plus className="w-4 h-4 mr-1" />
            {loading ? '...' : 'Подключить'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
```

---

## 5. SUPERADMIN ПАНЕЛЬ

### 5.1 Страница управления каталогом

```tsx
// app/admin/public-apps/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Eye, BarChart } from 'lucide-react';
import Link from 'next/link';

export default function PublicAppsAdminPage() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadApps() {
      const res = await fetch('/api/admin/public-apps');
      const { apps } = await res.json();
      setApps(apps || []);
      setLoading(false);
    }
    loadApps();
  }, []);

  if (loading) return <div>Загрузка...</div>;

  return (
    <div className="container py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Публичный каталог приложений</h1>
          <p className="text-muted-foreground">Управление партнёрскими MiniApps</p>
        </div>
        
        <Button asChild>
          <Link href="/admin/public-apps/new">
            <Plus className="w-4 h-4 mr-2" />
            Добавить приложение
          </Link>
        </Button>
      </div>
      
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Приложение</TableHead>
            <TableHead>Партнёр</TableHead>
            <TableHead>Категория</TableHead>
            <TableHead>Подключений</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {apps.map((app: any) => (
            <TableRow key={app.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {app.featured && <span>⭐</span>}
                  <span className="font-medium">{app.name}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  @{app.bot_username}
                </div>
              </TableCell>
              <TableCell>{app.partner_name || '—'}</TableCell>
              <TableCell>
                <Badge variant="outline">{app.category}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <BarChart className="w-4 h-4" />
                  {app.connections_count || 0}
                </div>
              </TableCell>
              <TableCell>
                <Badge 
                  variant={app.status === 'active' ? 'default' : 'secondary'}
                >
                  {app.status}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/admin/public-apps/${app.id}`}>
                      <Edit className="w-4 h-4" />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/admin/public-apps/${app.id}/stats`}>
                      <Eye className="w-4 h-4" />
                    </Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

### 5.2 API для Superadmin

```typescript
// app/api/admin/public-apps/route.ts

import { createAdminServer } from '@/lib/supabase/admin';
import { requireSuperadmin } from '@/lib/auth/requireSuperadmin';

export async function GET(request: Request) {
  const { error: authError } = await requireSuperadmin();
  if (authError) {
    return Response.json({ error: authError }, { status: 403 });
  }
  
  const supabase = await createAdminServer();
  
  // Получить приложения со статистикой подключений
  const { data: apps, error } = await supabase
    .from('public_apps')
    .select(`
      *,
      connections:public_app_connections(count)
    `)
    .order('sort_order', { ascending: true });
  
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  
  // Преобразовать count
  const appsWithCount = apps.map(app => ({
    ...app,
    connections_count: app.connections?.[0]?.count || 0
  }));
  
  return Response.json({ apps: appsWithCount });
}

export async function POST(request: Request) {
  const { error: authError } = await requireSuperadmin();
  if (authError) {
    return Response.json({ error: authError }, { status: 403 });
  }
  
  const body = await request.json();
  const supabase = await createAdminServer();
  
  const { data: app, error } = await supabase
    .from('public_apps')
    .insert(body)
    .select()
    .single();
  
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  
  return Response.json({ app });
}
```

---

## 6. ИНТЕГРАЦИЯ VOTUM

### 6.1 Данные для каталога

| Поле | Значение |
|------|----------|
| **name** | Votum |
| **slug** | votum |
| **bot_username** | votumfit_bot |
| **category** | engagement |
| **short_description** | Мэтчинг запросов участников сообщества |
| **featured** | true |
| **status** | active |

### 6.2 Инструкции по подключению

1. Добавить @votumfit_bot в Telegram-группу
2. Дать боту права на чтение/отправку сообщений
3. Написать `/start` в группе
4. (Опционально) Отметить в Orbo, что бот подключён к группе

### 6.3 Трекинг подключений

После подключения Votum к организации:
1. Админ может указать, в каких группах установлен бот
2. Эта информация хранится в `public_app_connections.connected_groups`
3. В superadmin панели видна общая статистика

---

## 7. ФАЙЛЫ ДЛЯ СОЗДАНИЯ

```
# База данных
✅ db/migrations/184_public_apps_catalog.sql  # Применено

# API - Каталог
✅ app/api/apps/catalog/route.ts              # GET - список каталога
✅ app/api/apps/catalog/[appId]/route.ts      # GET - детали приложения
✅ app/api/apps/catalog/[appId]/connect/route.ts  # POST/DELETE - подключение

# API - Приложения организации
✅ app/api/apps/org/[orgId]/route.ts          # GET - все приложения орг

# API - Superadmin
✅ app/api/admin/public-apps/route.ts         # GET/POST - список/создание
✅ app/api/admin/public-apps/[appId]/route.ts # GET/PATCH/DELETE - управление

# UI - Страницы организации
✅ app/p/[org]/apps/page.tsx                  # Обновлено: единый список
✅ app/p/[org]/apps/catalog/page.tsx          # Каталог с фильтрами
✅ app/p/[org]/apps/catalog/[appId]/page.tsx  # Детали + подключение

# UI - Superadmin (TODO)
⬜ app/superadmin/public-apps/page.tsx        # Список (опционально)
⬜ app/superadmin/public-apps/new/page.tsx    # Создание (опционально)
⬜ app/superadmin/public-apps/[appId]/page.tsx # Редактирование (опционально)
```

---

## 8. ЧЕКЛИСТ РЕАЛИЗАЦИИ

### Фаза 1: База данных ✅ ГОТОВО
- [x] Создать миграцию `184_public_apps_catalog.sql`
- [x] Применить миграцию (orbo database)
- [x] Вставить данные Votum
- [x] Проверить таблицы public_apps, public_app_connections

### Фаза 2: API ✅ ГОТОВО
- [x] `/api/apps/catalog` — список каталога
- [x] `/api/apps/catalog/[appId]` — детали приложения
- [x] `/api/apps/catalog/[appId]/connect` — подключение/отключение
- [x] `/api/apps/org/[orgId]` — приложения организации (unified list)
- [x] `/api/admin/public-apps` — superadmin GET/POST
- [x] `/api/admin/public-apps/[appId]` — superadmin GET/PATCH/DELETE

### Фаза 3: UI организации ✅ ГОТОВО
- [x] Страница `/p/[org]/apps` — единый список (own + catalog)
- [x] Страница `/p/[org]/apps/catalog` — каталог с фильтрами
- [x] Страница `/p/[org]/apps/catalog/[appId]` — детали + подключение
- [x] Карточки приложений встроены в страницы

### Фаза 4: Superadmin (1 день)
- [ ] Страница `/admin/public-apps` — список
- [ ] Страница `/admin/public-apps/new` — добавление
- [ ] Страница `/admin/public-apps/[appId]` — редактирование

### Фаза 5: Тестирование (1 день)
- [ ] Подключение Votum к тестовой организации
- [ ] Отображение в едином списке
- [ ] Superadmin управление
- [ ] Деплой и проверка на проде

---

## 📊 МЕТРИКИ УСПЕХА

| Метрика | Цель |
|---------|------|
| Votum в каталоге | ✅ |
| Подключений Votum | ≥ 3 организации |
| Время подключения | < 1 минуты |
| Ошибки при подключении | 0 |

---

**Статус:** Ready for Implementation  
**Следующий шаг:** Создание миграции `180_public_apps_catalog.sql`

---

*Last Updated: 7 января 2026*

