-- Migration 284: opt-out flag for act generation on legacy invoices
-- Date: 2026-04-16
-- Purpose:
--   До регистрации ООО «Орбо» (конец февраля 2026) часть подписок оплачивались
--   напрямую физлицу-владельцу Orbo и к учёту ООО не относятся. По таким инвойсам
--   акты передачи прав не требуются и не должны показываться в блоке «Инвойсы без
--   акта» в суперадминке.
--
--   Добавляем явный флаг act_required. По умолчанию — TRUE (как для всех
--   новых инвойсов), чтобы поведение не менялось.

ALTER TABLE public.org_invoices
  ADD COLUMN IF NOT EXISTS act_required BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.org_invoices.act_required IS
  'Требуется ли формировать акт передачи прав по инвойсу. FALSE для оплат, '
  'относящихся к периоду до регистрации ООО «Орбо», или для прочих случаев, когда '
  'акт не нужен (согласовано с бухгалтерией). По умолчанию TRUE.';

-- Скрыть конкретные legacy-инвойсы февраля 2026 из списка «Инвойсы без акта».
UPDATE public.org_invoices
   SET act_required = FALSE
 WHERE paid_at::date IN (DATE '2026-02-24', DATE '2026-02-25')
   AND act_required = TRUE;

DO $$ BEGIN RAISE NOTICE 'Migration 284 complete: org_invoices.act_required added, 2 legacy invoices hidden.'; END $$;
