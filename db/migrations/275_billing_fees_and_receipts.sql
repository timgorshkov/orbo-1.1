-- Migration 275: Billing fees separation + fiscal receipts
-- Разделение единой commission_rate на service_fee_rate + agent_commission_rate
-- Добавление полей сервисного сбора в payment_sessions и event_registrations
-- Таблица фискальных чеков (без отправки в ОФД на текущем этапе)
-- Таблица доходов платформы (сервисные сборы и агентское вознаграждение)

-- ═══════════════════════════════════════════════════════════════════
-- 1. Разделение сборов в org_accounts
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE org_accounts
  ADD COLUMN IF NOT EXISTS service_fee_rate NUMERIC(5,4) NOT NULL DEFAULT 0.1000,
  ADD COLUMN IF NOT EXISTS agent_commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0000;

COMMENT ON COLUMN org_accounts.commission_rate IS 'DEPRECATED. Использовать service_fee_rate + agent_commission_rate';
COMMENT ON COLUMN org_accounts.service_fee_rate IS 'Сервисный сбор (выделяется из стоимости для участника). 0.1000 = 10% для физлиц, 0.0500 = 5% для юрлиц';
COMMENT ON COLUMN org_accounts.agent_commission_rate IS 'Агентское вознаграждение (удерживается из баланса организатора). 0.0000 для физлиц, 0.0500 для юрлиц';

-- ═══════════════════════════════════════════════════════════════════
-- 2. Сервисный сбор в payment_sessions
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE payment_sessions
  ADD COLUMN IF NOT EXISTS ticket_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS service_fee_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS service_fee_rate NUMERIC(5,4);

COMMENT ON COLUMN payment_sessions.ticket_price IS 'Номинальная цена билета (без сервисного сбора)';
COMMENT ON COLUMN payment_sessions.service_fee_amount IS 'Сумма сервисного сбора Orbo';
COMMENT ON COLUMN payment_sessions.service_fee_rate IS 'Ставка сервисного сбора на момент оплаты (снэпшот)';
-- amount = ticket_price + service_fee_amount (полная сумма, которую платит участник)

-- ═══════════════════════════════════════════════════════════════════
-- 3. Сервисный сбор в event_registrations
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS service_fee_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2);

COMMENT ON COLUMN event_registrations.service_fee_amount IS 'Сервисный сбор для данной регистрации';
COMMENT ON COLUMN event_registrations.total_amount IS 'Итого к оплате участником (price + service_fee_amount). price хранит номинальную стоимость билета';
-- price = номинальная стоимость билета (выделена из стоимости для участника)

-- ═══════════════════════════════════════════════════════════════════
-- 4. Новые типы транзакций в леджере
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE org_transactions DROP CONSTRAINT IF EXISTS org_transactions_type_check;
ALTER TABLE org_transactions ADD CONSTRAINT org_transactions_type_check
  CHECK (type IN (
    'payment_incoming',
    'commission_deduction',
    'agent_commission',
    'withdrawal_requested',
    'withdrawal_completed',
    'withdrawal_rejected',
    'refund',
    'commission_reversal',
    'agent_commission_reversal',
    'adjustment'
  ));

-- ═══════════════════════════════════════════════════════════════════
-- 5. Таблица фискальных чеков
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fiscal_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_session_id UUID REFERENCES payment_sessions(id) ON DELETE SET NULL,
  event_registration_id UUID REFERENCES event_registrations(id) ON DELETE SET NULL,

  -- Тип чека
  receipt_type TEXT NOT NULL CHECK (receipt_type IN (
    'income',
    'income_return',
    'expense',
    'correction'
  )),

  -- Статус обработки
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN (
    'created',
    'pending',
    'succeeded',
    'failed',
    'cancelled'
  )),

  -- Суммы
  total_amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',

  -- Позиции чека (JSONB массив)
  -- Каждая позиция: { name, amount, quantity, vat_rate, vat_amount,
  --   is_agent_item, supplier_name, supplier_inn, supplier_phone,
  --   payment_method_type (тег 1214), payment_subject_type (тег 1212) }
  items JSONB NOT NULL DEFAULT '[]',

  -- Способ оплаты
  payment_method TEXT CHECK (payment_method IN ('electronic', 'card', 'cash', 'prepaid', 'other')),

  -- Данные покупателя (для электронного чека)
  customer_email TEXT,
  customer_phone TEXT,

  -- Данные ОФД (заполняются после отправки)
  ofd_provider TEXT,
  fiscal_document_number TEXT,
  fiscal_sign TEXT,
  fiscal_receipt_number INTEGER,
  shift_number INTEGER,
  fn_number TEXT,
  kkt_reg_number TEXT,
  ofd_receipt_url TEXT,
  ofd_response JSONB,

  -- Связь с предыдущим чеком (для возвратов)
  original_receipt_id UUID REFERENCES fiscal_receipts(id),

  -- Ошибки
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  -- Мета
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_receipts_org ON fiscal_receipts(org_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_receipts_session ON fiscal_receipts(payment_session_id) WHERE payment_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fiscal_receipts_status ON fiscal_receipts(status);
CREATE INDEX IF NOT EXISTS idx_fiscal_receipts_type ON fiscal_receipts(receipt_type);

COMMENT ON TABLE fiscal_receipts IS 'Фискальные чеки. Формируются при каждой оплате, отправляются в ОФД (когда провайдер будет подключён).';

-- ═══════════════════════════════════════════════════════════════════
-- 6. Таблица доходов платформы
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform_income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_session_id UUID REFERENCES payment_sessions(id) ON DELETE SET NULL,
  event_registration_id UUID REFERENCES event_registrations(id) ON DELETE SET NULL,

  income_type TEXT NOT NULL CHECK (income_type IN (
    'service_fee',
    'agent_commission',
    'service_fee_refund',
    'agent_commission_refund'
  )),

  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_income_org ON platform_income(org_id);
CREATE INDEX IF NOT EXISTS idx_platform_income_type ON platform_income(income_type);
CREATE INDEX IF NOT EXISTS idx_platform_income_created ON platform_income(created_at);
CREATE INDEX IF NOT EXISTS idx_platform_income_session ON platform_income(payment_session_id) WHERE payment_session_id IS NOT NULL;

COMMENT ON TABLE platform_income IS 'Доходы платформы ОРБО: сервисные сборы и агентское вознаграждение.';

-- ═══════════════════════════════════════════════════════════════════
-- 7. Обновлённая RPC: record_incoming_payment_v2
-- Новая версия с разделением сервисного сбора и агентского вознаграждения
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_incoming_payment_v2(
  p_org_id                UUID,
  p_total_amount          NUMERIC,       -- полная сумма от участника
  p_ticket_price          NUMERIC,       -- номинальная цена билета
  p_service_fee_amount    NUMERIC,       -- сервисный сбор (= total - ticket)
  p_counterparty_type     TEXT DEFAULT 'individual',  -- 'individual' или 'legal_entity'
  p_currency              TEXT DEFAULT 'RUB',
  p_idempotency_key       TEXT DEFAULT NULL,
  p_event_registration_id UUID DEFAULT NULL,
  p_membership_payment_id UUID DEFAULT NULL,
  p_event_id              UUID DEFAULT NULL,
  p_participant_id        UUID DEFAULT NULL,
  p_payment_gateway       TEXT DEFAULT 'manual',
  p_external_payment_id   TEXT DEFAULT NULL,
  p_description           TEXT DEFAULT NULL,
  p_created_by            UUID DEFAULT NULL
)
RETURNS TABLE(
  payment_transaction_id       UUID,
  commission_transaction_id    UUID,   -- NULL для физлиц
  agent_commission_amount      NUMERIC,
  platform_service_fee         NUMERIC,
  organizer_net_amount         NUMERIC,
  new_balance                  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent_commission_rate    NUMERIC;
  v_agent_commission_amount  NUMERIC;
  v_current_balance          NUMERIC;
  v_balance_after_pay        NUMERIC;
  v_balance_after_comm       NUMERIC;
  v_pay_tx_id                UUID;
  v_comm_tx_id               UUID;
  v_idem_key_comm            TEXT;
BEGIN
  -- Validate
  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Total amount must be positive: %', p_total_amount;
  END IF;

  IF p_ticket_price <= 0 THEN
    RAISE EXCEPTION 'Ticket price must be positive: %', p_ticket_price;
  END IF;

  IF p_service_fee_amount < 0 THEN
    RAISE EXCEPTION 'Service fee cannot be negative: %', p_service_fee_amount;
  END IF;

  -- Verify that ticket_price + service_fee = total_amount
  IF ABS(p_ticket_price + p_service_fee_amount - p_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'ticket_price (%) + service_fee (%) != total_amount (%)',
      p_ticket_price, p_service_fee_amount, p_total_amount;
  END IF;

  -- Ensure org_account exists, lock it for serialization
  INSERT INTO public.org_accounts (org_id)
  VALUES (p_org_id)
  ON CONFLICT (org_id) DO NOTHING;

  SELECT agent_commission_rate INTO v_agent_commission_rate
  FROM public.org_accounts
  WHERE org_id = p_org_id
  FOR UPDATE;

  -- Для физлиц agent_commission = 0
  IF p_counterparty_type = 'individual' OR v_agent_commission_rate = 0 THEN
    v_agent_commission_amount := 0;
  ELSE
    v_agent_commission_amount := ROUND(p_ticket_price * v_agent_commission_rate, 2);
  END IF;

  -- Get current balance (lock latest row to serialize concurrent writes)
  SELECT balance_after INTO v_current_balance
  FROM public.org_transactions
  WHERE org_id = p_org_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    v_current_balance := 0;
  END IF;

  -- 1) Insert incoming payment (только номинальная цена билета, не полная сумма)
  v_balance_after_pay := v_current_balance + p_ticket_price;
  v_pay_tx_id := gen_random_uuid();

  INSERT INTO public.org_transactions (
    id, org_id, type, amount, currency, balance_after,
    event_registration_id, membership_payment_id, event_id,
    participant_id, payment_gateway, external_payment_id,
    idempotency_key, description, created_by
  ) VALUES (
    v_pay_tx_id, p_org_id, 'payment_incoming', p_ticket_price, p_currency, v_balance_after_pay,
    p_event_registration_id, p_membership_payment_id, p_event_id,
    p_participant_id, p_payment_gateway, p_external_payment_id,
    p_idempotency_key, p_description, p_created_by
  );

  -- 2) For legal entities: insert agent commission deduction
  v_balance_after_comm := v_balance_after_pay;
  v_comm_tx_id := NULL;

  IF v_agent_commission_amount > 0 THEN
    v_balance_after_comm := v_balance_after_pay - v_agent_commission_amount;

    IF p_idempotency_key IS NOT NULL THEN
      v_idem_key_comm := p_idempotency_key || '_agent_commission';
    END IF;

    v_comm_tx_id := gen_random_uuid();

    INSERT INTO public.org_transactions (
      id, org_id, type, amount, currency, balance_after,
      event_registration_id, membership_payment_id, event_id,
      participant_id, idempotency_key, description, created_by
    ) VALUES (
      v_comm_tx_id, p_org_id, 'agent_commission', -v_agent_commission_amount, p_currency, v_balance_after_comm,
      p_event_registration_id, p_membership_payment_id, p_event_id,
      p_participant_id, v_idem_key_comm,
      'Агентское вознаграждение ' || ROUND(v_agent_commission_rate * 100, 1) || '%',
      p_created_by
    );

    -- Record agent commission in platform_income
    INSERT INTO public.platform_income (
      org_id, payment_session_id, event_registration_id,
      income_type, amount, currency
    ) VALUES (
      p_org_id, NULL, p_event_registration_id,
      'agent_commission', v_agent_commission_amount, p_currency
    );
  END IF;

  -- 3) Record service fee in platform_income (always, for both individual and legal)
  IF p_service_fee_amount > 0 THEN
    INSERT INTO public.platform_income (
      org_id, payment_session_id, event_registration_id,
      income_type, amount, currency
    ) VALUES (
      p_org_id, NULL, p_event_registration_id,
      'service_fee', p_service_fee_amount, p_currency
    );
  END IF;

  -- Return results
  RETURN QUERY SELECT
    v_pay_tx_id,
    v_comm_tx_id,
    v_agent_commission_amount,
    p_service_fee_amount,
    (p_ticket_price - v_agent_commission_amount),
    v_balance_after_comm;
END;
$$;

COMMENT ON FUNCTION public.record_incoming_payment_v2 IS
  'Атомарно записывает оплату: ticket_price → баланс организатора, service_fee → platform_income, agent_commission (юрлица) → удержание из баланса + platform_income.';

-- ═══════════════════════════════════════════════════════════════════
-- 8. Триггер updated_at для fiscal_receipts
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE TRIGGER trg_fiscal_receipts_updated_at
  BEFORE UPDATE ON fiscal_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
