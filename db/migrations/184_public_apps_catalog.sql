-- ============================================================
-- Migration: 180_public_apps_catalog.sql
-- Description: Публичный каталог партнёрских приложений (MiniApps)
-- Date: 2026-01-07
-- ============================================================

-- ============================================================
-- ПУБЛИЧНЫЙ КАТАЛОГ ПРИЛОЖЕНИЙ
-- ============================================================

-- Каталог партнёрских/публичных приложений (управляется superadmin)
CREATE TABLE IF NOT EXISTS public_apps (
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

-- Индексы для public_apps
CREATE INDEX IF NOT EXISTS idx_public_apps_status ON public_apps(status);
CREATE INDEX IF NOT EXISTS idx_public_apps_category ON public_apps(category);
CREATE INDEX IF NOT EXISTS idx_public_apps_featured ON public_apps(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_public_apps_slug ON public_apps(slug);

-- ============================================================
-- ПОДКЛЮЧЕНИЯ ПРИЛОЖЕНИЙ К ОРГАНИЗАЦИЯМ
-- ============================================================

CREATE TABLE IF NOT EXISTS public_app_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Связи
  public_app_id UUID NOT NULL REFERENCES public_apps(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Кто подключил (UUID пользователя, без FK для совместимости)
  connected_by UUID,
  
  -- В каких группах установлено (обновляется вручную или через API)
  connected_groups JSONB DEFAULT '[]'::jsonb,
  -- Формат: [{chat_id: -123456, title: "Группа", connected_at: "2026-01-15T12:00:00Z"}]
  
  -- Статус
  status TEXT DEFAULT 'active',            -- 'active', 'paused', 'disconnected'
  
  -- Заметки (для админа организации)
  notes TEXT,
  
  UNIQUE(public_app_id, org_id)
);

-- Индексы для public_app_connections
CREATE INDEX IF NOT EXISTS idx_public_app_connections_org ON public_app_connections(org_id);
CREATE INDEX IF NOT EXISTS idx_public_app_connections_app ON public_app_connections(public_app_id);
CREATE INDEX IF NOT EXISTS idx_public_app_connections_status ON public_app_connections(status);

-- ============================================================
-- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
-- ============================================================

-- Получить приложения организации (подключённые + собственные)
CREATE OR REPLACE FUNCTION get_org_all_apps(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  icon_url TEXT,
  app_type TEXT,           -- 'own' или 'catalog'
  source_id UUID,          -- apps.id или public_apps.id
  miniapp_url TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  -- Собственные приложения (из конструктора, таблица apps)
  SELECT 
    a.id,
    a.name,
    a.description,
    a.icon as icon_url,       -- в таблице apps колонка называется 'icon'
    'own'::TEXT as app_type,
    a.id as source_id,
    NULL::TEXT as miniapp_url, -- в apps нет miniapp_url, добавим позже
    a.status,
    a.created_at
  FROM apps a
  WHERE a.org_id = p_org_id
    AND a.status != 'archived'
  
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
    COUNT(*) FILTER (WHERE pac.status = 'active')::BIGINT as active_connections,
    (
      SELECT COALESCE(SUM(jsonb_array_length(connected_groups)), 0)::BIGINT
      FROM public_app_connections
      WHERE public_app_id = p_app_id AND status = 'active'
    ) as total_groups
  FROM public_app_connections pac
  WHERE pac.public_app_id = p_app_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE public_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_app_connections ENABLE ROW LEVEL SECURITY;

-- Public apps: все аутентифицированные могут читать активные
DROP POLICY IF EXISTS "Public apps are viewable by authenticated users" ON public_apps;
CREATE POLICY "Public apps are viewable by authenticated users"
  ON public_apps FOR SELECT
  TO authenticated
  USING (status = 'active');

-- Public apps: superadmin может всё (проверка на уровне API)
-- RLS отключён, авторизация на уровне приложения
DROP POLICY IF EXISTS "Superadmin can manage public apps" ON public_apps;

-- Connections: RLS отключён, авторизация на уровне приложения
DROP POLICY IF EXISTS "Users can view own org connections" ON public_app_connections;
DROP POLICY IF EXISTS "Admins can manage org connections" ON public_app_connections;

-- ============================================================
-- НАЧАЛЬНЫЕ ДАННЫЕ: VOTUM
-- ============================================================

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
  E'## Votum — умный мэтчинг для сообществ\n\nVotum помогает участникам вашего сообщества находить друг друга:\n\n- 📝 **Запросы** — участники публикуют что ищут\n- 💡 **Предложения** — бот находит релевантные предложения\n- 🤝 **Мэтчинг** — автоматическое соединение нужных людей\n\n### Как это работает\n\n1. Участник пишет в чат свой запрос\n2. Votum анализирует запрос и ищет подходящие предложения\n3. Бот предлагает релевантные связи\n\n### Идеально для\n\n- Бизнес-клубов и нетворкинг-сообществ\n- Профессиональных комьюнити\n- Клиентских чатов с взаимопомощью',
  'votumfit_bot',
  't.me/votumfit_bot/app',
  't.me/votumfit_bot?startgroup=orbo_{org_id}',
  E'## Подключение Votum\n\n### Шаг 1: Добавьте бота в группу\n\n1. Откройте вашу Telegram-группу\n2. Нажмите на название группы → "Добавить участников"\n3. Найдите @votumfit_bot и добавьте\n\n### Шаг 2: Дайте боту права\n\nДля полноценной работы бот должен:\n- Читать сообщения\n- Отправлять сообщения\n\n### Шаг 3: Активируйте\n\nНапишите в группе `/start` — бот активируется и пришлёт приветствие.\n\n### Готово!\n\nТеперь участники могут публиковать запросы, а Votum будет искать мэтчи.',
  '["Мэтчинг запросов", "Автоматический поиск", "Нетворкинг", "Telegram MiniApp"]'::jsonb,
  'engagement',
  '["нетворкинг", "запросы", "мэтчинг", "b2b", "комьюнити"]'::jsonb,
  'Votum Team',
  'https://t.me/votumfit_bot',
  'active',
  true,
  1
) ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description = EXCLUDED.full_description,
  bot_username = EXCLUDED.bot_username,
  miniapp_url = EXCLUDED.miniapp_url,
  setup_instructions = EXCLUDED.setup_instructions,
  features = EXCLUDED.features,
  category = EXCLUDED.category,
  tags = EXCLUDED.tags,
  partner_name = EXCLUDED.partner_name,
  partner_website = EXCLUDED.partner_website,
  status = EXCLUDED.status,
  featured = EXCLUDED.featured,
  updated_at = NOW();

-- ============================================================
-- КОММЕНТАРИИ
-- ============================================================

COMMENT ON TABLE public_apps IS 'Публичный каталог партнёрских Telegram MiniApps';
COMMENT ON TABLE public_app_connections IS 'Подключения приложений из каталога к организациям';
COMMENT ON FUNCTION get_org_all_apps IS 'Получить все приложения организации (собственные + из каталога)';
COMMENT ON FUNCTION get_public_app_stats IS 'Статистика подключений приложения для superadmin';

