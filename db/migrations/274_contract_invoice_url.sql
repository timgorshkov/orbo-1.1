-- Add invoice_url column to contracts table for verification invoice storage
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS invoice_url TEXT;

COMMENT ON COLUMN contracts.invoice_url IS
  'URL to the verification invoice (счёт на оплату) generated for contract verification';
