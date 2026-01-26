-- ============================================
-- Applications System (CRM для заявок)
-- ============================================
-- Универсальная система заявок:
-- - На вступление в группу (join_request)
-- - На услуги/продукты (service)
-- - Кастомные типы
-- ============================================

-- ============================================
-- 1. Воронки (Pipelines)
-- ============================================
CREATE TABLE IF NOT EXISTS application_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,                    -- "Вступление в клуб", "Заявки на консультацию"
  description TEXT,
  
  -- Тип воронки
  pipeline_type TEXT NOT NULL CHECK (pipeline_type IN ('join_request', 'service', 'custom')) DEFAULT 'custom',
  
  -- Привязка к TG группе (для join_request)
  telegram_group_id BIGINT REFERENCES telegram_groups(tg_chat_id) ON DELETE SET NULL,
  
  is_default BOOLEAN DEFAULT false,      -- Воронка по умолчанию для типа
  is_active BOOLEAN DEFAULT true,
  
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы
CREATE INDEX idx_application_pipelines_org ON application_pipelines(org_id);
CREATE INDEX idx_application_pipelines_type ON application_pipelines(org_id, pipeline_type);
CREATE INDEX idx_application_pipelines_tg_group ON application_pipelines(telegram_group_id) WHERE telegram_group_id IS NOT NULL;

-- ============================================
-- 2. Статусы воронки (Pipeline Stages)
-- ============================================
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES application_pipelines(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,                    -- "Новая", "Ожидает анкету", "Одобрено"
  slug TEXT NOT NULL,                    -- "new", "pending_form", "approved"
  color TEXT DEFAULT '#6B7280',          -- Цвет для UI (hex)
  position INT NOT NULL,                 -- Порядок в воронке (1, 2, 3...)
  
  -- Поведение
  is_initial BOOLEAN DEFAULT false,      -- Начальный статус (куда попадают новые заявки)
  is_terminal BOOLEAN DEFAULT false,     -- Терминальный статус (нельзя двигать дальше)
  terminal_type TEXT CHECK (terminal_type IN ('success', 'failure', NULL)),
  
  -- Автоматизации при входе в статус
  auto_actions JSONB DEFAULT '{}'::jsonb,
  /*
  {
    "send_message_template_id": "uuid",
    "approve_telegram": true,
    "reject_telegram": true,
    "ban_telegram": true,
    "restrict_telegram": true,
    "notify_admins": true
  }
  */
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(pipeline_id, slug),
  UNIQUE(pipeline_id, position)
);

-- Индексы
CREATE INDEX idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id);
CREATE INDEX idx_pipeline_stages_initial ON pipeline_stages(pipeline_id) WHERE is_initial = true;

-- ============================================
-- 3. Формы заявок (Application Forms)
-- ============================================
CREATE TABLE IF NOT EXISTS application_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES application_pipelines(id) ON DELETE CASCADE,
  
  -- Основное
  name TEXT NOT NULL,                    -- Внутреннее название
  slug TEXT,                             -- URL-friendly имя (опционально)
  
  -- Лендинг (первый экран MiniApp)
  landing JSONB DEFAULT '{}'::jsonb,
  /*
  {
    "title": "Клуб предпринимателей",
    "subtitle": "Сообщество для тех, кто строит бизнес",
    "description": "Markdown описание...",
    "cover_image_url": "https://...",
    "background_color": "#1a1a2e",
    "text_color": "#ffffff",
    "accent_color": "#4f46e5",
    "show_member_count": true,
    "show_org_logo": true,
    "benefits": [
      {"icon": "users", "text": "500+ участников"},
      {"icon": "calendar", "text": "Еженедельные встречи"}
    ],
    "cta_button_text": "Подать заявку"
  }
  */
  
  -- Поля формы (второй экран)
  form_schema JSONB DEFAULT '[]'::jsonb,
  /*
  [
    {
      "id": "name",
      "type": "text",
      "label": "Имя",
      "placeholder": "Ваше имя",
      "required": true,
      "prefill": "telegram_name"
    },
    {
      "id": "company",
      "type": "text",
      "label": "Компания"
    },
    {
      "id": "role",
      "type": "select",
      "label": "Роль",
      "options": ["Founder", "CEO", "Employee"],
      "required": true
    },
    {
      "id": "goal",
      "type": "textarea",
      "label": "Зачем хотите вступить?",
      "required": true,
      "max_length": 500
    }
  ]
  */
  
  -- Страница успеха (третий экран)
  success_page JSONB DEFAULT '{}'::jsonb,
  /*
  {
    "title": "Заявка отправлена!",
    "message": "Мы рассмотрим её в течение 24 часов",
    "show_status_link": true,
    "additional_buttons": [
      {"text": "Наш канал", "url": "https://t.me/..."}
    ]
  }
  */
  
  -- Настройки
  settings JSONB DEFAULT '{}'::jsonb,
  /*
  {
    "require_form": true,
    "form_reminder_hours": 24,
    "form_timeout_hours": 48,
    "form_timeout_action": "reject",
    "auto_approve_conditions": {
      "form_filled": true,
      "spam_score_below": 30
    },
    "spam_detection": {
      "enabled": true,
      "auto_reject_score": 80,
      "checks": {
        "no_photo": 30,
        "no_username": 20,
        "empty_bio": 15,
        "new_account_days": 7,
        "suspicious_name": 25,
        "already_banned": 100
      }
    },
    "welcome_message_template_id": "uuid",
    "notify_admins_on_new": true
  }
  */
  
  is_active BOOLEAN DEFAULT true,
  
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы
CREATE INDEX idx_application_forms_org ON application_forms(org_id);
CREATE INDEX idx_application_forms_pipeline ON application_forms(pipeline_id);
CREATE INDEX idx_application_forms_slug ON application_forms(org_id, slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_application_forms_active ON application_forms(org_id) WHERE is_active = true;

-- ============================================
-- 4. Источники/UTM (Application Sources)
-- ============================================
-- Для отслеживания маркетинговых кампаний
CREATE TABLE IF NOT EXISTS application_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES application_forms(id) ON DELETE CASCADE,
  
  -- Короткий код для deep link
  code TEXT NOT NULL UNIQUE,             -- 6-8 символов, например "abc123"
  
  -- UTM параметры
  utm_source TEXT,                       -- facebook, google, telegram
  utm_medium TEXT,                       -- cpc, email, social
  utm_campaign TEXT,                     -- spring_sale, launch_2024
  utm_term TEXT,                         -- ключевые слова
  utm_content TEXT,                      -- вариант объявления
  
  -- Дополнительные параметры (для реферальных программ и т.д.)
  ref_code TEXT,                         -- Код реферала/партнёра
  custom_params JSONB DEFAULT '{}'::jsonb,
  
  -- Название для UI
  name TEXT,                             -- "Facebook Ads - Январь 2026"
  
  -- Статистика (денормализация для быстрого доступа)
  applications_count INT DEFAULT 0,
  approved_count INT DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы
CREATE INDEX idx_application_sources_form ON application_sources(form_id);
CREATE INDEX idx_application_sources_code ON application_sources(code);
CREATE INDEX idx_application_sources_utm ON application_sources(form_id, utm_source, utm_campaign);

-- ============================================
-- 5. Заявки (Applications)
-- ============================================
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES application_forms(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  
  -- Связь с участником
  participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  
  -- Telegram данные (для join_request)
  tg_user_id BIGINT,
  tg_chat_id BIGINT,
  tg_join_request_date TIMESTAMPTZ,
  
  -- Данные пользователя на момент заявки (snapshot)
  tg_user_data JSONB DEFAULT '{}'::jsonb,
  /*
  {
    "user_id": 123456,
    "username": "ivan",
    "first_name": "Иван",
    "last_name": "Петров",
    "photo_url": "...",
    "bio": "..."
  }
  */
  
  -- Заполненная анкета
  form_data JSONB DEFAULT '{}'::jsonb,
  /*
  {
    "name": "Иван Петров",
    "company": "ООО Рога",
    "role": "CEO",
    "goal": "Хочу найти партнёров"
  }
  */
  form_filled_at TIMESTAMPTZ,
  
  -- Spam scoring
  spam_score INT DEFAULT 0,              -- 0-100
  spam_reasons TEXT[] DEFAULT '{}',      -- ["no_photo", "empty_bio"]
  
  -- UTM/источник
  source_id UUID REFERENCES application_sources(id) ON DELETE SET NULL,
  utm_data JSONB DEFAULT '{}'::jsonb,    -- Копия UTM на момент создания
  /*
  {
    "utm_source": "facebook",
    "utm_medium": "cpc",
    "utm_campaign": "spring_sale",
    "ref_code": "partner123"
  }
  */
  
  -- Обработка
  processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,                            -- Внутренние заметки админа
  
  -- Напоминания
  form_reminder_sent_at TIMESTAMPTZ,
  form_timeout_at TIMESTAMPTZ,           -- Когда истечёт время на заполнение
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы
CREATE INDEX idx_applications_org ON applications(org_id);
CREATE INDEX idx_applications_form ON applications(form_id);
CREATE INDEX idx_applications_stage ON applications(stage_id);
CREATE INDEX idx_applications_participant ON applications(participant_id) WHERE participant_id IS NOT NULL;
CREATE INDEX idx_applications_tg_user ON applications(tg_user_id) WHERE tg_user_id IS NOT NULL;
CREATE INDEX idx_applications_tg_chat ON applications(tg_chat_id) WHERE tg_chat_id IS NOT NULL;
CREATE INDEX idx_applications_source ON applications(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX idx_applications_created ON applications(org_id, created_at DESC);
CREATE INDEX idx_applications_pending_form ON applications(form_timeout_at) 
  WHERE form_filled_at IS NULL AND form_timeout_at IS NOT NULL;

-- ============================================
-- 6. История заявки (Application Events)
-- ============================================
CREATE TABLE IF NOT EXISTS application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL,
  /*
    'created'           - Заявка создана
    'stage_changed'     - Перемещение по воронке
    'form_sent'         - Отправлена ссылка на анкету
    'form_filled'       - Анкета заполнена
    'form_reminder'     - Напоминание об анкете
    'form_timeout'      - Истекло время на анкету
    'message_sent'      - Отправлено сообщение
    'approved'          - Одобрено (терминальный)
    'rejected'          - Отклонено (терминальный)
    'spam_detected'     - Помечено как спам
    'tg_approved'       - Принят в TG группу
    'tg_rejected'       - Отклонён в TG
    'tg_banned'         - Забанен в TG
    'note_added'        - Добавлена заметка
  */
  
  actor_type TEXT CHECK (actor_type IN ('user', 'system', 'automation')),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Данные события
  data JSONB DEFAULT '{}'::jsonb,
  /*
  Примеры:
  stage_changed: {"from_stage_id": "...", "to_stage_id": "..."}
  message_sent: {"template_id": "...", "message_preview": "..."}
  spam_detected: {"score": 75, "reasons": ["no_photo", "new_account"]}
  */
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы
CREATE INDEX idx_application_events_app ON application_events(application_id);
CREATE INDEX idx_application_events_type ON application_events(application_id, event_type);
CREATE INDEX idx_application_events_created ON application_events(application_id, created_at DESC);

-- ============================================
-- 7. Шаблоны сообщений (Message Templates)
-- ============================================
CREATE TABLE IF NOT EXISTS application_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,                    -- "Приветствие", "Запрос анкеты"
  
  -- Триггер (когда отправлять автоматически)
  trigger TEXT CHECK (trigger IN (
    'manual',              -- Только вручную
    'on_application_new',  -- При новой заявке
    'on_form_request',     -- При запросе анкеты
    'on_form_reminder',    -- Напоминание об анкете
    'on_approved',         -- При одобрении
    'on_rejected',         -- При отклонении
    'on_stage_enter'       -- При входе в статус (указать stage_id)
  )) DEFAULT 'manual',
  
  trigger_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  
  -- Контент
  message_text TEXT NOT NULL,            -- Поддержка переменных: {name}, {org_name}, {form_link}
  
  -- Медиа (опционально)
  has_image BOOLEAN DEFAULT false,
  image_url TEXT,
  
  -- Кнопки (опционально)
  buttons JSONB DEFAULT '[]'::jsonb,
  /*
  [
    {"text": "Заполнить анкету", "url": "{form_link}"},
    {"text": "Наш канал", "url": "https://t.me/..."}
  ]
  */
  
  is_active BOOLEAN DEFAULT true,
  
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы
CREATE INDEX idx_app_msg_templates_org ON application_message_templates(org_id);
CREATE INDEX idx_app_msg_templates_trigger ON application_message_templates(org_id, trigger) WHERE is_active = true;

-- ============================================
-- 8. Кастомные боты организаций (опционально)
-- ============================================
CREATE TABLE IF NOT EXISTS org_custom_bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Тип бота
  bot_purpose TEXT NOT NULL CHECK (bot_purpose IN ('applications', 'notifications', 'events', 'general')),
  
  -- Telegram данные
  bot_token TEXT NOT NULL,
  bot_username TEXT NOT NULL,
  bot_id BIGINT,
  
  -- Webhook
  webhook_url TEXT,
  webhook_secret TEXT,
  
  is_active BOOLEAN DEFAULT true,
  
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(org_id, bot_purpose)
);

-- Индексы
CREATE INDEX idx_org_custom_bots_org ON org_custom_bots(org_id);
CREATE INDEX idx_org_custom_bots_username ON org_custom_bots(bot_username);

-- ============================================
-- Триггеры
-- ============================================

-- Обновление updated_at
CREATE OR REPLACE FUNCTION update_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION update_applications_updated_at();

CREATE TRIGGER application_pipelines_updated_at
  BEFORE UPDATE ON application_pipelines
  FOR EACH ROW
  EXECUTE FUNCTION update_applications_updated_at();

CREATE TRIGGER application_forms_updated_at
  BEFORE UPDATE ON application_forms
  FOR EACH ROW
  EXECUTE FUNCTION update_applications_updated_at();

CREATE TRIGGER pipeline_stages_updated_at
  BEFORE UPDATE ON pipeline_stages
  FOR EACH ROW
  EXECUTE FUNCTION update_applications_updated_at();

-- Обновление счётчиков источников
CREATE OR REPLACE FUNCTION update_source_counters()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.source_id IS NOT NULL THEN
    UPDATE application_sources 
    SET applications_count = applications_count + 1
    WHERE id = NEW.source_id;
  END IF;
  
  IF TG_OP = 'UPDATE' THEN
    -- Если заявка стала approved (терминальный success)
    IF NEW.stage_id != OLD.stage_id AND NEW.source_id IS NOT NULL THEN
      -- Проверяем, что новый статус - терминальный success
      PERFORM 1 FROM pipeline_stages 
      WHERE id = NEW.stage_id AND is_terminal = true AND terminal_type = 'success';
      
      IF FOUND THEN
        UPDATE application_sources 
        SET approved_count = approved_count + 1
        WHERE id = NEW.source_id;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER applications_source_counters
  AFTER INSERT OR UPDATE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION update_source_counters();

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE application_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_custom_bots ENABLE ROW LEVEL SECURITY;

-- Политики для application_pipelines
CREATE POLICY pipelines_org_read ON application_pipelines
  FOR SELECT USING (user_is_member_of_org(org_id));

CREATE POLICY pipelines_org_write ON application_pipelines
  FOR ALL USING (user_is_org_admin(org_id));

-- Политики для pipeline_stages
CREATE POLICY stages_read ON pipeline_stages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM application_pipelines p 
      WHERE p.id = pipeline_stages.pipeline_id 
      AND user_is_member_of_org(p.org_id)
    )
  );

CREATE POLICY stages_write ON pipeline_stages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM application_pipelines p 
      WHERE p.id = pipeline_stages.pipeline_id 
      AND user_is_org_admin(p.org_id)
    )
  );

-- Политики для application_forms
CREATE POLICY forms_org_read ON application_forms
  FOR SELECT USING (user_is_member_of_org(org_id));

CREATE POLICY forms_org_write ON application_forms
  FOR ALL USING (user_is_org_admin(org_id));

-- Политики для application_sources
CREATE POLICY sources_read ON application_sources
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM application_forms f 
      WHERE f.id = application_sources.form_id 
      AND user_is_member_of_org(f.org_id)
    )
  );

CREATE POLICY sources_write ON application_sources
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM application_forms f 
      WHERE f.id = application_sources.form_id 
      AND user_is_org_admin(f.org_id)
    )
  );

-- Политики для applications
CREATE POLICY applications_org_read ON applications
  FOR SELECT USING (user_is_member_of_org(org_id));

CREATE POLICY applications_org_write ON applications
  FOR ALL USING (user_is_org_admin(org_id));

-- Политики для application_events
CREATE POLICY events_read ON application_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM applications a 
      WHERE a.id = application_events.application_id 
      AND user_is_member_of_org(a.org_id)
    )
  );

CREATE POLICY events_write ON application_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM applications a 
      WHERE a.id = application_events.application_id 
      AND user_is_org_admin(a.org_id)
    )
  );

-- Политики для message_templates
CREATE POLICY templates_org_read ON application_message_templates
  FOR SELECT USING (user_is_member_of_org(org_id));

CREATE POLICY templates_org_write ON application_message_templates
  FOR ALL USING (user_is_org_admin(org_id));

-- Политики для custom_bots
CREATE POLICY bots_org_read ON org_custom_bots
  FOR SELECT USING (user_is_member_of_org(org_id));

CREATE POLICY bots_org_write ON org_custom_bots
  FOR ALL USING (user_is_org_admin(org_id));

-- ============================================
-- Комментарии к таблицам
-- ============================================
COMMENT ON TABLE application_pipelines IS 'Воронки заявок (вступление, услуги, кастомные)';
COMMENT ON TABLE pipeline_stages IS 'Статусы/этапы воронки с автоматизациями';
COMMENT ON TABLE application_forms IS 'Формы заявок с лендингом и полями анкеты';
COMMENT ON TABLE application_sources IS 'UTM источники для отслеживания маркетинговых кампаний';
COMMENT ON TABLE applications IS 'Заявки (основная таблица CRM)';
COMMENT ON TABLE application_events IS 'История всех действий по заявке';
COMMENT ON TABLE application_message_templates IS 'Шаблоны сообщений для автоматизаций';
COMMENT ON TABLE org_custom_bots IS 'Кастомные Telegram боты организаций';

