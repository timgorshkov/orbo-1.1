-- Migration 279: Unified accounting documents table (acts, UPDs)
-- Date: 2026-04-15
-- Purpose:
--   Единое хранилище структурированных бухгалтерских документов:
--     - subscription_act       (АЛ-NNN, акт лицензии на тариф)
--     - agent_commission_upd   (АВ-NNN, УПД на агентское вознаграждение)
--   Таблица хранит реквизиты сторон снапшотом, позиции, итоги, ссылки на HTML и
--   сгенерированный CommerceML XML. Используется для печати и выгрузки в 1С.

-- ═══════════════════════════════════════════════════════════════════
-- 1. accounting_documents table
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.accounting_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  doc_type        TEXT NOT NULL
                  CHECK (doc_type IN ('subscription_act', 'agent_commission_upd')),
  doc_number      TEXT NOT NULL UNIQUE,
  doc_date        DATE NOT NULL,

  -- Период (для актов подписки и ежемесячных УПД)
  period_start    DATE,
  period_end      DATE,

  -- Связи
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE SET NULL,
  org_invoice_id  UUID REFERENCES public.org_invoices(id) ON DELETE SET NULL,
  agent_report_id UUID REFERENCES public.agent_reports(id) ON DELETE SET NULL,
  contract_id     UUID REFERENCES public.contracts(id) ON DELETE SET NULL,

  -- Реквизиты сторон (снапшот JSONB).
  -- supplier_requisites: { name, inn, kpp, ogrn, legal_address, bank_name, bik, settlement_account,
  --                        correspondent_account, signatory_name, signatory_position, tax_system }
  -- customer_requisites: { name, inn, kpp?, ogrn?, legal_address?, email?, phone?,
  --                        signatory_name?, signatory_position? }
  supplier_requisites JSONB NOT NULL,
  customer_requisites JSONB NOT NULL,
  customer_type   TEXT NOT NULL
                  CHECK (customer_type IN ('individual', 'legal_entity', 'self_employed')),

  -- Позиции: [{ name, unit, unit_code, quantity, price, sum, vat_rate }]
  lines           JSONB NOT NULL,
  total_amount    NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
  currency        TEXT NOT NULL DEFAULT 'RUB',

  -- Артефакты
  html_url        TEXT,                -- S3 URL на HTML-версию для печати
  xml_content     TEXT,                -- сгенерированный CommerceML (ленивая генерация)

  status          TEXT NOT NULL DEFAULT 'generated'
                  CHECK (status IN ('draft', 'generated', 'sent', 'accepted', 'cancelled')),
  metadata        JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.accounting_documents IS
  'Структурированные бухгалтерские документы ООО Орбо (акты и УПД) для печати и выгрузки в 1С/CommerceML.';
COMMENT ON COLUMN public.accounting_documents.doc_type IS
  'subscription_act — АЛ-NNN, акт лицензии на тариф. agent_commission_upd — АВ-NNN, УПД на агентское вознаграждение.';
COMMENT ON COLUMN public.accounting_documents.supplier_requisites IS
  'Снапшот реквизитов продавца (ООО Орбо) на момент генерации документа.';
COMMENT ON COLUMN public.accounting_documents.customer_requisites IS
  'Снапшот реквизитов покупателя/принципала на момент генерации документа.';
COMMENT ON COLUMN public.accounting_documents.lines IS
  'Позиции документа: JSONB массив объектов с name/unit/quantity/price/sum/vat_rate.';
COMMENT ON COLUMN public.accounting_documents.html_url IS
  'URL сгенерированного HTML-файла в S3 bucket "documents".';
COMMENT ON COLUMN public.accounting_documents.xml_content IS
  'Сохранённый CommerceML XML (генерируется лениво при первой выгрузке).';

CREATE INDEX IF NOT EXISTS idx_accounting_documents_org_date
  ON public.accounting_documents (org_id, doc_date DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_documents_type_date
  ON public.accounting_documents (doc_type, doc_date DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_documents_period
  ON public.accounting_documents (period_start, period_end)
  WHERE period_start IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_documents_invoice
  ON public.accounting_documents (org_invoice_id)
  WHERE org_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_documents_agent_report
  ON public.accounting_documents (agent_report_id)
  WHERE agent_report_id IS NOT NULL;

-- Идемпотентность: не плодить дубликаты УПД за один и тот же период.
-- Для subscription_act уникальность гарантирует org_invoice_id (один акт на инвойс),
-- для agent_commission_upd — пара (org_id, period_start, period_end).
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_documents_subscription_act_invoice
  ON public.accounting_documents (org_invoice_id)
  WHERE doc_type = 'subscription_act' AND org_invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_documents_commission_upd_period
  ON public.accounting_documents (org_id, period_start, period_end)
  WHERE doc_type = 'agent_commission_upd';

-- ═══════════════════════════════════════════════════════════════════
-- 2. Sequence for agent commission UPD numbers (АВ-1, АВ-2, ...)
-- ═══════════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS public.agent_commission_upd_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

COMMENT ON SEQUENCE public.agent_commission_upd_seq IS
  'Sequential number for agent commission UPDs. Format: АВ-{seq}.';

CREATE OR REPLACE FUNCTION public.next_agent_commission_upd_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  v_next := nextval('public.agent_commission_upd_seq');
  RETURN 'АВ-' || v_next;
END;
$$;

COMMENT ON FUNCTION public.next_agent_commission_upd_number IS
  'Returns next agent commission UPD number in format АВ-{seq}.';

-- ═══════════════════════════════════════════════════════════════════
-- 3. updated_at trigger
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_accounting_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_accounting_documents_updated_at ON public.accounting_documents;
CREATE TRIGGER trg_accounting_documents_updated_at
  BEFORE UPDATE ON public.accounting_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_accounting_documents_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- 4. Link column on org_invoices → accounting_documents (soft link)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.org_invoices
  ADD COLUMN IF NOT EXISTS accounting_document_id UUID
    REFERENCES public.accounting_documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.org_invoices.accounting_document_id IS
  'Ссылка на структурированный бух. документ (акт лицензии) — предпочтительный путь поверх act_number/act_document_url.';

CREATE INDEX IF NOT EXISTS idx_org_invoices_accounting_doc
  ON public.org_invoices (accounting_document_id)
  WHERE accounting_document_id IS NOT NULL;

DO $$ BEGIN RAISE NOTICE 'Migration 279 complete: accounting_documents table + agent_commission_upd_seq.'; END $$;
