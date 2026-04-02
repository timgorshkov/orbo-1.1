-- 267: Система договоров — контрагенты, расчётные счета, договоры

-- Контрагенты (физлица и юрлица/ИП)
CREATE TABLE IF NOT EXISTS counterparties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('individual', 'legal_entity')),

  -- Общие поля
  inn TEXT,
  email TEXT,
  phone TEXT,

  -- Физлицо
  full_name TEXT,
  passport_series_number TEXT,
  passport_issued_by TEXT,
  passport_issue_date DATE,
  registration_address TEXT,
  passport_photo_1_url TEXT,
  passport_photo_2_url TEXT,

  -- Юрлицо / ИП
  org_name TEXT,
  kpp TEXT,
  ogrn TEXT,
  legal_address TEXT,
  signatory_name TEXT,
  signatory_position TEXT,
  vat_rate TEXT CHECK (vat_rate IS NULL OR vat_rate IN ('none', '5', '7', '22')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_counterparties_org ON counterparties(org_id);

-- Расчётные счета (версионные — старые не удаляются)
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty_id UUID NOT NULL REFERENCES counterparties(id) ON DELETE CASCADE,

  bik TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  correspondent_account TEXT NOT NULL,
  settlement_account TEXT NOT NULL,
  transfer_comment TEXT,

  status TEXT NOT NULL DEFAULT 'filled_by_client'
    CHECK (status IN ('filled_by_client', 'active', 'inactive')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_counterparty ON bank_accounts(counterparty_id);

-- Нумерация договоров
CREATE SEQUENCE IF NOT EXISTS contract_number_seq START WITH 1;

CREATE OR REPLACE FUNCTION generate_contract_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'ЛД-' || LPAD(nextval('contract_number_seq')::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Договоры
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  counterparty_id UUID NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,

  contract_number TEXT NOT NULL UNIQUE,
  contract_date DATE NOT NULL DEFAULT CURRENT_DATE,

  status TEXT NOT NULL DEFAULT 'filled_by_client'
    CHECK (status IN ('filled_by_client', 'verified', 'signed', 'terminated')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_org ON contracts(org_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);

-- Триггеры updated_at
CREATE OR REPLACE FUNCTION contracts_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS counterparties_updated_at ON counterparties;
CREATE TRIGGER counterparties_updated_at BEFORE UPDATE ON counterparties
  FOR EACH ROW EXECUTE FUNCTION contracts_update_updated_at();

DROP TRIGGER IF EXISTS bank_accounts_updated_at ON bank_accounts;
CREATE TRIGGER bank_accounts_updated_at BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION contracts_update_updated_at();

DROP TRIGGER IF EXISTS contracts_updated_at ON contracts;
CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION contracts_update_updated_at();
