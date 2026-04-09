-- Migration 276: Agent reports (отчёты агента)
-- Ежемесячные отчёты-акты для организаторов: реестр продаж, возвратов, сумм к перечислению

CREATE TABLE IF NOT EXISTS agent_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id),

  report_number TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Суммы
  total_sales_amount NUMERIC(10,2) NOT NULL DEFAULT 0,      -- Общая сумма продаж (номинал билетов)
  total_service_fee NUMERIC(10,2) NOT NULL DEFAULT 0,       -- Сервисный сбор (доход агента)
  total_agent_commission NUMERIC(10,2) NOT NULL DEFAULT 0,   -- Агентское вознаграждение (для юрлиц)
  total_refunds NUMERIC(10,2) NOT NULL DEFAULT 0,           -- Возвраты
  total_to_transfer NUMERIC(10,2) NOT NULL DEFAULT 0,       -- К перечислению принципалу
  total_transferred NUMERIC(10,2) NOT NULL DEFAULT 0,       -- Фактически перечислено

  -- Количества
  sales_count INTEGER NOT NULL DEFAULT 0,
  refunds_count INTEGER NOT NULL DEFAULT 0,

  -- Документ
  document_url TEXT,       -- ссылка на HTML/PDF в S3

  -- Статус
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'sent', 'accepted')),

  -- Мета
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_reports_org ON agent_reports(org_id);
CREATE INDEX IF NOT EXISTS idx_agent_reports_period ON agent_reports(org_id, period_start);
CREATE INDEX IF NOT EXISTS idx_agent_reports_status ON agent_reports(status);

-- Нумерация отчётов
CREATE SEQUENCE IF NOT EXISTS agent_report_number_seq START WITH 1;

CREATE OR REPLACE FUNCTION generate_agent_report_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'ОА-' || LPAD(nextval('agent_report_number_seq')::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- updated_at trigger
CREATE OR REPLACE TRIGGER trg_agent_reports_updated_at
  BEFORE UPDATE ON agent_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE agent_reports IS 'Отчёты агента за период. Содержат реестр продаж, возвратов и сумм к перечислению организатору.';
