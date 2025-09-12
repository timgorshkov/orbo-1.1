#PRD — Orbo MVP (Cursor × Vercel × Supabase)

## 0) Цель спринта

- Собрать демонстрабельный MVP:
- Подключение Telegram-группы через бота и базовый учёт участников.
- Мини-дашборд активности (число участников, прирост/отток, базовые события).
- Профили участников (публичные/админские, быстрый поиск).
- База материалов (простая древовидная структура + доступы).
- События с пригласительной ссылкой и QR-чекином.
- Регистрация/вход клиентов, мультитеннантность (организации/рабочие пространства).

## 1) Стек и развёртывание

Frontend: Next.js 14 (App Router) + TypeScript + TailwindCSS; деплой на Vercel.
Backend: Next.js API routes (edge/Node runtime по месту), server actions; часть логики — Supabase Edge Functions при необходимости.
БД/аутентификация/файлы: Supabase (Postgres + Supabase Auth + Storage).
Реал-тайм: Supabase Realtime (каналы «org_id:*»).
Очереди/вебхуки: Supabase Functions (или простые API routes) + cron (Vercel Cron) для периодики.
Телеграм-бот: Node (grammY/telegraf) в /api/telegram/webhook (вебхук), секреты в env.

## 2) Пользовательские роли и мультитеннантность

User (Supabase Auth): базовая учётка.
Organization (Workspace): владелец сообщества/клуба. Пользователь ↔ Организация — через memberships с ролями:
owner, admin, member, viewer.

Все бизнес-таблицы имеют org_id. RLS разрешает доступ только членам соответствующей организации, с дифференциацией по ролям.

## 3) Основные пользовательские сценарии (MVP)

- Регистрация, создание организации, приглашение команды.
- Подключение Telegram-группы (бот админом), первичная синхронизация участников.
- Профили участников: авто-черновик из Telegram + донаполнение пользователем.
- Материалы: создание разделов/страниц/файлов, назначение доступов группам/персонам.
- События: карточка, ссылка «добавить в календарь», QR-код; чекин → отметка посещения.
- Дашборд: активные/новые/вышедшие участники за период; «список внимания» (спящие).

## 4) Страницы (Next.js)

/signin, /signup — Supabase Auth (email OTP/magic link), позже добавим Telegram Login Widget.
/app — выбор организации (если >1), быстрый онбординг.
/app/:org/dashboard — мини-дашборд.
/app/:org/telegram — подключение бота, статус групп, перезапуск синка.
/app/:org/members — участники, поиск/фильтры, профили.
/app/:org/materials — древо материалов; просмотр/поиск.
/app/:org/events — список, создание; /app/:org/events/:id — детали + QR/ссылка.

Публичные:

/p/:org/members/:id — публичный профиль (опционально).
/p/:org/events/:id — посадочная события (регистрация/добавить в календарь).

Сервисные:

/api/telegram/webhook — обработчик обновлений бота.
/api/events/:id/checkin — GET по токену из QR (без логина, с валидацией).

## 5) Схема БД (Supabase SQL)
-- Организации
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  plan text default 'free'
);

-- Пользователи (auth.users — от Supabase). Привязки к оргам:
create table public.memberships (
  org_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('owner','admin','member','viewer')) not null default 'member',
  primary key (org_id, user_id),
  created_at timestamptz default now()
);

-- Telegram-группы, подключенные к организации
create table public.telegram_groups (
  id bigserial primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  tg_chat_id bigint not null unique,
  title text,
  invite_link text,
  bot_status text, -- 'pending'|'connected'|'error'
  last_sync_at timestamptz
);

-- Участники (могут быть не пользователями Supabase)
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  tg_user_id bigint,
  username text,
  full_name text,
  phone text,
  email text,
  interests text[],
  created_at timestamptz default now()
);

-- Связи участник <-> телеграм-группа
create table public.participant_groups (
  participant_id uuid references public.participants(id) on delete cascade,
  tg_group_id bigint references public.telegram_groups(tg_chat_id) on delete cascade,
  joined_at timestamptz,
  left_at timestamptz,
  primary key (participant_id, tg_group_id)
);

-- События активности (минимально для дашборда)
create table public.activity_events (
  id bigserial primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  type text check (type in ('join','leave','message','checkin')),
  participant_id uuid references public.participants(id),
  tg_group_id bigint,
  meta jsonb,
  created_at timestamptz default now()
);

-- Материалы (простая иерархия)
create table public.material_folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  parent_id uuid references public.material_folders(id),
  name text not null,
  created_at timestamptz default now()
);

create table public.material_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  folder_id uuid references public.material_folders(id) on delete set null,
  kind text check (kind in ('doc','file','link')) not null,
  title text not null,
  content text,      -- для kind='doc'
  file_path text,    -- для kind='file' (Supabase Storage path)
  url text,          -- для kind='link'
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Доступы на материалы (по группам и/или точечно по участникам)
create table public.material_access (
  id bigserial primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  item_id uuid references public.material_items(id) on delete cascade,
  tg_group_id bigint,             -- если доступ для всей TG-группы
  participant_id uuid,            -- если точечный доступ
  unique (item_id, tg_group_id, participant_id)
);

-- События (ивенты)
create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  visibility text check (visibility in ('public','members')) default 'members',
  calendar_url text, -- сгенерированный .ics или deeplink
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Билеты/регистрация на событие
create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete cascade,
  status text check (status in ('invited','registered','checked_in')) default 'registered',
  qr_token text unique not null, -- одноразовый/временной токен для чек-ина
  created_at timestamptz default now()
);

RLS (ключевые политики)
-- Включаем RLS
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.telegram_groups enable row level security;
alter table public.participants enable row level security;
alter table public.participant_groups enable row level security;
alter table public.activity_events enable row level security;
alter table public.material_folders enable row level security;
alter table public.material_items enable row level security;
alter table public.material_access enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;

-- Хелпер: функция проверки членства
create or replace function public.is_org_member(_org uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.memberships m
    where m.org_id = _org and m.user_id = auth.uid()
  )
$$;

-- Примеры политик (аналогично для остальных таблиц):
create policy org_read on public.telegram_groups
for select using (public.is_org_member(org_id));

create policy org_crud_admin on public.telegram_groups
for all using (public.is_org_member(org_id))
with check (
  exists (select 1 from public.memberships 
          where org_id = telegram_groups.org_id 
            and user_id = auth.uid() 
            and role in ('owner','admin'))
);

-- Для публичных эндпоинтов (QR чек-ин) используем RPC/edge-функцию без прямого select.

## 6) Интеграция с Telegram

Бот #1 (админ-бот): добавляется админом в группу с правами администратора.

Функции: ловить member_joined, member_left, базовые message события (счётчики), команды /status, /resync.

Webhook: POST /api/telegram/webhook (проверка секретного токена).

Первичная синхронизация: ограниченно — начинаем с текущего состава участников и событий «вперёд», без глубокого парсинга истории (чтобы не зависеть от ограничений Telegram API).

Безопасность: валидация X-Telegram-Bot-Api-Secret-Token, mapping tg_chat_id → org_id.

## 7) API контуры (Next.js API routes)

POST /api/telegram/webhook: приём апдейтов; добавление/обновление участников, запись событий в activity_events.

POST /api/orgs: создать организацию (текущий пользователь становится owner).

GET /api/:org/dashboard: агрегаты: активные, новые, покинувшие за 7/30 дней; топ групп/участников (по количеству сообщений).

POST /api/:org/events: создать событие; генерировать qr_token для регистраций.

GET /api/events/checkin?token=...: возврат 302 на страницу “успешно отмечен” + отметка в БД (без логина).

Материалы:

POST /api/:org/materials (создать doc/link/загрузить файл → Supabase Storage).

POST /api/:org/materials/:id/access (назначить доступ группе/участнику).

NB: В Cursor удобно генерировать stubs и затем докручивать.

## 8) Storage

Supabase Storage bucket materials/{org_id}/...

Правила доступа: только через подписанные URL, генерация в server actions; в GUI — список файлов с пред-подписанными ссылками.

## 9) Онбординг и wow-эффект

Шаги:

- Создай организацию → получи ссылку пригласить бота.
- Добавь бота в группу админом → жми «Проверить статус».
- Сразу видишь: N участников, +X за 7 дней, базовый список последних вступлений/выходов.
- Включи авто-приветствие (тумблер) → бот начнёт собирать интересы.
- Микро-вау: показывается «список внимания» (участники без активности >14 дней).

## 10) Тариф и лимиты (для MVP)

Freemium: до 50 участников в организации, 1 Telegram-группа, 1 ГБ Storage.
Pro (позже): больше групп, участников, Storage; базовая цена от 3 000 ₽/мес.

## 11) Безопасность

Supabase RLS строго по org_id.

Telegram webhook с секретом и IP-фильтрацией (по возможности).

QR-токены: одноразовые, TTL 24 часа, хэшированные (например, sha256(token+pepper)), храним хэш; по GET сравниваем.

## 12) Набор переменных окружения (.env)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_WEBHOOK_URL=https://<vercel-app>/api/telegram/webhook

# Для генерации подписанных ссылок / cron
JWT_SECRET=

## 13) Репо-структура (Cursor)
/app
  /(auth)/signin/page.tsx
  /(auth)/signup/page.tsx
  /app/[org]/dashboard/page.tsx
  /app/[org]/telegram/page.tsx
  /app/[org]/members/page.tsx
  /app/[org]/materials/page.tsx
  /app/[org]/events/page.tsx
  /p/[org]/members/[id]/page.tsx
  /p/[org]/events/[id]/page.tsx
/api
  /telegram/webhook/route.ts
  /events/checkin/route.ts
  /orgs/route.ts
  /[org]/dashboard/route.ts
  /[org]/events/route.ts
  /[org]/materials/route.ts
/lib (supabase client, RLS helpers, zod схемы)
/db (sql миграции, seed)
/components (ui)
/styles

## 14) Тестирование и критерии приёмки

Smoke-тест (ручной):

 Регистрация, создание организации, добавление второго пользователя.

 Подключение Telegram-бота, получение первых апдейтов (join/leave).

 Появление участника в списке, отображение базовой статистики.

 Создание материала (doc/link/file) + доступ группе → участник открывает.

 Создание события → генерится ссылка, QR → чек-ин отмечает статус.

 Публичная страница события доступна, приватная — нет (если visibility=members).

 Freemium лимиты срабатывают.

Нагрузочная «лайт»:

5k апдейтов/час от бота не кладут обработчик (batch insert, upsert).

## 15. Аналитика (basic)

PostHog/Umami: события org_created, bot_connected, first_member_synced, event_created, checkin_done, material_created.

Простейшие North Star: кол-во активных организаций/неделю; доля орг с включённым авто-welcome; доля орг, где создано ≥1 событие в 2 недели.

## 16. Сниппеты 

### 16.1 .env (локально + Vercel)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
TELEGRAM_WEBHOOK_URL=https://<your-app>.vercel.app/api/telegram/webhook

JWT_SECRET=change_me

### 16.2 /lib/supabaseClient.ts (SSR/CSR клиенты)
// /lib/supabaseClient.ts
import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

export function createClientBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export function createClientServer() {
  const cookieStore = cookies()
  const hdrs = headers()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: name => cookieStore.get(name)?.value,
        set: (name, value, opts) => {
          cookieStore.set({ name, value, ...opts })
        },
        remove: (name, opts) => cookieStore.set({ name, value: '', ...opts }),
      },
      headers: {
        get: (key: string) => hdrs.get(key) ?? undefined,
      },
    }
  )
}

### 16.3 /lib/orgGuard.ts (RLS-guard + org_id контекст)
// /lib/orgGuard.ts
import { createClientServer } from './supabaseClient'

export async function requireOrgAccess(orgId: string) {
  const supabase = createClientServer()
  const {
    data: { user },
    error: userErr
  } = await supabase.auth.getUser()
  if (userErr || !user) throw new Error('Unauthorized')

  // Проверяем членство в org через RLS-friendly RPC (создай функцию в БД при миграции)
  const { data, error } = await supabase.rpc('is_org_member_rpc', { _org: orgId })
  if (error || !data) throw new Error('Forbidden')
  return { supabase, user }
}


SQL для RPC-функции:

-- в миграции
create or replace function public.is_org_member_rpc(_org uuid)
returns boolean language sql stable security definer as $$
  select exists(
    select 1 from public.memberships m
    where m.org_id = _org and m.user_id = auth.uid()
  );
$$;

### 16.4 Базовые UI-компоненты (shadcn/ui vibe)

Установи shadcn/ui (или используй простые Tailwind-компоненты). Ниже — минимальные, самодостаточные версии без внешних зависимостей.

// /components/ui/card.tsx
import * as React from 'react'
import clsx from 'clsx'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("rounded-2xl border bg-white shadow-sm", className)} {...props} />
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("p-5 border-b bg-white/60 rounded-t-2xl", className)} {...props} />
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <h3 className={clsx("text-lg font-semibold tracking-tight", className)} {...props} />
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("p-5", className)} {...props} />
}

// /components/ui/button.tsx
import * as React from 'react'
import clsx from 'clsx'

export function Button({ className, variant='default', ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & {variant?: 'default'|'ghost'|'outline'}) {
  const base = "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition"
  const styles = {
    default: "bg-black text-white hover:bg-black/85",
    ghost: "bg-transparent hover:bg-black/5",
    outline: "border border-black/10 hover:bg-black/5"
  }
  return <button className={clsx(base, styles[variant], className)} {...props} />
}

// /components/ui/input.tsx
import * as React from 'react'
import clsx from 'clsx'
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) =>
    <input ref={ref} className={clsx("w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10", className)} {...props} />
)
Input.displayName = 'Input'

### 16.5 Левая навигация + Shell (Circle/Notion-виб)
// /components/app-shell.tsx
import Link from 'next/link'
import { ReactNode } from 'react'
import clsx from 'clsx'

export default function AppShell({ orgId, children }: { orgId: string, children: ReactNode }) {
  const nav = [
    { href: `/app/${orgId}/dashboard`, label: 'Дашборд' },
    { href: `/app/${orgId}/telegram`, label: 'Telegram' },
    { href: `/app/${orgId}/members`, label: 'Участники' },
    { href: `/app/${orgId}/materials`, label: 'Материалы' },
    { href: `/app/${orgId}/events`, label: 'События' },
  ]
  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="w-64 shrink-0 border-r bg-white/70 backdrop-blur">
        <div className="p-4 font-semibold">Orbo</div>
        <nav className="px-2 space-y-1">
          {nav.map(i => (
            <Link key={i.href} href={i.href} className={clsx(
              "block rounded-xl px-3 py-2 text-sm hover:bg-black/5"
            )}>{i.label}</Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}

### 16.6 Мини-дашборд (страница)
// /app/app/[org]/dashboard/page.tsx
import { requireOrgAccess } from '@/lib/orgGuard'
import AppShell from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClientServer } from '@/lib/supabaseClient'

export default async function Dashboard({ params: { org } }: { params: { org: string }}) {
  const { supabase } = await requireOrgAccess(org)

  const { data: stats } = await supabase.rpc('org_dashboard_stats', { _org: org }) // см. SQL ниже

  return (
    <AppShell orgId={org}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader><CardTitle>Участников</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{stats?.total_participants ?? 0}</div></CardContent>
        </Card>
        <Card><CardHeader><CardTitle>+ за 7 дней</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{stats?.new_7d ?? 0}</div></CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Вышло 7 дней</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{stats?.left_7d ?? 0}</div></CardContent>
        </Card>
      </div>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Последние события</CardTitle></CardHeader>
          <CardContent>
            {/* Для MVP: простая таблица; ниже — пример запроса на клиенте/сервере */}
            <RecentActivity orgId={org} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

async function RecentActivity({ orgId }: { orgId: string }) {
  const supabase = createClientServer()
  const { data } = await supabase
    .from('activity_events')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(10)
  return (
    <ul className="space-y-2">
      {(data ?? []).map(ev => (
        <li key={ev.id} className="text-sm text-neutral-700">
          <span className="inline-flex min-w-20 uppercase text-xs mr-2 rounded-md bg-black/5 px-2 py-1">{ev.type}</span>
          {ev.created_at}
        </li>
      ))}
    </ul>
  )
}


RPC для агрегатов:

create or replace function public.org_dashboard_stats(_org uuid)
returns json language sql stable security definer as $$
  with totals as (
    select
      (select count(*) from participants p where p.org_id = _org) as total_participants,
      (select count(*) from activity_events e where e.org_id = _org and e.type='join' and e.created_at >= now() - interval '7 days') as new_7d,
      (select count(*) from activity_events e where e.org_id = _org and e.type='leave' and e.created_at >= now() - interval '7 days') as left_7d
  )
  select to_json(totals) from totals;
$$;

### 16.7 Подключение Telegram (страница + действия)
// /app/app/[org]/telegram/page.tsx
import AppShell from '@/components/app-shell'
import { requireOrgAccess } from '@/lib/orgGuard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClientServer } from '@/lib/supabaseClient'

export default async function TelegramPage({ params: { org } }: { params: { org: string }}) {
  await requireOrgAccess(org)
  return (
    <AppShell orgId={org}>
      <Card>
        <CardHeader><CardTitle>Подключение Telegram-группы</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-neutral-600">
            1) Пригласите бота в вашу группу и назначьте администратором.
          </p>
          <p className="text-sm text-neutral-600">
            2) Нажмите «Проверить статус», чтобы начать синхронизацию участников и событий.
          </p>
          <form action={checkStatus}>
            <input type="hidden" name="org" value={org} />
            <Button type="submit">Проверить статус</Button>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  )
}

async function checkStatus(formData: FormData) {
  'use server'
  const org = String(formData.get('org'))
  const { supabase } = await (await import('@/lib/orgGuard')).requireOrgAccess(org)
  // здесь можно дернуть edge function или обновить статус группы
  await supabase.from('telegram_groups').update({ last_sync_at: new Date().toISOString() }).eq('org_id', org)
}

### 16.8 Webhook бота (минимальный)
// /app/api/telegram/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClientServer } from '@/lib/supabaseClient'

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET!
  if (req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const body = await req.json()
  // минимальная обработка: join/leave + message → activity_events
  const supabase = createClientServer()

  try {
    if (body?.my_chat_member) {
      // бот добавлен/изменены права — можно отметить bot_status
    }
    if (body?.chat_member) {
      // участник присоединился/вышел
    }
    if (body?.message) {
      const msg = body.message
      const chatId = msg.chat?.id
      const from = msg.from
      // 1) upsert участника
      if (from && chatId) {
        const { data: orgRow } = await supabase
          .from('telegram_groups')
          .select('org_id')
          .eq('tg_chat_id', chatId)
          .single()

        if (orgRow?.org_id) {
          const { data: p } = await supabase
            .from('participants')
            .upsert({
              org_id: orgRow.org_id,
              tg_user_id: from.id,
              username: from.username ?? null,
              full_name: [from.first_name, from.last_name].filter(Boolean).join(' ')
            }, { onConflict: 'org_id,tg_user_id' })
            .select('id').single()

          await supabase.from('activity_events').insert({
            org_id: orgRow.org_id,
            type: 'message',
            participant_id: p?.id,
            tg_group_id: chatId,
            meta: { message_id: msg.message_id }
          })
        }
      }
    }
  } catch (e) {
    console.error('tg webhook error', e)
  }
  return NextResponse.json({ ok: true })
}

### 16.9 Материалы (страница-лист с духом Notion)
// /app/app/[org]/materials/page.tsx
import AppShell from '@/components/app-shell'
import { requireOrgAccess } from '@/lib/orgGuard'
import { createClientServer } from '@/lib/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default async function MaterialsPage({ params: { org } }: { params: { org: string }}) {
  const { supabase } = await requireOrgAccess(org)
  const { data: items } = await supabase
    .from('material_items')
    .select('id, title, kind, created_at')
    .eq('org_id', org)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <AppShell orgId={org}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Материалы</h1>
        <form action={createDoc}>
          <input type="hidden" name="org" value={org} />
          <Button>+ Документ</Button>
        </form>
      </div>
      <div className="grid gap-3">
        {(items ?? []).map(x => (
          <Card key={x.id}>
            <CardHeader><CardTitle>{x.title}</CardTitle></CardHeader>
            <CardContent className="text-sm text-neutral-600">
              Тип: {x.kind} · {new Date(x.created_at).toLocaleString()}
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  )
}

async function createDoc(formData: FormData) {
  'use server'
  const org = String(formData.get('org'))
  const { supabase, user } = await (await import('@/lib/orgGuard')).requireOrgAccess(org)
  await supabase.from('material_items').insert({
    org_id: org, kind: 'doc', title: 'Новый документ', content: 'Черновик...', created_by: user.id
  })
}

### 16.10 События + QR check-in (публичная страница + API)
// /app/api/events/checkin/route.ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClientServer } from '@/lib/supabaseClient'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.redirect('/?checkin=missing')

  const hash = crypto.createHash('sha256').update(token + (process.env.JWT_SECRET!)).digest('hex')
  const supabase = createClientServer()

  const { data, error } = await supabase
    .from('event_registrations')
    .select('id, event_id, org_id')
    .eq('qr_token', token) // для MVP можно не хэш, если RLS и TTL в порядке
    .single()

  if (error || !data) return NextResponse.redirect('/?checkin=invalid')

  await supabase.from('event_registrations').update({ status: 'checked_in' }).eq('id', data.id)
  return NextResponse.redirect(`/p/${data.org_id}/events/${data.event_id}?checkin=ok`)
}

// /app/p/[org]/events/[id]/page.tsx (публичная карточка события)
import { createClientServer } from '@/lib/supabaseClient'

export default async function PublicEvent({ params: { org, id }, searchParams }:
  { params: { org: string, id: string }, searchParams: Record<string,string> }) {
  const supabase = createClientServer()
  const { data: ev } = await supabase.from('events').select('*').eq('id', id).single()
  if (!ev) return <div className="p-6">Событие не найдено</div>
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">{ev.title}</h1>
      <p className="text-neutral-600 mt-2">{ev.description}</p>
      <div className="mt-4 text-sm text-neutral-500">
        {new Date(ev.starts_at).toLocaleString()} {ev.ends_at ? `— ${new Date(ev.ends_at).toLocaleString()}` : ''}
      </div>
      {searchParams?.checkin === 'ok' && (
        <div className="mt-4 rounded-xl bg-green-50 border border-green-200 p-3 text-green-800">
          Вы успешно отметились на событии
        </div>
      )}
    </div>
  )
}

### 16.11 SQL миграция: индексы, мелкие доработки
create index on public.participants (org_id);
create index on public.participants (tg_user_id);
create index on public.activity_events (org_id, created_at);
create index on public.activity_events (org_id, type);
create index on public.material_items (org_id, created_at);
create index on public.events (org_id, starts_at);

-- Простейший seed
insert into public.organizations (id, name, plan) values
  ('11111111-1111-1111-1111-111111111111','Demo Org','free') on conflict do nothing;

-- Добавь себя как owner (поменяй user_id на свой из auth.users)
-- insert into public.memberships (org_id, user_id, role) values ('11111111-1111-1111-1111-111111111111', 'YOUR_AUTH_USER_UUID', 'owner');

### 16.12 Страницы входа/регистрации (Supabase Auth)
// /app/(auth)/signin/page.tsx
'use client'
import { useState } from 'react'
import { createClientBrowser } from '@/lib/supabaseClient'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function SignIn() {
  const [email, setEmail] = useState('')
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClientBrowser()
    await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/app' } })
    alert('Мы отправили ссылку для входа на email')
  }
  return (
    <div className="min-h-screen grid place-items-center">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3 bg-white border p-6 rounded-2xl">
        <h1 className="text-xl font-semibold">Вход в Orbo</h1>
        <Input placeholder="you@email"
               value={email}
               onChange={e => setEmail(e.target.value)} />
        <Button type="submit" className="w-full">Войти по ссылке</Button>
      </form>
    </div>
  )
}

### 16.13 Навигация «выбор организации» (/app)
// /app/app/page.tsx
import { createClientServer } from '@/lib/supabaseClient'
import Link from 'next/link'

export default async function AppRoot() {
  const supabase = createClientServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <div className="p-6">Необходимо <a href="/signin" className="underline">войти</a></div>

  const { data: orgs } = await supabase
    .from('memberships')
    .select('org_id, role, organizations(name)')
    .eq('user_id', user.id)

  if (!orgs?.length) return <div className="p-6">У вас нет организаций. (Добавить экран создания)</div>

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Ваши рабочие пространства</h1>
      <ul className="space-y-2">
        {orgs.map((m: any) => (
          <li key={m.org_id}>
            <Link className="text-black hover:underline" href={`/app/${m.org_id}/dashboard`}>
              {m.organizations?.name ?? m.org_id} — {m.role}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

### 16.14 Визуальные принципы (Circle/Notion vibe)

- Контрастные заголовки, плотные таблицы, мягкие карточки (rounded-2xl, shadow-sm).
- Навигация слева, рабочее полотно справа.
- Лаконичные состояния пустоты с CTA («Создайте событие», «Подключите бота»).
- Везде «быстрые действия» (кнопка справа в шапке списка).
- Типографика: text-neutral-800, подписи text-neutral-600.

### 16.15 Acceptance checklist (MVP demo)

- Регистрация → создание организации → выбор организации.
-  Подключение Telegram (минимум: статус и приём message событий).
-  Участники появляются/обновляются в списке.
-  Дашборд: total/new/left за 7 дней + последние события.
-  Материал (doc/link/file) создаётся и виден в списке.
-  Событие создаётся, публичная страница открывается, чек-ин по QR меняет статус.